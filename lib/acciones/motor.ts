import "server-only";
import { and, count, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import {
  motivosDesperdicio,
  movimientoLineas,
  movimientos,
  productos,
  secaderoContenido,
  secaderos,
  tipos,
  type Estado,
  type Secadero,
  type TipoMovimiento,
} from "../db/schema";
import { ETIQUETA_ESTADO } from "../estados";
import type { Sesion } from "../session";
import { fallar, type Item, type Rotura } from "./comun";

export { ETIQUETA_ESTADO };

/** Secadero con los datos de su tipo resueltos, que es como lo usa el motor. */
export type SecaderoConTipo = Secadero & {
  tipoNombre: string;
  /** null = el tipo no tiene tope fijo. Ver `tipos` en el esquema. */
  capacidad: number | null;
  /** null = comparte el cupo general del horno. Ver `tipos` en el esquema. */
  cupoHorno: number | null;
};

/** Transaccion de Drizzle. Todo el motor trabaja adentro de una. */
type Tx = Parameters<
  Parameters<typeof import("../db").db.transaction>[0]
>[0];

/* -------------------------------------------------------------------------- */
/* Lecturas con bloqueo                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Trae los secaderos pedidos con `FOR UPDATE`. El bloqueo es lo que evita que
 * dos operarios que tienen la pantalla abierta muevan el mismo secadero a la
 * vez: el segundo espera y despues falla la validacion de estado esperado.
 */
export async function bloquearSecaderos(
  tx: Tx,
  ids: number[],
): Promise<SecaderoConTipo[]> {
  if (ids.length === 0) fallar("No seleccionaste ningún secadero.");
  // El bloqueo va sobre `secaderos`; el join con `tipos` es solo de lectura.
  const filas = await tx
    .select({
      secadero: secaderos,
      tipoNombre: tipos.nombre,
      capacidad: tipos.capacidad,
      cupoHorno: tipos.cupoHorno,
    })
    .from(secaderos)
    .innerJoin(tipos, eq(tipos.id, secaderos.tipoId))
    .where(inArray(secaderos.id, ids))
    .for("update", { of: secaderos });

  if (filas.length !== ids.length) {
    fallar("Alguno de los secaderos ya no existe. Actualizá la pantalla.");
  }
  return filas.map((f) => ({
    ...f.secadero,
    tipoNombre: f.tipoNombre,
    capacidad: f.capacidad,
    cupoHorno: f.cupoHorno,
  }));
}

export function exigirEstado(secadero: Secadero, esperado: Estado) {
  if (!secadero.activo) {
    fallar(`El secadero ${secadero.numero} está dado de baja.`);
  }
  if (secadero.estado !== esperado) {
    fallar(
      `El secadero ${secadero.numero} ya no está ${ETIQUETA_ESTADO[esperado]}: ` +
        `alguien lo pasó a ${ETIQUETA_ESTADO[secadero.estado]}. Actualizá la pantalla.`,
    );
  }
}

export async function contenidoActual(
  tx: Tx,
  secaderoId: number,
): Promise<Map<number, number>> {
  const filas = await tx
    .select()
    .from(secaderoContenido)
    .where(eq(secaderoContenido.secaderoId, secaderoId));
  return new Map(filas.map((f) => [f.productoId, f.cantidad]));
}

/* -------------------------------------------------------------------------- */
/* Catalogos                                                                  */
/* -------------------------------------------------------------------------- */

export type Catalogo = {
  productos: Map<
    number,
    { id: number; nombre: string; tipoId: number; tipoNombre: string; activo: boolean }
  >;
  motivos: Map<number, { id: number; nombre: string; activo: boolean }>;
};

export async function cargarCatalogo(
  tx: Tx,
  productoIds: number[],
  motivoIds: number[],
): Promise<Catalogo> {
  const prods = productoIds.length
    ? await tx
        .select({
          id: productos.id,
          nombre: productos.nombre,
          tipoId: productos.tipoId,
          tipoNombre: tipos.nombre,
          activo: productos.activo,
        })
        .from(productos)
        .innerJoin(tipos, eq(tipos.id, productos.tipoId))
        .where(inArray(productos.id, productoIds))
    : [];
  const mots = motivoIds.length
    ? await tx
        .select()
        .from(motivosDesperdicio)
        .where(inArray(motivosDesperdicio.id, motivoIds))
    : [];

  const catalogo: Catalogo = {
    productos: new Map(prods.map((p) => [p.id, p])),
    motivos: new Map(mots.map((m) => [m.id, m])),
  };

  for (const id of productoIds) {
    if (!catalogo.productos.has(id)) fallar("Un producto seleccionado no existe.");
  }
  for (const id of motivoIds) {
    if (!catalogo.motivos.has(id)) fallar("Un motivo seleccionado no existe.");
  }
  return catalogo;
}

/* -------------------------------------------------------------------------- */
/* Validaciones de negocio                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Un secadero solo lleva modelos de su mismo tipo, y el total no puede pasar
 * la capacidad que ese tipo tiene definida. Si el tipo no tiene tope fijo, la
 * cantidad es la que el operario diga: no hay contra que compararla.
 */
export function validarCarga(
  secadero: SecaderoConTipo,
  items: Item[],
  catalogo: Catalogo,
  { exigirActivos }: { exigirActivos: boolean },
) {
  const conCantidad = items.filter((i) => i.cantidad > 0);
  if (conCantidad.length === 0) {
    fallar("Cargá al menos un producto con cantidad mayor a cero.");
  }

  const vistos = new Set<number>();
  for (const item of conCantidad) {
    if (vistos.has(item.productoId)) {
      fallar("Hay un producto repetido en la carga.");
    }
    vistos.add(item.productoId);

    const producto = catalogo.productos.get(item.productoId)!;
    if (producto.tipoId !== secadero.tipoId) {
      fallar(
        `"${producto.nombre}" es de tipo ${producto.tipoNombre} y el secadero ${secadero.numero} es ${secadero.tipoNombre}.`,
      );
    }
    if (exigirActivos && !producto.activo) {
      fallar(`El producto "${producto.nombre}" está suspendido.`);
    }
  }

  const total = conCantidad.reduce((a, i) => a + i.cantidad, 0);
  if (secadero.capacidad !== null && total > secadero.capacidad) {
    fallar(
      `El secadero ${secadero.numero} (${secadero.tipoNombre}) admite hasta ${secadero.capacidad} placas y estás cargando ${total}.`,
    );
  }
}

/** Las roturas de una transicion salen de lo que el secadero tiene adentro. */
export function validarRoturasContraContenido(
  secadero: Secadero,
  roturas: Rotura[],
  contenido: Map<number, number>,
  catalogo: Catalogo,
) {
  const porProducto = new Map<number, number>();
  for (const r of roturas) {
    porProducto.set(r.productoId, (porProducto.get(r.productoId) ?? 0) + r.cantidad);
    const motivo = catalogo.motivos.get(r.motivoId)!;
    if (!motivo.activo) {
      fallar(`El motivo "${motivo.nombre}" está desactivado.`);
    }
  }

  for (const [productoId, rotas] of porProducto) {
    const disponible = contenido.get(productoId) ?? 0;
    const nombre = catalogo.productos.get(productoId)?.nombre ?? "ese producto";
    if (disponible === 0) {
      fallar(
        `El secadero ${secadero.numero} no tiene placas de "${nombre}" para descontar.`,
      );
    }
    if (rotas > disponible) {
      fallar(
        `Marcaste ${rotas} rotas de "${nombre}" pero el secadero ${secadero.numero} tiene ${disponible}.`,
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Escritura del movimiento                                                   */
/* -------------------------------------------------------------------------- */

export type Movida = {
  secadero: SecaderoConTipo;
  tipo: TipoMovimiento;
  estadoHasta: Estado;
  /** Placas que quedan en circuito por modelo. En una descarga, lo que va a PT. */
  cantidades: Map<number, number>;
  /** Lo que queda fisicamente adentro del secadero. En una descarga, vacio. */
  contenidoFinal: Map<number, number>;
  roturas: Rotura[];
  nota: string | null;
  /**
   * No cierra el tramo de estado: el secadero sigue contando el tiempo desde
   * que entro al estado en que ya estaba. Lo usa la correccion del admin
   * cuando arregla el contenido sin mover al secadero de estado; si reiniciara
   * el reloj, una correccion de tipeo se llevaria puesto el tiempo de horno
   * medido de ese secadero.
   */
  conservarInicioDeEstado?: boolean;
  /**
   * Si el movimiento reemplaza a otro que se acaba de anular. Ver `Reemplazo`.
   */
  reemplazo?: Reemplazo;
};

/**
 * Lo que un movimiento corregido hereda del original que reemplaza.
 *
 * La hora y el autor son los del original: la carga paso a las 10:14 y la hizo
 * Juan, aunque se haya corregido a las 10:42 o la haya corregido el admin.
 * Para cualquier reporte es la carga de ese dia, de esa persona. Quien corrigio
 * y cuando queda en el original anulado.
 *
 * Con la hora del original, la duracion del tramo sale sola y da lo mismo que
 * daba: el secadero se restaura al inicio de su estado anterior antes de
 * rehacer el movimiento.
 */
export type Reemplazo = {
  creadoEn: Date;
  autor: { uid: number; nombre: string };
  reemplazaA: number;
};

export async function aplicarMovida(
  tx: Tx,
  sesion: Sesion,
  catalogo: Catalogo,
  movida: Movida,
): Promise<number> {
  const {
    secadero,
    tipo,
    estadoHasta,
    cantidades,
    contenidoFinal,
    roturas,
    nota,
    conservarInicioDeEstado,
    reemplazo,
  } = movida;

  const ahora = reemplazo?.creadoEn ?? new Date();
  const autor = reemplazo?.autor ?? { uid: sesion.uid, nombre: sesion.nombre };
  const duracionMin = conservarInicioDeEstado
    ? null
    : Math.max(
        0,
        Math.round((ahora.getTime() - secadero.estadoDesde.getTime()) / 60000),
      );

  const [mov] = await tx
    .insert(movimientos)
    .values({
      secaderoId: secadero.id,
      secaderoNumero: secadero.numero,
      secaderoTipoId: secadero.tipoId,
      secaderoTipoNombre: secadero.tipoNombre,
      tipo,
      estadoDesde: secadero.estado,
      estadoHasta,
      usuarioId: autor.uid,
      usuarioNombre: autor.nombre,
      duracionMin,
      nota,
      creadoEn: ahora,
      reemplazaA: reemplazo?.reemplazaA ?? null,
    })
    .returning({ id: movimientos.id });

  // Un movimiento puede no tener lineas: por ejemplo, una correccion que deja
  // el secadero vacio. Insertar un array vacio seria un error de Drizzle.
  const lineas = construirLineas(mov.id, cantidades, roturas, catalogo);
  if (lineas.length > 0) {
    await tx.insert(movimientoLineas).values(lineas);
  }

  // El contenido vivo se reemplaza entero: es un snapshot, no un historial.
  await tx
    .delete(secaderoContenido)
    .where(eq(secaderoContenido.secaderoId, secadero.id));

  const filasContenido = [...contenidoFinal.entries()]
    .filter(([, cantidad]) => cantidad > 0)
    .map(([productoId, cantidad]) => ({
      secaderoId: secadero.id,
      productoId,
      cantidad,
    }));
  if (filasContenido.length) {
    await tx.insert(secaderoContenido).values(filasContenido);
  }

  await tx
    .update(secaderos)
    .set({
      estado: estadoHasta,
      ...(conservarInicioDeEstado ? {} : { estadoDesde: ahora }),
    })
    .where(eq(secaderos.id, secadero.id));

  return mov.id;
}

/**
 * Arma las lineas del movimiento.
 *
 * El caso comun -un modelo con su cantidad y, si hubo, sus roturas con un
 * motivo- entra en una sola linea legible. Si un mismo modelo se rompio por dos
 * motivos distintos, los motivos extra abren lineas adicionales con cantidad 0,
 * para que sumar `cantidad` y `desperdicio` por separado siga dando bien.
 */
function construirLineas(
  movimientoId: number,
  cantidades: Map<number, number>,
  roturas: Rotura[],
  catalogo: Catalogo,
) {
  const roturasPorProducto = new Map<number, Rotura[]>();
  for (const r of roturas) {
    if (r.cantidad <= 0) continue;
    const lista = roturasPorProducto.get(r.productoId) ?? [];
    lista.push(r);
    roturasPorProducto.set(r.productoId, lista);
  }

  const productoIds = new Set([...cantidades.keys(), ...roturasPorProducto.keys()]);
  const lineas: (typeof movimientoLineas.$inferInsert)[] = [];

  for (const productoId of productoIds) {
    const producto = catalogo.productos.get(productoId);
    const productoNombre = producto?.nombre ?? `Producto #${productoId}`;
    const cantidad = cantidades.get(productoId) ?? 0;
    const susRoturas = roturasPorProducto.get(productoId) ?? [];

    if (susRoturas.length === 0) {
      if (cantidad === 0) continue;
      lineas.push({ movimientoId, productoId, productoNombre, cantidad });
      continue;
    }

    susRoturas.forEach((rotura, i) => {
      const motivo = catalogo.motivos.get(rotura.motivoId);
      lineas.push({
        movimientoId,
        productoId,
        productoNombre,
        cantidad: i === 0 ? cantidad : 0,
        desperdicio: rotura.cantidad,
        motivoId: rotura.motivoId,
        motivoNombre: motivo?.nombre ?? null,
      });
    });
  }

  return lineas;
}

/** Resta las roturas del contenido y devuelve lo que queda por modelo. */
export function descontarRoturas(
  contenido: Map<number, number>,
  roturas: Rotura[],
): Map<number, number> {
  const resultado = new Map(contenido);
  for (const r of roturas) {
    const actual = resultado.get(r.productoId) ?? 0;
    resultado.set(r.productoId, Math.max(0, actual - r.cantidad));
  }
  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Transiciones y cupo del horno                                              */
/* -------------------------------------------------------------------------- */

/**
 * Transicion de un secadero ya cargado: se descuentan las roturas del contenido
 * y el resto sigue viaje. Comun a horno (entrada y salida), secado al sol,
 * paletizado y devolucion, y a la correccion de cualquiera de ellos, que es
 * rehacer la misma transicion sobre el secadero restaurado.
 */
export async function procesarTransicion(
  tx: Tx,
  sesion: Sesion,
  opciones: {
    secadero: SecaderoConTipo;
    roturas: Rotura[];
    tipo:
      | "entrada_horno"
      | "salida_horno"
      | "descarga"
      | "devolucion_horno"
      | "secado_natural";
    estadoHasta: Estado;
    vaciar: boolean;
    nota: string | null;
    reemplazo?: Reemplazo;
  },
) {
  const { secadero, roturas, tipo, estadoHasta, vaciar, nota, reemplazo } =
    opciones;

  const contenido = await contenidoActual(tx, secadero.id);
  if (contenido.size === 0) {
    fallar(
      `El secadero ${secadero.numero} figura sin placas. Corregilo desde administración.`,
    );
  }

  const catalogo = await cargarCatalogo(
    tx,
    [...new Set([...contenido.keys(), ...roturas.map((r) => r.productoId)])],
    [...new Set(roturas.map((r) => r.motivoId))],
  );

  validarRoturasContraContenido(secadero, roturas, contenido, catalogo);

  const quedan = descontarRoturas(contenido, roturas);

  await aplicarMovida(tx, sesion, catalogo, {
    secadero,
    tipo,
    estadoHasta,
    cantidades: quedan,
    contenidoFinal: vaciar ? new Map() : quedan,
    roturas,
    nota,
    reemplazo,
  });
}

/**
 * Que los secaderos que entran al horno quepan.
 *
 * El horno no es un solo cupo. Los tipos con estructura propia -las guardas-
 * tienen sus lugares y no compiten con los grandes y chicos, asi que un horno
 * lleno de guardas no puede bloquear la entrada de un grande. Cada tipo con
 * `cupoHorno` se valida contra el suyo; los que lo tienen en null comparten el
 * cupo general.
 *
 * Lo usan meter al horno y anular una salida, que es lo mismo visto desde el
 * horno: un secadero que vuelve a ocupar un lugar.
 */
export async function validarCupoHorno(
  tx: Tx,
  entrantes: SecaderoConTipo[],
  capacidadGeneral: number,
  /**
   * El final del mensaje cuando no entra. Por defecto, el de meter al horno,
   * que es el texto que el hornero ya conoce.
   */
  detalle: (entrando: number) => string = (n) =>
    `estás metiendo ${n}. Sacá los secos primero.`,
) {
  // Los que se estan validando no cuentan como ocupacion aunque ya figuren
  // en horno. Al anular una salida, el secadero ya se restauro a `horno`
  // adentro de la misma transaccion antes de llegar aca: sin esta exclusion
  // se contaba dos veces, como adentro y como entrando, y la anulacion se
  // rechazaba con el horno vacio.
  const ocupacion = await tx
    .select({ tipoId: secaderos.tipoId, dentro: count() })
    .from(secaderos)
    .where(
      and(
        eq(secaderos.estado, "horno"),
        eq(secaderos.activo, true),
        notInArray(
          secaderos.id,
          entrantes.map((s) => s.id),
        ),
      ),
    )
    .groupBy(secaderos.tipoId);

  const conCupoPropio = await tx
    .select({ id: tipos.id, nombre: tipos.nombre, cupo: tipos.cupoHorno })
    .from(tipos)
    .where(isNotNull(tipos.cupoHorno));
  const cupoPropio = new Map(
    conCupoPropio.map((t) => [t.id, { nombre: t.nombre, cupo: t.cupo! }]),
  );

  // Los que ya estan adentro, repartidos entre el cupo general y los propios.
  const dentroPorCupo = new Map<number | null, number>();
  for (const o of ocupacion) {
    const clave = cupoPropio.has(o.tipoId) ? o.tipoId : null;
    dentroPorCupo.set(clave, (dentroPorCupo.get(clave) ?? 0) + o.dentro);
  }

  const entrandoPorCupo = new Map<number | null, number>();
  for (const s of entrantes) {
    const clave = s.cupoHorno === null ? null : s.tipoId;
    entrandoPorCupo.set(clave, (entrandoPorCupo.get(clave) ?? 0) + 1);
  }

  for (const [clave, entrando] of entrandoPorCupo) {
    const dentro = dentroPorCupo.get(clave) ?? 0;
    const tope = clave === null ? capacidadGeneral : cupoPropio.get(clave)!.cupo;
    if (dentro + entrando <= tope) continue;

    const donde =
      clave === null
        ? "En el horno entran"
        : `Para ${cupoPropio.get(clave)!.nombre} hay`;
    fallar(`${donde} ${tope} secaderos. Ya hay ${dentro} adentro y ${detalle(entrando)}`);
  }
}

import "server-only";
import { eq, inArray } from "drizzle-orm";
import {
  motivosDesperdicio,
  movimientoLineas,
  movimientos,
  productos,
  secaderoContenido,
  secaderos,
  type Estado,
  type Secadero,
  type TipoMovimiento,
} from "../db/schema";
import { capacidadDe, type Configuracion } from "../configuracion";
import { ETIQUETA_ESTADO } from "../estados";
import type { Sesion } from "../session";
import { fallar, type Item, type Rotura } from "./comun";

export { ETIQUETA_ESTADO };

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
): Promise<Secadero[]> {
  if (ids.length === 0) fallar("No seleccionaste ningún secadero.");
  const filas = await tx
    .select()
    .from(secaderos)
    .where(inArray(secaderos.id, ids))
    .for("update");

  if (filas.length !== ids.length) {
    fallar("Alguno de los secaderos ya no existe. Actualizá la pantalla.");
  }
  return filas;
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
  productos: Map<number, { id: number; nombre: string; tamano: string; activo: boolean }>;
  motivos: Map<number, { id: number; nombre: string; activo: boolean }>;
};

export async function cargarCatalogo(
  tx: Tx,
  productoIds: number[],
  motivoIds: number[],
): Promise<Catalogo> {
  const prods = productoIds.length
    ? await tx.select().from(productos).where(inArray(productos.id, productoIds))
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
    if (!catalogo.productos.has(id)) fallar("Un modelo seleccionado no existe.");
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
 * Un secadero grande solo lleva placas grandes y uno chico solo chicas, y el
 * total no puede pasar la capacidad de su tipo.
 */
export function validarCarga(
  secadero: Secadero,
  items: Item[],
  catalogo: Catalogo,
  cfg: Configuracion,
  { exigirActivos }: { exigirActivos: boolean },
) {
  const conCantidad = items.filter((i) => i.cantidad > 0);
  if (conCantidad.length === 0) {
    fallar("Cargá al menos un modelo con cantidad mayor a cero.");
  }

  const vistos = new Set<number>();
  for (const item of conCantidad) {
    if (vistos.has(item.productoId)) {
      fallar("Hay un modelo repetido en la carga.");
    }
    vistos.add(item.productoId);

    const producto = catalogo.productos.get(item.productoId)!;
    if (producto.tamano !== secadero.tamano) {
      fallar(
        `"${producto.nombre}" es de placa ${producto.tamano} y el secadero ${secadero.numero} es ${secadero.tamano}.`,
      );
    }
    if (exigirActivos && !producto.activo) {
      fallar(`El modelo "${producto.nombre}" está suspendido.`);
    }
  }

  const capacidad = capacidadDe(cfg, secadero.tamano);
  const total = conCantidad.reduce((a, i) => a + i.cantidad, 0);
  if (total > capacidad) {
    fallar(
      `El secadero ${secadero.numero} (${secadero.tamano}) admite hasta ${capacidad} placas y estás cargando ${total}.`,
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
    const nombre = catalogo.productos.get(productoId)?.nombre ?? "ese modelo";
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
  secadero: Secadero;
  tipo: TipoMovimiento;
  estadoHasta: Estado;
  /** Placas que quedan en circuito por modelo. En una descarga, lo que va a PT. */
  cantidades: Map<number, number>;
  /** Lo que queda fisicamente adentro del secadero. En una descarga, vacio. */
  contenidoFinal: Map<number, number>;
  roturas: Rotura[];
  nota: string | null;
  /**
   * Un `ajuste` no cierra el tramo de estado: el secadero sigue contando el
   * tiempo desde que entro al estado, asi no se ensucia el tiempo de horno.
   */
  conservarInicioDeEstado?: boolean;
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
  } = movida;

  const ahora = new Date();
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
      secaderoTamano: secadero.tamano,
      tipo,
      estadoDesde: secadero.estado,
      estadoHasta,
      usuarioId: sesion.uid,
      usuarioNombre: sesion.nombre,
      duracionMin,
      nota,
      creadoEn: ahora,
    })
    .returning({ id: movimientos.id });

  await tx.insert(movimientoLineas).values(
    construirLineas(mov.id, cantidades, roturas, catalogo),
  );

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
    const productoNombre = producto?.nombre ?? `Modelo #${productoId}`;
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

"use server";

import { revalidatePath } from "next/cache";
import { eq, and, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { secaderos, type Estado } from "../db/schema";
import { autorizar } from "../auth";
import { leerConfig } from "../consultas";
import {
  ejecutar,
  esquemaItem,
  esquemaNota,
  esquemaRotura,
  fallar,
  type Resultado,
} from "./comun";
import {
  aplicarMovida,
  bloquearSecaderos,
  cargarCatalogo,
  contenidoActual,
  descontarRoturas,
  exigirEstado,
  validarCarga,
  validarRoturasContraContenido,
} from "./motor";

function revalidar() {
  // La app es chica y todas las pantallas comparten el estado de los secaderos,
  // asi que invalidar el layout entero es mas simple que enumerar rutas.
  revalidatePath("/", "layout");
}

/* -------------------------------------------------------------------------- */
/* Carrusel: vacio -> humedo                                                  */
/* -------------------------------------------------------------------------- */

/**
 * La carga no lleva roturas.
 *
 * El carrusel siempre saca el secadero completo, asi que la placa que se rompe
 * en la linea nunca llega a entrar: no le pertenece a ningun secadero. Se
 * registra una sola vez y suelta, con `registrarRoturaCarrusel`. Tenerla
 * tambien aca hacia que el mismo hecho se pudiera anotar en dos lados y que el
 * total dependiera de cual eligio el operario.
 *
 * Las roturas de las otras etapas si van en el movimiento: ahi la placa ya
 * esta adentro del secadero y hay que descontarla de su contenido.
 */
const esquemaCarga = z.object({
  secaderoId: z.number().int().positive(),
  items: z.array(esquemaItem).min(1, "Elegí al menos un producto."),
  nota: esquemaNota,
});

export async function cargarSecadero(
  entrada: z.input<typeof esquemaCarga>,
): Promise<Resultado> {
  return ejecutar(async () => {
    // Carrusel y llenado manual cargan cualquier tipo de secadero: quien lo
    // hizo queda registrado en el movimiento, que es lo que despues permite
    // separar los sectores en las estadisticas.
    const sesion = await autorizar("carrusel", "llenado_manual", "admin");
    const datos = esquemaCarga.parse(entrada);

    await db.transaction(async (tx) => {
      const [secadero] = await bloquearSecaderos(tx, [datos.secaderoId]);
      exigirEstado(secadero, "vacio");

      const catalogo = await cargarCatalogo(
        tx,
        [...new Set(datos.items.map((i) => i.productoId))],
        [],
      );

      validarCarga(secadero, datos.items, catalogo, { exigirActivos: true });

      const cantidades = new Map(
        datos.items.filter((i) => i.cantidad > 0).map((i) => [i.productoId, i.cantidad]),
      );

      await aplicarMovida(tx, sesion, catalogo, {
        secadero,
        tipo: "carga",
        estadoHasta: "humedo",
        cantidades,
        contenidoFinal: cantidades,
        roturas: [],
        nota: datos.nota,
      });
    });

    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Horno                                                                      */
/* -------------------------------------------------------------------------- */

const esquemaSeleccion = z.object({
  secaderoId: z.number().int().positive(),
  roturas: z.array(esquemaRotura).default([]),
});

const esquemaLoteHorno = z.object({
  seleccion: z.array(esquemaSeleccion).min(1, "Elegí al menos un secadero."),
  nota: esquemaNota,
});

/** humedo -> horno. Valida que el lote entre en el horno. */
export async function entrarAHorno(
  entrada: z.input<typeof esquemaLoteHorno>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("horno", "admin");
    const datos = esquemaLoteHorno.parse(entrada);
    const cfg = await leerConfig();

    await db.transaction(async (tx) => {
      const ids = datos.seleccion.map((s) => s.secaderoId);
      const filas = await bloquearSecaderos(tx, ids);

      const [{ dentro }] = await tx
        .select({ dentro: count() })
        .from(secaderos)
        .where(and(eq(secaderos.estado, "horno"), eq(secaderos.activo, true)));

      if (dentro + ids.length > cfg.capacidad_horno) {
        fallar(
          `En el horno entran ${cfg.capacidad_horno} secaderos. Ya hay ${dentro} adentro ` +
            `y estás metiendo ${ids.length}. Sacá los secos primero.`,
        );
      }

      for (const secadero of filas) {
        const seleccion = datos.seleccion.find((s) => s.secaderoId === secadero.id)!;
        exigirEstado(secadero, "humedo");
        await procesarTransicion(tx, sesion, {
          secadero,
          roturas: seleccion.roturas,
          tipo: "entrada_horno",
          estadoHasta: "horno",
          vaciar: false,
          nota: datos.nota,
        });
      }
    });

    revalidar();
  });
}

/** horno -> seco. El operario elige cuales salen; puede dejar adentro los que no secaron. */
export async function salirDeHorno(
  entrada: z.input<typeof esquemaLoteHorno>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("horno", "admin");
    const datos = esquemaLoteHorno.parse(entrada);

    await db.transaction(async (tx) => {
      const ids = datos.seleccion.map((s) => s.secaderoId);
      const filas = await bloquearSecaderos(tx, ids);

      for (const secadero of filas) {
        const seleccion = datos.seleccion.find((s) => s.secaderoId === secadero.id)!;
        exigirEstado(secadero, "horno");
        await procesarTransicion(tx, sesion, {
          secadero,
          roturas: seleccion.roturas,
          tipo: "salida_horno",
          estadoHasta: "seco",
          vaciar: false,
          nota: datos.nota,
        });
      }
    });

    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Paletizado: seco -> vacio                                                  */
/* -------------------------------------------------------------------------- */

const esquemaDescarga = z.object({
  secaderoId: z.number().int().positive(),
  roturas: z.array(esquemaRotura).default([]),
  nota: esquemaNota,
});

export async function descargarSecadero(
  entrada: z.input<typeof esquemaDescarga>,
): Promise<Resultado> {
  return ejecutar(async () => {
    // Las guardas y especiales las puede descargar tanto paletizado como el
    // sector de llenado manual, sin restriccion por tipo de secadero.
    const sesion = await autorizar("paletizado", "llenado_manual", "admin");
    const datos = esquemaDescarga.parse(entrada);

    await db.transaction(async (tx) => {
      const [secadero] = await bloquearSecaderos(tx, [datos.secaderoId]);
      exigirEstado(secadero, "seco");
      await procesarTransicion(tx, sesion, {
        secadero,
        roturas: datos.roturas,
        tipo: "descarga",
        estadoHasta: "vacio",
        // El secadero queda vacio, pero el movimiento registra cuantas placas
        // salieron sanas hacia producto terminado.
        vaciar: true,
        nota: datos.nota,
      });
    });

    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Devolucion al horno: seco -> humedo                                        */
/* -------------------------------------------------------------------------- */

const esquemaDevolucion = z.object({
  secaderoId: z.number().int().positive(),
  roturas: z.array(esquemaRotura).default([]),
  nota: esquemaNota,
});

/**
 * El secadero salio del horno pero no seco bien, asi que vuelve a la cola.
 *
 * Va a `humedo` y no directo a `horno` porque quien lo detecta es paletizado,
 * que no lo mete fisicamente al horno: eso lo hace el hornero, con el flujo
 * normal. Si lo pusieramos en `horno`, la app diria que esta adentro cuando
 * todavia esta afuera, y ademas ocuparia un lugar del horno que esta libre.
 *
 * Tiene tipo propio, separado de `correccion`: esto no es un error de carga
 * sino un hecho productivo, y mezclarlos arruinaria las dos metricas.
 */
export async function devolverAlHorno(
  entrada: z.input<typeof esquemaDevolucion>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("paletizado", "llenado_manual", "admin");
    const datos = esquemaDevolucion.parse(entrada);

    await db.transaction(async (tx) => {
      const [secadero] = await bloquearSecaderos(tx, [datos.secaderoId]);
      exigirEstado(secadero, "seco");
      await procesarTransicion(tx, sesion, {
        secadero,
        roturas: datos.roturas,
        tipo: "devolucion_horno",
        estadoHasta: "humedo",
        vaciar: false,
        nota: datos.nota,
      });
    });

    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Correccion del admin                                                       */
/* -------------------------------------------------------------------------- */

const esquemaCorreccion = z.object({
  secaderoId: z.number().int().positive(),
  estadoHasta: z.enum(["vacio", "humedo", "horno", "seco"]),
  items: z.array(esquemaItem).default([]),
  nota: z
    .string()
    .trim()
    .min(3, "Escribí por qué estás corrigiendo el secadero.")
    .max(500),
});

/**
 * Valvula de escape: el admin fuerza estado y contenido cuando algo se cargo
 * mal. Queda registrado como movimiento `correccion` con la nota obligatoria,
 * asi el historial nunca miente sobre lo que paso.
 */
export async function corregirSecadero(
  entrada: z.input<typeof esquemaCorreccion>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    const datos = esquemaCorreccion.parse(entrada);

    await db.transaction(async (tx) => {
      const [secadero] = await bloquearSecaderos(tx, [datos.secaderoId]);

      const items = datos.items.filter((i) => i.cantidad > 0);
      if (datos.estadoHasta === "vacio" && items.length > 0) {
        fallar("Un secadero vacío no puede tener placas adentro.");
      }
      if (datos.estadoHasta !== "vacio" && items.length === 0) {
        fallar(`Un secadero ${datos.estadoHasta} necesita al menos un producto.`);
      }

      const catalogo = await cargarCatalogo(
        tx,
        items.map((i) => i.productoId),
        [],
      );
      if (items.length) {
        validarCarga(secadero, items, catalogo, { exigirActivos: false });
      }

      const cantidades = new Map(items.map((i) => [i.productoId, i.cantidad]));

      await aplicarMovida(tx, sesion, catalogo, {
        secadero,
        tipo: "correccion",
        estadoHasta: datos.estadoHasta,
        cantidades,
        contenidoFinal: cantidades,
        roturas: [],
        nota: datos.nota,
        // Si el estado no cambia, no reiniciamos el reloj del tramo.
        conservarInicioDeEstado: secadero.estado === datos.estadoHasta,
      });
    });

    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Interno                                                                    */
/* -------------------------------------------------------------------------- */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Transicion de un secadero ya cargado: se descuentan las roturas del contenido
 * y el resto sigue viaje. Comun a horno (entrada y salida) y a paletizado.
 */
async function procesarTransicion(
  tx: Tx,
  sesion: Awaited<ReturnType<typeof autorizar>>,
  opciones: {
    secadero: Awaited<ReturnType<typeof bloquearSecaderos>>[number];
    roturas: z.infer<typeof esquemaRotura>[];
    tipo: "entrada_horno" | "salida_horno" | "descarga" | "devolucion_horno";
    estadoHasta: Estado;
    vaciar: boolean;
    nota: string | null;
  },
) {
  const { secadero, roturas, tipo, estadoHasta, vaciar, nota } = opciones;

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
  });
}

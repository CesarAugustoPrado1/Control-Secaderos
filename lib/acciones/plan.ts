"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  motivosDesvio,
  notasHorno,
  paletsArmados,
  planLineas,
  planMoldes,
  planes,
  productos,
  tipos,
  type Sector,
} from "../db/schema";
import { leerConfig } from "../consultas";
import { fechaLocal } from "../rangos";
import { autorizar } from "../auth";
import { ejecutar, fallar, type Resultado } from "./comun";

function revalidar() {
  revalidatePath("/", "layout");
}

const esquemaFecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");

const esquemaSector = z.enum(["carrusel", "paletizado"]);

const esquemaDestino = z.enum([
  "palet_estandar",
  "palet_optimizado",
  "placa_suelta",
]);

const esquemaPlan = z.object({
  fecha: esquemaFecha,
  sector: esquemaSector,
  lineas: z
    .array(
      z.object({
        productoId: z.number().int().positive(),
        secaderos: z.number().int().min(0).max(500),
        destino: esquemaDestino.nullish(),
        cliente: z
          .string()
          .trim()
          .max(80, "El cliente no puede tener más de 80 caracteres.")
          .nullish(),
        paletsEstandar: z.number().int().min(0).max(500).nullish(),
        paletsOptimizados: z.number().int().min(0).max(500).nullish(),
      }),
    )
    .default([]),
  nota: z.string().trim().max(500).optional(),
  /**
   * Solo carrusel. Sin el campo no se toca lo que haya; `null` deja el dia
   * "sin cambios"; una lista es el set de moldes pedido para ese dia.
   */
  moldes: z
    .array(
      z.object({
        productoId: z.number().int().positive(),
        moldes: z.number().int().min(0).max(1000),
      }),
    )
    .nullish(),
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Valida un set de moldes pedido y devuelve las filas a guardar.
 *
 * Nunca se puede pedir mas moldes de los que hay de un modelo, ni mas que los
 * lugares del carrusel. Menos que los lugares si se puede: el admin puede
 * saber de antemano que una mesa va a estar en mantenimiento.
 */
async function validarMoldesPedidos(
  moldes: { productoId: number; moldes: number }[],
) {
  const filas = moldes.filter((m) => m.moldes > 0);
  if (filas.length === 0) {
    fallar("El set de moldes pedido está vacío. Si no hay cambios, dejalo sin cambios.");
  }
  const ids = new Set(filas.map((f) => f.productoId));
  if (ids.size !== filas.length) fallar("Hay un modelo repetido en los moldes.");

  const inventario = await db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      moldes: productos.moldes,
      llenadoManual: tipos.llenadoManual,
    })
    .from(productos)
    .innerJoin(tipos, eq(tipos.id, productos.tipoId))
    .where(inArray(productos.id, [...ids]));
  if (inventario.length !== ids.size) fallar("Alguno de los modelos ya no existe.");

  const porId = new Map(inventario.map((p) => [p.id, p]));
  for (const f of filas) {
    const p = porId.get(f.productoId)!;
    if (p.llenadoManual) fallar(`${p.nombre} no va en el carrusel.`);
    if (f.moldes > p.moldes) {
      fallar(
        p.moldes === 0
          ? `No hay moldes de ${p.nombre} cargados en el inventario.`
          : `De ${p.nombre} hay ${p.moldes} moldes y se piden ${f.moldes}.`,
      );
    }
  }

  const { moldes_carrusel: lugares } = await leerConfig();
  const total = filas.reduce((a, f) => a + f.moldes, 0);
  if (total > lugares) {
    fallar(
      `Se piden ${total} moldes y el carrusel tiene ${lugares} lugares.`,
    );
  }
  return filas;
}

async function reemplazarMoldesPedidos(
  tx: Tx,
  fecha: string,
  filas: { productoId: number; moldes: number }[] | null,
) {
  await tx.delete(planMoldes).where(eq(planMoldes.fecha, fecha));
  if (filas && filas.length > 0) {
    await tx
      .insert(planMoldes)
      .values(filas.map((f) => ({ fecha, productoId: f.productoId, moldes: f.moldes })));
  }
}

/**
 * Guarda la orden de un dia. Reemplaza las lineas enteras: es mas simple de
 * razonar que un diff y el plan es chico.
 *
 * Guardar un plan sin lineas equivale a borrarlo. Eso importa porque "sin
 * plan" y "plan de cero" son cosas distintas: el primero no se mide.
 */
export async function guardarPlan(
  entrada: z.input<typeof esquemaPlan>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    const datos = esquemaPlan.parse(entrada);

    // Destino, cliente y palets solo tienen sentido en paletizado: cargar un
    // secadero no se rotula para nadie. Se limpian en vez de rechazarse para
    // que cambiar el sector de un plan no falle por un dato que sobra.
    const esPaletizado = datos.sector === "paletizado";

    // En paletizado una linea puede pedir solo palets: las placas pueden estar
    // ya descargadas, en un cajon.
    const lineas = datos.lineas
      .map((l) => ({
        ...l,
        paletsEstandar: esPaletizado ? l.paletsEstandar || null : null,
        paletsOptimizados: esPaletizado ? l.paletsOptimizados || null : null,
      }))
      .filter((l) => l.secaderos > 0 || l.paletsEstandar || l.paletsOptimizados);

    if (datos.moldes !== undefined && datos.sector !== "carrusel") {
      fallar("Los moldes se piden en el plan del carrusel.");
    }
    const moldes =
      datos.moldes === undefined
        ? undefined
        : datos.moldes === null
          ? null
          : await validarMoldesPedidos(datos.moldes);

    const vistos = new Set<number>();
    for (const l of lineas) {
      if (vistos.has(l.productoId)) fallar("Hay un producto repetido en el plan.");
      vistos.add(l.productoId);
    }

    if (lineas.length > 0) {
      const existentes = await db
        .select({ id: productos.id })
        .from(productos)
        .where(inArray(productos.id, [...vistos]));
      if (existentes.length !== vistos.size) {
        fallar("Alguno de los productos ya no existe.");
      }
    }

    await db.transaction(async (tx) => {
      if (moldes !== undefined) {
        await reemplazarMoldesPedidos(tx, datos.fecha, moldes);
      }

      const [plan] = await tx
        .select()
        .from(planes)
        .where(and(eq(planes.fecha, datos.fecha), eq(planes.sector, datos.sector)))
        .limit(1);

      if (lineas.length === 0) {
        if (plan) await tx.delete(planes).where(eq(planes.id, plan.id));
        return;
      }

      let planId = plan?.id;
      if (planId) {
        await tx
          .update(planes)
          .set({ nota: datos.nota ?? null })
          .where(eq(planes.id, planId));
        // Se borran las lineas y se reescriben. Se pierden los motivos de
        // desvio ya explicados de esa fecha, que es lo correcto: si cambio lo
        // pedido, la explicacion anterior ya no aplica.
        await tx.delete(planLineas).where(eq(planLineas.planId, planId));
      } else {
        const [creado] = await tx
          .insert(planes)
          .values({
            fecha: datos.fecha,
            sector: datos.sector,
            nota: datos.nota ?? null,
            creadoPor: sesion.uid,
          })
          .returning({ id: planes.id });
        planId = creado.id;
      }

      await tx.insert(planLineas).values(
        lineas.map((l) => ({
          planId: planId!,
          productoId: l.productoId,
          secaderos: l.secaderos,
          destino: esPaletizado ? (l.destino ?? null) : null,
          cliente: esPaletizado ? (l.cliente || null) : null,
          paletsEstandar: l.paletsEstandar,
          paletsOptimizados: l.paletsOptimizados,
        })),
      );
    });

    revalidar();
  });
}

const esquemaNota = z
  .string()
  .trim()
  .max(500, "Cada nota puede tener hasta 500 caracteres.")
  .nullish();

const esquemaNotasHorno = z.object({
  fecha: esquemaFecha,
  carga: esquemaNota,
  descarga: esquemaNota,
});

/**
 * Guarda las indicaciones del dia para el hornero.
 *
 * Las dos notas vacias borran la fila: asi "sin indicaciones" es la ausencia de
 * fila y no una fila con dos textos en blanco que la semana mostraria como
 * cargada.
 */
export async function guardarNotasHorno(
  entrada: z.input<typeof esquemaNotasHorno>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    const datos = esquemaNotasHorno.parse(entrada);
    const carga = datos.carga || null;
    const descarga = datos.descarga || null;

    if (!carga && !descarga) {
      await db.delete(notasHorno).where(eq(notasHorno.fecha, datos.fecha));
    } else {
      const valores = {
        carga,
        descarga,
        actualizadoPor: sesion.uid,
        actualizadoEn: new Date(),
      };
      await db
        .insert(notasHorno)
        .values({ fecha: datos.fecha, ...valores })
        .onConflictDoUpdate({ target: notasHorno.fecha, set: valores });
    }

    revalidar();
  });
}

const esquemaExplicacion = z.object({
  lineaId: z.number().int().positive(),
  motivoId: z.number().int().positive().nullable(),
  nota: z.string().trim().max(500).optional(),
});

/**
 * Explica por que una linea del plan no se cumplio.
 *
 * Lo puede hacer el operario del sector, que es el que estuvo ahi, o el admin.
 * Pasar `motivoId: null` borra la explicacion.
 */
export async function explicarDesvio(
  entrada: z.input<typeof esquemaExplicacion>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar(
      "admin",
      "carrusel",
      "llenado_manual",
      "paletizado",
    );
    const datos = esquemaExplicacion.parse(entrada);

    const [linea] = await db
      .select({ id: planLineas.id, sector: planes.sector })
      .from(planLineas)
      .innerJoin(planes, eq(planes.id, planLineas.planId))
      .where(eq(planLineas.id, datos.lineaId))
      .limit(1);

    if (!linea) fallar("Esa línea del plan ya no existe.");

    // Cada sector explica lo suyo; el admin puede explicar cualquiera.
    if (sesion.rol !== "admin") {
      const sectorDelRol: Record<string, Sector> = {
        carrusel: "carrusel",
        llenado_manual: "carrusel",
        paletizado: "paletizado",
      };
      if (sectorDelRol[sesion.rol] !== linea.sector) {
        fallar("Sólo podés explicar los desvíos de tu sector.");
      }
    }

    if (datos.motivoId) {
      const [motivo] = await db
        .select()
        .from(motivosDesvio)
        .where(eq(motivosDesvio.id, datos.motivoId))
        .limit(1);
      if (!motivo) fallar("Ese motivo ya no existe.");
      if (!motivo.activo) fallar(`El motivo "${motivo.nombre}" está desactivado.`);
    }

    await db
      .update(planLineas)
      .set({
        motivoDesvioId: datos.motivoId,
        notaDesvio: datos.motivoId ? (datos.nota ?? null) : null,
        explicadoPor: datos.motivoId ? sesion.uid : null,
        explicadoPorNombre: datos.motivoId ? sesion.nombre : null,
        explicadoEn: datos.motivoId ? new Date() : null,
      })
      .where(eq(planLineas.id, datos.lineaId));

    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* ABM de motivos de desvio                                                   */
/* -------------------------------------------------------------------------- */

const esquemaMotivo = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, "El motivo necesita un nombre.").max(60),
});

export async function guardarMotivoDesvio(
  entrada: z.input<typeof esquemaMotivo>,
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const datos = esquemaMotivo.parse(entrada);

    if (datos.id) {
      await db
        .update(motivosDesvio)
        .set({ nombre: datos.nombre })
        .where(eq(motivosDesvio.id, datos.id));
    } else {
      await db.insert(motivosDesvio).values({ nombre: datos.nombre });
    }
    revalidar();
  });
}

export async function cambiarEstadoMotivoDesvio(entrada: {
  id: number;
  activo: boolean;
}): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id, activo } = z
      .object({ id: z.number().int().positive(), activo: z.boolean() })
      .parse(entrada);
    await db
      .update(motivosDesvio)
      .set({ activo })
      .where(eq(motivosDesvio.id, id));
    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Palets armados                                                             */
/* -------------------------------------------------------------------------- */

const esquemaPalets = z.object({
  fecha: esquemaFecha,
  productoId: z.number().int().positive(),
  tipo: z.enum(["estandar", "optimizado"]),
  /** Positivo confirma palets; negativo descuenta uno cargado de mas. */
  cantidad: z
    .number()
    .int()
    .min(-500)
    .max(500)
    .refine((n) => n !== 0, "La cantidad no puede ser cero."),
});

/**
 * Paletizado confirma palets armados: de a uno con +, todos juntos con
 * "Listo", o descontando con - si se toco de mas.
 *
 * Cada toque es una fila nueva con quien y cuando; nunca se pisa un numero.
 * El operario solo registra en el dia de hoy -lo de ayer ya lo leyo alguien-;
 * el admin puede completar un dia pasado que quedo sin confirmar.
 */
export async function registrarPalets(
  entrada: z.input<typeof esquemaPalets>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("paletizado", "admin");
    const datos = esquemaPalets.parse(entrada);
    const hoy = fechaLocal();

    if (datos.fecha > hoy) fallar("No se pueden confirmar palets de un día que no llegó.");
    if (sesion.rol !== "admin" && datos.fecha !== hoy) {
      fallar("Sólo se pueden confirmar los palets de hoy.");
    }

    const [producto] = await db
      .select({ id: productos.id, nombre: productos.nombre })
      .from(productos)
      .where(eq(productos.id, datos.productoId))
      .limit(1);
    if (!producto) fallar("Ese producto ya no existe.");

    await db.transaction(async (tx) => {
      // Un candado por dia, para que dos toques de - a la vez no dejen la
      // suma en negativo.
      await tx.execute(
        sql`select pg_advisory_xact_lock(734102, ${Number(datos.fecha.replaceAll("-", ""))})`,
      );

      if (datos.cantidad < 0) {
        const [{ n }] = await tx
          .select({ n: sql<string>`coalesce(sum(${paletsArmados.cantidad}), 0)` })
          .from(paletsArmados)
          .where(
            and(
              eq(paletsArmados.fecha, datos.fecha),
              eq(paletsArmados.productoId, datos.productoId),
              eq(paletsArmados.tipo, datos.tipo),
            ),
          );
        if (Number(n) + datos.cantidad < 0) {
          fallar("No hay palets confirmados para descontar.");
        }
      }

      await tx.insert(paletsArmados).values({
        fecha: datos.fecha,
        productoId: producto.id,
        productoNombre: producto.nombre,
        tipo: datos.tipo,
        cantidad: datos.cantidad,
        usuarioId: sesion.uid,
        usuarioNombre: sesion.nombre,
      });
    });

    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Repetir un dia                                                             */
/* -------------------------------------------------------------------------- */

/** Que dias de la lista ya tienen algo cargado: plan, notas o moldes. */
async function fechasConContenido(fechas: string[]): Promise<string[]> {
  if (fechas.length === 0) return [];
  const [p, n, m] = await Promise.all([
    db.selectDistinct({ f: planes.fecha }).from(planes).where(inArray(planes.fecha, fechas)),
    db
      .selectDistinct({ f: notasHorno.fecha })
      .from(notasHorno)
      .where(inArray(notasHorno.fecha, fechas)),
    db
      .selectDistinct({ f: planMoldes.fecha })
      .from(planMoldes)
      .where(inArray(planMoldes.fecha, fechas)),
  ]);
  return [...new Set([...p, ...n, ...m].map((x) => x.f))].sort();
}

const esquemaFechas = z.array(esquemaFecha).min(1).max(62);

/**
 * Antes de repetir: cuales de los dias elegidos ya tienen algo cargado, para
 * preguntar si se pisan. No escribe nada.
 */
export async function revisarDestinos(
  fechas: string[],
): Promise<Resultado<string[]>> {
  return ejecutar(async () => {
    await autorizar("admin");
    return fechasConContenido(esquemaFechas.parse(fechas));
  });
}

const esquemaRepetir = z.object({
  origen: esquemaFecha,
  destinos: esquemaFechas,
  /** Dias que ya tienen algo y el admin confirmo que se pisen. */
  pisar: z.array(esquemaFecha).default([]),
});

/**
 * Repite un dia completo en otras fechas: carrusel (secaderos y moldes),
 * notas del horno y paletizado (secaderos, palets y cliente), con las notas.
 *
 * Cada dia destino queda igual al de origen: lo que tenia antes se reemplaza
 * entero, y solo si el admin lo confirmo para ese dia. Las explicaciones de
 * desvio no se copian: son de lo que paso aquel dia, no de lo que se pide.
 *
 * Nunca a un dia pasado: su cumplimiento ya esta medido. Los modelos
 * suspendidos desde entonces se saltean y se avisa cuales.
 */
export async function repetirDia(
  entrada: z.input<typeof esquemaRepetir>,
): Promise<Resultado<{ dias: number; omitidos: string[] }>> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    const datos = esquemaRepetir.parse(entrada);
    const hoy = fechaLocal();

    const destinos = [...new Set(datos.destinos)].sort();
    for (const f of destinos) {
      if (f === datos.origen) fallar("No se puede repetir un día sobre sí mismo.");
      if (f < hoy) fallar("No se puede copiar a un día que ya pasó.");
    }

    // Lo que tiene el dia de origen.
    const planesOrigen = await db
      .select()
      .from(planes)
      .where(eq(planes.fecha, datos.origen));
    const lineasOrigen = planesOrigen.length
      ? await db
          .select({
            planId: planLineas.planId,
            productoId: planLineas.productoId,
            nombre: productos.nombre,
            activo: productos.activo,
            secaderos: planLineas.secaderos,
            destino: planLineas.destino,
            cliente: planLineas.cliente,
            paletsEstandar: planLineas.paletsEstandar,
            paletsOptimizados: planLineas.paletsOptimizados,
          })
          .from(planLineas)
          .innerJoin(productos, eq(productos.id, planLineas.productoId))
          .where(inArray(planLineas.planId, planesOrigen.map((p) => p.id)))
      : [];
    const [notas] = await db
      .select()
      .from(notasHorno)
      .where(eq(notasHorno.fecha, datos.origen))
      .limit(1);
    const moldesOrigen = await db
      .select({
        productoId: planMoldes.productoId,
        nombre: productos.nombre,
        activo: productos.activo,
        moldes: planMoldes.moldes,
      })
      .from(planMoldes)
      .innerJoin(productos, eq(productos.id, planMoldes.productoId))
      .where(eq(planMoldes.fecha, datos.origen));

    if (planesOrigen.length === 0 && !notas && moldesOrigen.length === 0) {
      fallar("Ese día no tiene nada cargado para repetir.");
    }

    const omitidos = new Set<string>();
    for (const l of [...lineasOrigen, ...moldesOrigen]) {
      if (!l.activo) omitidos.add(l.nombre);
    }
    const moldesActivos = moldesOrigen.filter((m) => m.activo);
    // El inventario pudo bajar desde aquel dia: se valida contra el de hoy.
    const moldes = moldesActivos.length
      ? await validarMoldesPedidos(moldesActivos)
      : null;

    const ocupados = new Set(await fechasConContenido(destinos));
    const pisar = new Set(datos.pisar);
    const sinConfirmar = destinos.filter((f) => ocupados.has(f) && !pisar.has(f));
    if (sinConfirmar.length > 0) {
      fallar(
        `Estos días ya tienen algo cargado: ${sinConfirmar.join(", ")}. Confirmá si se pisan.`,
      );
    }

    await db.transaction(async (tx) => {
      for (const fecha of destinos) {
        await tx.delete(planes).where(eq(planes.fecha, fecha));
        await tx.delete(notasHorno).where(eq(notasHorno.fecha, fecha));
        await reemplazarMoldesPedidos(tx, fecha, moldes);

        for (const p of planesOrigen) {
          const lineas = lineasOrigen.filter((l) => l.planId === p.id && l.activo);
          if (lineas.length === 0) continue;
          const [nuevo] = await tx
            .insert(planes)
            .values({
              fecha,
              sector: p.sector,
              nota: p.nota,
              creadoPor: sesion.uid,
            })
            .returning({ id: planes.id });
          await tx.insert(planLineas).values(
            lineas.map((l) => ({
              planId: nuevo.id,
              productoId: l.productoId,
              secaderos: l.secaderos,
              destino: l.destino,
              cliente: l.cliente,
              paletsEstandar: l.paletsEstandar,
              paletsOptimizados: l.paletsOptimizados,
            })),
          );
        }

        if (notas) {
          await tx.insert(notasHorno).values({
            fecha,
            carga: notas.carga,
            descarga: notas.descarga,
            actualizadoPor: sesion.uid,
            actualizadoEn: new Date(),
          });
        }
      }
    });

    revalidar();
    return { dias: destinos.length, omitidos: [...omitidos].sort() };
  });
}

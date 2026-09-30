"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { cambioMoldesLineas, cambiosMoldes, productos } from "../db/schema";
import { autorizar } from "../auth";
import { leerConfig } from "../consultas";
import { mismosMoldes, totalMoldes, type LineaMoldes } from "../moldes-comun";
import { fechaLocal } from "../rangos";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * Candado para registrar y anular cambios de moldes de a uno. Cada cambio se
 * apoya en el anterior, asi que dos operarios guardando a la vez no pueden
 * partir los dos del mismo set: el segundo tiene que ver lo que hizo el primero.
 */
const CANDADO_MOLDES = 734_101;

const esquemaCambio = z.object({
  lineas: z.array(
    z.object({
      productoId: z.number().int().positive(),
      cantidad: z
        .number()
        .int()
        .min(0, "Las cantidades no pueden ser negativas.")
        .max(1000),
    }),
  ),
  motivoIncompleto: z
    .enum(["mesa_mantenimiento", "falta_moldes", "otro"])
    .nullish(),
  nota: z.string().trim().max(500, "La nota es demasiado larga.").optional(),
  /**
   * El cambio vigente que el operario tenia en pantalla (null si no habia
   * ninguno). Si mientras tanto alguien registro otro, se rechaza en vez de
   * pisarlo.
   */
  basadoEn: z.number().int().positive().nullable(),
});

/**
 * Registra el set de moldes que quedo montado en el carrusel.
 *
 * Lo decide el operario: el plan pide un set, pero si en el momento no se
 * puede, se monta lo que se pueda y queda asentado lo que realmente se hizo.
 * Por eso no se valida contra el plan ni se rechaza por pasarse del inventario
 * cargado -si el operario tiene el molde en la mano, el inventario es el que
 * esta mal-. Lo unico fisico que no se puede es poner mas moldes que lugares.
 */
export async function registrarCambioMoldes(
  entrada: z.input<typeof esquemaCambio>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("carrusel", "admin");
    const datos = esquemaCambio.parse(entrada);
    const { moldes_carrusel: lugares } = await leerConfig();

    const lineas = datos.lineas.filter((l) => l.cantidad > 0);
    const ids = new Set(lineas.map((l) => l.productoId));
    if (ids.size !== lineas.length) fallar("Hay un modelo repetido.");

    const total = totalMoldes(lineas);
    if (total === 0) fallar("El carrusel tiene que tener al menos un molde.");
    if (total > lugares) {
      fallar(
        `Son ${total} moldes y el carrusel tiene ${lugares} lugares. Sacá ${total - lugares}.`,
      );
    }

    const incompleto = total < lugares;
    const motivo = incompleto ? (datos.motivoIncompleto ?? null) : null;
    const nota = datos.nota || null;
    if (incompleto && !motivo) {
      fallar(
        `Quedan ${lugares - total} lugares sin molde. Elegí el motivo.`,
      );
    }
    if (motivo === "otro" && !nota) {
      fallar("Con el motivo «Otro», escribí en la nota qué pasó.");
    }

    const encontrados = lineas.length
      ? await db
          .select({ id: productos.id, nombre: productos.nombre })
          .from(productos)
          .where(inArray(productos.id, [...ids]))
      : [];
    if (encontrados.length !== ids.size) fallar("Alguno de los modelos ya no existe.");
    const nombre = new Map(encontrados.map((p) => [p.id, p.nombre]));
    const set: LineaMoldes[] = lineas.map((l) => ({
      productoId: l.productoId,
      nombre: nombre.get(l.productoId)!,
      cantidad: l.cantidad,
    }));

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_MOLDES})`);

      const [ultimo] = await tx
        .select({
          id: cambiosMoldes.id,
          motivo: cambiosMoldes.motivoIncompleto,
          nota: cambiosMoldes.nota,
        })
        .from(cambiosMoldes)
        .where(isNull(cambiosMoldes.anuladoEn))
        .orderBy(desc(cambiosMoldes.creadoEn), desc(cambiosMoldes.id))
        .limit(1);

      if ((ultimo?.id ?? null) !== datos.basadoEn) {
        fallar(
          "Alguien registró otro cambio de moldes recién. Revisá lo que quedó montado y volvé a intentar.",
        );
      }

      if (ultimo) {
        const actuales = await tx
          .select({
            productoId: cambioMoldesLineas.productoId,
            nombre: cambioMoldesLineas.productoNombre,
            cantidad: cambioMoldesLineas.cantidad,
          })
          .from(cambioMoldesLineas)
          .where(eq(cambioMoldesLineas.cambioId, ultimo.id));
        if (
          mismosMoldes(actuales, set) &&
          ultimo.motivo === motivo &&
          (ultimo.nota ?? null) === nota
        ) {
          fallar("Es el mismo set que ya está montado: no hay nada que cambiar.");
        }
      }

      const [cambio] = await tx
        .insert(cambiosMoldes)
        .values({
          usuarioId: sesion.uid,
          usuarioNombre: sesion.nombre,
          total,
          lugares,
          motivoIncompleto: motivo,
          nota,
        })
        .returning({ id: cambiosMoldes.id });

      await tx.insert(cambioMoldesLineas).values(
        set.map((l) => ({
          cambioId: cambio.id,
          productoId: l.productoId,
          productoNombre: l.nombre,
          cantidad: l.cantidad,
        })),
      );
    });

    revalidatePath("/", "layout");
  });
}

const esquemaAnular = z.object({
  id: z.number().int().positive(),
  motivo: z
    .string()
    .trim()
    .min(3, "Escribí por qué se anula.")
    .max(300, "El motivo es demasiado largo."),
});

/**
 * Anula un cambio de moldes mal registrado. Vuelve a quedar montado el set
 * anterior.
 *
 * Misma regla que los movimientos: el autor, en el mismo dia, y solo el
 * ultimo -cada set se apoya en el anterior, asi que anular uno del medio
 * dejaria a los siguientes contando una historia que no paso-. El admin puede
 * anular el de cualquiera y de cualquier dia, pero tambien solo el ultimo.
 */
export async function anularCambioMoldes(
  entrada: z.input<typeof esquemaAnular>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("carrusel", "admin");
    const datos = esquemaAnular.parse(entrada);

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_MOLDES})`);

      const [cambio] = await tx
        .select()
        .from(cambiosMoldes)
        .where(eq(cambiosMoldes.id, datos.id))
        .limit(1);
      if (!cambio) fallar("Ese cambio de moldes no existe.");
      if (cambio.anuladoEn) fallar("Ese cambio ya estaba anulado.");

      const [ultimo] = await tx
        .select({ id: cambiosMoldes.id })
        .from(cambiosMoldes)
        .where(isNull(cambiosMoldes.anuladoEn))
        .orderBy(desc(cambiosMoldes.creadoEn), desc(cambiosMoldes.id))
        .limit(1);
      if (ultimo?.id !== cambio.id) {
        fallar(
          "Después de este hubo otro cambio de moldes. Sólo se puede anular el último.",
        );
      }

      if (sesion.rol !== "admin") {
        if (cambio.usuarioId !== sesion.uid) {
          fallar("Sólo quien registró el cambio puede anularlo.");
        }
        if (fechaLocal(cambio.creadoEn) !== fechaLocal()) {
          fallar("Sólo se puede anular un cambio del mismo día.");
        }
      }

      await tx
        .update(cambiosMoldes)
        .set({
          anuladoEn: new Date(),
          anuladoPorId: sesion.uid,
          anuladoPorNombre: sesion.nombre,
          motivoAnulacion: datos.motivo,
        })
        .where(and(eq(cambiosMoldes.id, cambio.id), isNull(cambiosMoldes.anuladoEn)));
    });

    revalidatePath("/", "layout");
  });
}

const esquemaInventario = z.object({
  items: z.array(
    z.object({
      productoId: z.number().int().positive(),
      moldes: z
        .number()
        .int()
        .min(0, "La cantidad de moldes no puede ser negativa.")
        .max(1000, "Esa cantidad de moldes es demasiado grande."),
    }),
  ),
});

/**
 * Cuantos moldes hay de cada modelo. Es el techo de lo que se puede pedir en
 * el plan, no de lo que el operario puede montar.
 */
export async function guardarInventarioMoldes(
  entrada: z.input<typeof esquemaInventario>,
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { items } = esquemaInventario.parse(entrada);

    await db.transaction(async (tx) => {
      for (const i of items) {
        await tx
          .update(productos)
          .set({ moldes: i.moldes })
          .where(eq(productos.id, i.productoId));
      }
    });

    revalidatePath("/", "layout");
  });
}

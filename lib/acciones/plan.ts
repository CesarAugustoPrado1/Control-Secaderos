"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  motivosDesvio,
  planLineas,
  planes,
  productos,
  type Sector,
} from "../db/schema";
import { autorizar } from "../auth";
import { ejecutar, fallar, type Resultado } from "./comun";

function revalidar() {
  revalidatePath("/", "layout");
}

const esquemaFecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");

const esquemaSector = z.enum(["carrusel", "paletizado"]);

const esquemaPlan = z.object({
  fecha: esquemaFecha,
  sector: esquemaSector,
  lineas: z
    .array(
      z.object({
        productoId: z.number().int().positive(),
        secaderos: z.number().int().min(0).max(500),
      }),
    )
    .default([]),
  nota: z.string().trim().max(500).optional(),
});

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

    const lineas = datos.lineas.filter((l) => l.secaderos > 0);

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
        })),
      );
    });

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

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { motivosDesperdicio, productos, roturasCarrusel } from "../db/schema";
import { autorizar } from "../auth";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * Roturas del carrusel: lo que se rompe antes de llegar al secadero.
 *
 * No pasan por el motor de movimientos porque no le pasan a ningun secadero.
 * El carrusel siempre trata de sacar secaderos completos, asi que la placa rota
 * se descarta en la linea y el secadero se llena igual: no hay estado que
 * cambiar ni contenido que descontar, solo un hecho que registrar con su fecha,
 * su modelo y su motivo.
 */

const esquema = z.object({
  productoId: z.number().int().positive("Elegí el producto que se rompió."),
  cantidad: z
    .number()
    .int()
    .min(1, "La rotura tiene que ser de al menos 1 placa.")
    .max(100000, "Esa cantidad es demasiado grande."),
  motivoId: z.number().int().positive("Elegí el motivo de la rotura."),
  nota: z.string().trim().max(500).optional(),
});

export async function registrarRoturaCarrusel(
  entrada: z.input<typeof esquema>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("carrusel", "llenado_manual", "admin");
    const datos = esquema.parse(entrada);

    const [producto] = await db
      .select({ id: productos.id, nombre: productos.nombre })
      .from(productos)
      .where(eq(productos.id, datos.productoId))
      .limit(1);
    if (!producto) fallar("Ese producto ya no existe.");

    const [motivo] = await db
      .select({
        id: motivosDesperdicio.id,
        nombre: motivosDesperdicio.nombre,
        activo: motivosDesperdicio.activo,
      })
      .from(motivosDesperdicio)
      .where(eq(motivosDesperdicio.id, datos.motivoId))
      .limit(1);
    if (!motivo) fallar("Ese motivo ya no existe.");
    if (!motivo.activo) fallar(`El motivo "${motivo.nombre}" está desactivado.`);

    await db.insert(roturasCarrusel).values({
      productoId: producto.id,
      productoNombre: producto.nombre,
      cantidad: datos.cantidad,
      motivoId: motivo.id,
      motivoNombre: motivo.nombre,
      usuarioId: sesion.uid,
      usuarioNombre: sesion.nombre,
      nota: datos.nota || null,
    });

    revalidatePath("/", "layout");
  });
}

/**
 * Borra una rotura mal cargada. Solo el admin.
 *
 * El operario no puede corregir la suya por la misma razon que no puede editar
 * un movimiento: si el que carga el numero es el que lo puede cambiar despues,
 * el registro deja de servir para medir. Un 500 en lugar de un 50 lo arregla el
 * admin, igual que una correccion de secadero.
 */
export async function eliminarRoturaCarrusel(entrada: {
  id: number;
}): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id } = z.object({ id: z.number().int().positive() }).parse(entrada);

    const [existe] = await db
      .select({ id: roturasCarrusel.id })
      .from(roturasCarrusel)
      .where(eq(roturasCarrusel.id, id))
      .limit(1);
    if (!existe) fallar("Esa rotura ya no existe.");

    await db.delete(roturasCarrusel).where(eq(roturasCarrusel.id, id));
    revalidatePath("/", "layout");
  });
}

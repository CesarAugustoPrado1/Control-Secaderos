"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { consumoYeso, tipoYesoEnum } from "../db/schema";
import { autorizar } from "../auth";
import { leerConfig } from "../consultas";
import { ejecutar, fallar, type Resultado } from "./comun";

/**
 * Bolsones de yeso consumidos y baldes de desperdicio.
 *
 * No pasan por el motor de movimientos porque no le pasan a ningun secadero:
 * el yeso se consume en la linea, antes de que exista la placa. Es el mismo
 * caso que las roturas del carrusel, un hecho suelto con su fecha y su autor.
 *
 * Se registra por evento y no como un total diario editable. Asi sirven los
 * dos modos que se usan en el piso: el que toca "+1" cada vez que abre un
 * bolson y el que al final del dia carga los 7 juntos. Sumar eventos da lo
 * mismo en los dos casos; un total editable, en cambio, obligaria a decidir
 * quien pisa a quien cuando dos personas cargan el mismo dia.
 */

const esquema = z.object({
  tipo: z.enum(tipoYesoEnum.enumValues),
  cantidad: z
    .number()
    .int("Cargá unidades enteras.")
    .min(1, "Tiene que ser al menos 1.")
    .max(1000, "Esa cantidad es demasiado grande para un solo registro."),
  nota: z.string().trim().max(500).optional(),
});

export async function registrarYeso(
  entrada: z.input<typeof esquema>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("carrusel", "llenado_manual", "admin");
    const datos = esquema.parse(entrada);

    // El peso se congela al registrar: si cambia el proveedor, lo ya cargado
    // tiene que seguir dando los mismos kilos. Ver `consumoYeso` en el esquema.
    const cfg = await leerConfig();
    const kgPorUnidad =
      datos.tipo === "bolson" ? cfg.kg_por_bolson : cfg.kg_por_balde_yeso;

    await db.insert(consumoYeso).values({
      tipo: datos.tipo,
      cantidad: datos.cantidad,
      kgPorUnidad,
      usuarioId: sesion.uid,
      usuarioNombre: sesion.nombre,
      nota: datos.nota || null,
    });

    revalidatePath("/", "layout");
  });
}

/**
 * Borra un registro mal cargado. Solo el admin, igual que con las roturas.
 *
 * Con un boton de "+1" a un toque, el error de dedo es cuestion de tiempo. Pero
 * si el que carga el numero es el mismo que lo puede borrar despues, el
 * registro deja de servir para medir: por eso el arreglo lo hace el admin.
 */
export async function eliminarRegistroYeso(entrada: {
  id: number;
}): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id } = z.object({ id: z.number().int().positive() }).parse(entrada);

    const [existe] = await db
      .select({ id: consumoYeso.id })
      .from(consumoYeso)
      .where(eq(consumoYeso.id, id))
      .limit(1);
    if (!existe) fallar("Ese registro ya no existe.");

    await db.delete(consumoYeso).where(eq(consumoYeso.id, id));
    revalidatePath("/", "layout");
  });
}

import "server-only";
import { z } from "zod";

/** Resultado uniforme de toda server action, para poder mostrarlo en la UI. */
export type Resultado<T = void> =
  | { ok: true; datos: T }
  | { ok: false; error: string };

function error(mensaje: string): { ok: false; error: string } {
  return { ok: false, error: mensaje };
}

/**
 * Error de negocio esperable (capacidad excedida, estado cambiado, etc.).
 * Se lanza dentro de la transaccion para abortarla y se traduce a un mensaje
 * legible; cualquier otra excepcion es un bug y se reporta como tal.
 */
export class ErrorDeNegocio extends Error {}

export async function ejecutar<T>(
  fn: () => Promise<T>,
): Promise<Resultado<T>> {
  try {
    return { ok: true, datos: await fn() };
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return error(e.message);
    if (e instanceof z.ZodError) {
      return error(e.issues[0]?.message ?? "Datos inválidos.");
    }
    console.error("[accion]", e);
    return error(
      "No se pudo guardar. Revisá la conexión y volvé a intentar.",
    );
  }
}

export function fallar(mensaje: string): never {
  throw new ErrorDeNegocio(mensaje);
}

/* -------------------------------------------------------------------------- */
/* Esquemas compartidos                                                       */
/* -------------------------------------------------------------------------- */

export const esquemaItem = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().int().min(0, "Las cantidades no pueden ser negativas."),
});

export const esquemaRotura = z.object({
  productoId: z.number().int().positive(),
  cantidad: z.number().int().min(1, "La rotura debe ser de al menos 1 placa."),
  motivoId: z.number().int().positive("Elegí un motivo para el desperdicio."),
});

export type Item = z.infer<typeof esquemaItem>;
export type Rotura = z.infer<typeof esquemaRotura>;

export const esquemaNota = z
  .string()
  .trim()
  .max(500, "La nota es demasiado larga.")
  .optional()
  .transform((v) => (v ? v : null));

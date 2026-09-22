"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { autorizar } from "../auth";
import { leerConfig } from "../consultas";
import {
  cantidadesCargadas,
  mismaCarga,
  mismasRoturas,
  roturasRegistradas,
} from "../correccion";
import { ejecutar, esquemaItem, esquemaRotura, fallar, type Resultado } from "./comun";
import {
  aplicarMovida,
  cargarCatalogo,
  procesarTransicion,
  validarCarga,
  validarCupoHorno,
} from "./motor";
import { deshacer } from "./motor-correccion";

/**
 * Anular y corregir movimientos del piso. La regla -quien, hasta cuando- vive
 * en `lib/correccion.ts`; la mecanica de deshacer, en `motor-correccion.ts`.
 * Aca solo se arma cada operacion.
 *
 * Pueden entrar todos los roles que operan. Que este usuario pueda tocar ESTE
 * movimiento lo decide `deshacer`, adentro de la transaccion y con el
 * secadero bloqueado.
 */
const ROLES = ["carrusel", "llenado_manual", "horno", "paletizado", "admin"] as const;

/**
 * El motivo es obligatorio y corto a proposito: "puse 36 y eran 136" alcanza.
 * Sin el, en un mes nadie sabe si una anulacion fue un error de tipeo o un
 * secadero que se cargo dos veces.
 */
const esquemaMotivo = z
  .string()
  .trim()
  .min(3, "Escribí en pocas palabras qué pasó.")
  .max(300, "El motivo es demasiado largo.");

function revalidar() {
  revalidatePath("/", "layout");
}

/* -------------------------------------------------------------------------- */
/* Anular                                                                     */
/* -------------------------------------------------------------------------- */

const esquemaAnular = z.object({
  movimientoId: z.number().int().positive(),
  motivo: esquemaMotivo,
});

/**
 * Deshace el movimiento y deja el secadero como estaba antes. Es la salida para
 * lo que no se arregla cambiando un numero: cargar el 45 cuando era el 54,
 * meter al horno uno que no iba, marcar como seco uno que nunca salio.
 */
export async function anularMovimiento(
  entrada: z.input<typeof esquemaAnular>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar(...ROLES);
    const datos = esquemaAnular.parse(entrada);
    const cfg = await leerConfig();

    await db.transaction(async (tx) => {
      const d = await deshacer(tx, sesion, datos.movimientoId, datos.motivo);

      // Anular una salida devuelve el secadero al horno, y el horno puede
      // haberse llenado mientras tanto con los que se metieron despues. Si no
      // entra, es que en realidad si salio: la app no puede decir que hay 16
      // adentro de un horno de 15.
      if (d.original.tipo === "salida_horno") {
        await validarCupoHorno(
          tx,
          [d.secadero],
          cfg.capacidad_horno,
          () =>
            `el ${d.secadero.numero} volvería a ocupar un lugar. Si de verdad ` +
            "no salió, sacá otro primero o avisale al administrador.",
        );
      }
    });

    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Corregir                                                                   */
/* -------------------------------------------------------------------------- */

const esquemaCorregir = z.object({
  movimientoId: z.number().int().positive(),
  motivo: esquemaMotivo,
  /** Para una carga: lo que de verdad se cargo. */
  items: z.array(esquemaItem).optional(),
  /** Para cualquier otro movimiento: lo que de verdad se rompio. */
  roturas: z.array(esquemaRotura).optional(),
});

/**
 * Anula el movimiento y lo rehace con los datos correctos, en un solo paso.
 *
 * El reemplazo es un movimiento comun del mismo tipo, con la hora y el autor
 * del original: todos los reportes lo cuentan como la carga -o la salida, o la
 * descarga- de ese dia, sin saber que hubo una correccion. El original queda
 * anulado y visible en el historial, con quien lo corrigio y por que.
 *
 * Rehacer pasa por las mismas validaciones que hacerlo la primera vez: la
 * capacidad del secadero, que los modelos sean de su tipo, que las roturas
 * no superen lo que habia adentro.
 */
export async function corregirMovimiento(
  entrada: z.input<typeof esquemaCorregir>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar(...ROLES);
    const datos = esquemaCorregir.parse(entrada);

    await db.transaction(async (tx) => {
      const d = await deshacer(tx, sesion, datos.movimientoId, datos.motivo);
      const { original, secadero, reemplazo } = d;

      if (original.tipo === "carga") {
        const items = (datos.items ?? []).filter((i) => i.cantidad > 0);
        const cantidades = new Map(items.map((i) => [i.productoId, i.cantidad]));
        if (mismaCarga(cantidades, cantidadesCargadas(d.lineas))) {
          fallar("No cambiaste nada: la carga quedó igual que estaba.");
        }

        const catalogo = await cargarCatalogo(
          tx,
          [...new Set(items.map((i) => i.productoId))],
          [],
        );
        // Sin exigir activos: si el producto se suspendio despues de cargarlo,
        // corregir la cantidad tiene que seguir andando. El formulario igual
        // solo ofrece activos para agregar.
        validarCarga(secadero, items, catalogo, { exigirActivos: false });

        await aplicarMovida(tx, sesion, catalogo, {
          secadero,
          tipo: "carga",
          estadoHasta: original.estadoHasta,
          cantidades,
          contenidoFinal: cantidades,
          roturas: [],
          nota: original.nota,
          reemplazo,
        });
        return;
      }

      const roturas = datos.roturas ?? [];
      if (mismasRoturas(roturas, roturasRegistradas(d.lineas))) {
        fallar("No cambiaste nada: las roturas quedaron igual que estaban.");
      }

      await procesarTransicion(tx, sesion, {
        secadero,
        roturas,
        tipo: original.tipo,
        estadoHasta: original.estadoHasta,
        vaciar: original.tipo === "descarga",
        nota: original.nota,
        reemplazo,
      });
    });

    revalidar();
  });
}

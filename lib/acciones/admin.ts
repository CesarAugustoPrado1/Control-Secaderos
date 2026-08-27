"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  config,
  motivosDesperdicio,
  movimientos,
  productos,
  secaderoContenido,
  secaderos,
  usuarios,
} from "../db/schema";
import { autorizar, hashPin } from "../auth";
import { CONFIG_POR_DEFECTO } from "../configuracion";
import { ejecutar, fallar, type Resultado } from "./comun";
import { ETIQUETA_ESTADO } from "./motor";

function revalidar() {
  revalidatePath("/", "layout");
}

/* -------------------------------------------------------------------------- */
/* Productos                                                                  */
/* -------------------------------------------------------------------------- */

const esquemaProducto = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, "El modelo necesita un nombre.").max(80),
  tamano: z.enum(["grande", "chico"]),
});

export async function guardarProducto(
  entrada: z.input<typeof esquemaProducto>,
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const datos = esquemaProducto.parse(entrada);

    if (datos.id) {
      const [actual] = await db
        .select()
        .from(productos)
        .where(eq(productos.id, datos.id))
        .limit(1);
      if (!actual) fallar("Ese modelo ya no existe.");

      // Cambiar el tamano de un modelo que ya esta adentro de un secadero
      // volveria invalida esa carga (y su capacidad). Se bloquea.
      if (actual.tamano !== datos.tamano) {
        const [{ enUso }] = await db
          .select({ enUso: count() })
          .from(secaderoContenido)
          .where(eq(secaderoContenido.productoId, datos.id));
        if (enUso > 0) {
          fallar(
            "No se puede cambiar el tamaño: el modelo está cargado en un secadero. Descargalo primero.",
          );
        }
      }

      await db
        .update(productos)
        .set({ nombre: datos.nombre, tamano: datos.tamano })
        .where(eq(productos.id, datos.id));
    } else {
      await db
        .insert(productos)
        .values({ nombre: datos.nombre, tamano: datos.tamano });
    }

    revalidar();
  });
}

export async function cambiarEstadoProducto(
  entrada: { id: number; activo: boolean },
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id, activo } = z
      .object({ id: z.number().int().positive(), activo: z.boolean() })
      .parse(entrada);

    // Suspender no borra: los modelos suspendidos dejan de ofrecerse en carrusel
    // pero siguen apareciendo en el historial y en los secaderos ya cargados.
    await db.update(productos).set({ activo }).where(eq(productos.id, id));
    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Secaderos                                                                  */
/* -------------------------------------------------------------------------- */

const esquemaSecadero = z.object({
  id: z.number().int().positive().optional(),
  numero: z
    .number()
    .int()
    .positive("El número de secadero tiene que ser mayor a cero."),
  tamano: z.enum(["grande", "chico"]),
});

export async function guardarSecadero(
  entrada: z.input<typeof esquemaSecadero>,
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const datos = esquemaSecadero.parse(entrada);

    const repetido = await db
      .select({ id: secaderos.id })
      .from(secaderos)
      .where(
        datos.id
          ? and(eq(secaderos.numero, datos.numero), ne(secaderos.id, datos.id))
          : eq(secaderos.numero, datos.numero),
      )
      .limit(1);
    if (repetido.length) fallar(`Ya existe el secadero ${datos.numero}.`);

    if (datos.id) {
      const [actual] = await db
        .select()
        .from(secaderos)
        .where(eq(secaderos.id, datos.id))
        .limit(1);
      if (!actual) fallar("Ese secadero ya no existe.");

      if (actual.tamano !== datos.tamano && actual.estado !== "vacio") {
        fallar(
          `El secadero ${actual.numero} está ${ETIQUETA_ESTADO[actual.estado]}. ` +
            "Para cambiarle el tamaño tiene que estar vacío.",
        );
      }

      await db
        .update(secaderos)
        .set({ numero: datos.numero, tamano: datos.tamano })
        .where(eq(secaderos.id, datos.id));
    } else {
      await db
        .insert(secaderos)
        .values({ numero: datos.numero, tamano: datos.tamano });
    }

    revalidar();
  });
}

export async function cambiarEstadoSecadero(
  entrada: { id: number; activo: boolean },
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id, activo } = z
      .object({ id: z.number().int().positive(), activo: z.boolean() })
      .parse(entrada);

    const [actual] = await db
      .select()
      .from(secaderos)
      .where(eq(secaderos.id, id))
      .limit(1);
    if (!actual) fallar("Ese secadero ya no existe.");

    // Dar de baja un secadero con placas adentro las haria desaparecer del
    // circuito sin registro. Primero hay que vaciarlo.
    if (!activo && actual.estado !== "vacio") {
      fallar(
        `El secadero ${actual.numero} está ${ETIQUETA_ESTADO[actual.estado]}. ` +
          "Para darlo de baja tiene que estar vacío.",
      );
    }

    await db.update(secaderos).set({ activo }).where(eq(secaderos.id, id));
    revalidar();
  });
}

export async function eliminarSecadero(entrada: {
  id: number;
}): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id } = z.object({ id: z.number().int().positive() }).parse(entrada);

    // Solo se borra de verdad un secadero sin historial; si ya trabajo, la baja
    // logica preserva sus movimientos.
    const [{ usados }] = await db
      .select({ usados: count() })
      .from(movimientos)
      .where(eq(movimientos.secaderoId, id));

    if (usados > 0) {
      fallar(
        "Este secadero ya tiene movimientos registrados. Dalo de baja en lugar de eliminarlo, así el historial se conserva.",
      );
    }

    await db.delete(secaderos).where(eq(secaderos.id, id));
    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Usuarios                                                                   */
/* -------------------------------------------------------------------------- */

const esquemaUsuario = z.object({
  id: z.number().int().positive().optional(),
  usuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9._-]{3,20}$/,
      "El usuario va sin espacios ni acentos, entre 3 y 20 caracteres.",
    ),
  nombre: z.string().trim().min(1, "Escribí el nombre de la persona.").max(80),
  rol: z.enum(["admin", "carrusel", "horno", "paletizado", "auditor"]),
  pin: z
    .string()
    .regex(/^\d{4,8}$/, "El PIN son entre 4 y 8 números.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export async function guardarUsuario(
  entrada: z.input<typeof esquemaUsuario>,
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    const datos = esquemaUsuario.parse(entrada);

    const repetido = await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(
        datos.id
          ? and(eq(usuarios.usuario, datos.usuario), ne(usuarios.id, datos.id))
          : eq(usuarios.usuario, datos.usuario),
      )
      .limit(1);
    if (repetido.length) fallar(`El usuario "${datos.usuario}" ya está tomado.`);

    if (datos.id) {
      const [actual] = await db
        .select()
        .from(usuarios)
        .where(eq(usuarios.id, datos.id))
        .limit(1);
      if (!actual) fallar("Ese usuario ya no existe.");

      if (actual.rol === "admin" && datos.rol !== "admin") {
        await exigirOtroAdmin(actual.id);
      }
      if (datos.id === sesion.uid && datos.rol !== "admin") {
        fallar("No podés quitarte a vos mismo el rol de administrador.");
      }

      await db
        .update(usuarios)
        .set({
          usuario: datos.usuario,
          nombre: datos.nombre,
          rol: datos.rol,
          // Cambiar el PIN limpia el bloqueo por intentos fallidos.
          ...(datos.pin
            ? {
                pinHash: await hashPin(datos.pin),
                intentosFallidos: 0,
                bloqueadoHasta: null,
              }
            : {}),
        })
        .where(eq(usuarios.id, datos.id));
    } else {
      if (!datos.pin) fallar("Definí un PIN para el usuario nuevo.");
      await db.insert(usuarios).values({
        usuario: datos.usuario,
        nombre: datos.nombre,
        rol: datos.rol,
        pinHash: await hashPin(datos.pin),
      });
    }

    revalidar();
  });
}

export async function cambiarEstadoUsuario(
  entrada: { id: number; activo: boolean },
): Promise<Resultado> {
  return ejecutar(async () => {
    const sesion = await autorizar("admin");
    const { id, activo } = z
      .object({ id: z.number().int().positive(), activo: z.boolean() })
      .parse(entrada);

    if (!activo) {
      if (id === sesion.uid) fallar("No podés darte de baja a vos mismo.");
      const [actual] = await db
        .select({ rol: usuarios.rol })
        .from(usuarios)
        .where(eq(usuarios.id, id))
        .limit(1);
      if (actual?.rol === "admin") await exigirOtroAdmin(id);
    }

    await db
      .update(usuarios)
      .set({ activo, intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, id));
    revalidar();
  });
}

export async function desbloquearUsuario(entrada: {
  id: number;
}): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id } = z.object({ id: z.number().int().positive() }).parse(entrada);
    await db
      .update(usuarios)
      .set({ intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, id));
    revalidar();
  });
}

/** Evita quedarse sin ningun administrador activo y perder el acceso al panel. */
async function exigirOtroAdmin(excepto: number) {
  const [{ otros }] = await db
    .select({ otros: count() })
    .from(usuarios)
    .where(
      and(
        eq(usuarios.rol, "admin"),
        eq(usuarios.activo, true),
        ne(usuarios.id, excepto),
      ),
    );
  if (otros === 0) {
    fallar(
      "Tiene que quedar al menos un administrador activo. Creá otro antes de hacer este cambio.",
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Motivos de desperdicio                                                     */
/* -------------------------------------------------------------------------- */

const esquemaMotivo = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, "El motivo necesita un nombre.").max(60),
});

export async function guardarMotivo(
  entrada: z.input<typeof esquemaMotivo>,
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const datos = esquemaMotivo.parse(entrada);

    if (datos.id) {
      await db
        .update(motivosDesperdicio)
        .set({ nombre: datos.nombre })
        .where(eq(motivosDesperdicio.id, datos.id));
    } else {
      await db.insert(motivosDesperdicio).values({ nombre: datos.nombre });
    }
    revalidar();
  });
}

export async function cambiarEstadoMotivo(
  entrada: { id: number; activo: boolean },
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id, activo } = z
      .object({ id: z.number().int().positive(), activo: z.boolean() })
      .parse(entrada);
    await db
      .update(motivosDesperdicio)
      .set({ activo })
      .where(eq(motivosDesperdicio.id, id));
    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Configuracion                                                              */
/* -------------------------------------------------------------------------- */

const esquemaConfig = z.object({
  capacidad_grande: z.number().int().min(1).max(10000),
  capacidad_chico: z.number().int().min(1).max(10000),
  capacidad_horno: z.number().int().min(1).max(1000),
});

export async function guardarConfig(
  entrada: z.input<typeof esquemaConfig>,
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const datos = esquemaConfig.parse(entrada);

    for (const clave of Object.keys(CONFIG_POR_DEFECTO) as Array<
      keyof typeof CONFIG_POR_DEFECTO
    >) {
      await db
        .insert(config)
        .values({ clave, valor: String(datos[clave]) })
        .onConflictDoUpdate({
          target: config.clave,
          set: { valor: String(datos[clave]) },
        });
    }

    revalidar();
  });
}

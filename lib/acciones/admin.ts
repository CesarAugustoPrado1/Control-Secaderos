"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  config,
  motivosDesperdicio,
  movimientoLineas,
  movimientos,
  planLineas,
  productos,
  roturasCarrusel,
  secaderoContenido,
  secaderos,
  tipos,
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
/* Tipos de secadero                                                          */
/* -------------------------------------------------------------------------- */

const esquemaTipo = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, "El tipo necesita un nombre.").max(40),
  capacidad: z
    .number()
    .int()
    .positive("La capacidad tiene que ser mayor a cero.")
    .max(100000),
  orden: z.number().int().min(0).max(999).default(0),
});

export async function guardarTipo(
  entrada: z.input<typeof esquemaTipo>,
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const datos = esquemaTipo.parse(entrada);

    const repetido = await db
      .select({ id: tipos.id })
      .from(tipos)
      .where(
        datos.id
          ? and(eq(tipos.nombre, datos.nombre), ne(tipos.id, datos.id))
          : eq(tipos.nombre, datos.nombre),
      )
      .limit(1);
    if (repetido.length) fallar(`Ya existe un tipo llamado "${datos.nombre}".`);

    if (datos.id) {
      // Bajar la capacidad no invalida las cargas que ya estan adentro: se
      // avisa, pero se permite, porque puede ser justamente una correccion.
      await db
        .update(tipos)
        .set({
          nombre: datos.nombre,
          capacidad: datos.capacidad,
          orden: datos.orden,
        })
        .where(eq(tipos.id, datos.id));
    } else {
      await db.insert(tipos).values(datos);
    }

    revalidar();
  });
}

export async function cambiarEstadoTipo(
  entrada: { id: number; activo: boolean },
): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id, activo } = z
      .object({ id: z.number().int().positive(), activo: z.boolean() })
      .parse(entrada);

    // Desactivar un tipo lo saca de los selectores, pero los secaderos y modelos
    // que ya lo usan siguen funcionando: no se rompe nada de lo que esta en curso.
    await db.update(tipos).set({ activo }).where(eq(tipos.id, id));
    revalidar();
  });
}

export async function eliminarTipo(entrada: { id: number }): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id } = z.object({ id: z.number().int().positive() }).parse(entrada);

    const [{ conSecaderos }] = await db
      .select({ conSecaderos: count() })
      .from(secaderos)
      .where(eq(secaderos.tipoId, id));
    const [{ conProductos }] = await db
      .select({ conProductos: count() })
      .from(productos)
      .where(eq(productos.tipoId, id));

    if (conSecaderos > 0 || conProductos > 0) {
      fallar(
        `No se puede eliminar: lo usan ${conSecaderos} secaderos y ${conProductos} productos. ` +
          "Desactivalo en lugar de eliminarlo.",
      );
    }

    // Los movimientos guardan el tipo del secadero al momento en que pasaron.
    // Sin este chequeo, borrar un tipo con historial lo rechaza igual -por la
    // clave foranea- pero con un error de base que en pantalla sale como
    // "revisá la conexión", que no ayuda a nadie.
    const [{ enHistorial }] = await db
      .select({ enHistorial: count() })
      .from(movimientos)
      .where(eq(movimientos.secaderoTipoId, id));

    if (enHistorial > 0) {
      fallar(
        `No se puede eliminar: hay ${enHistorial} movimientos registrados con este tipo. ` +
          "Desactivalo en lugar de eliminarlo, así el historial se conserva.",
      );
    }

    await db.delete(tipos).where(eq(tipos.id, id));
    revalidar();
  });
}

/* -------------------------------------------------------------------------- */
/* Productos                                                                  */
/* -------------------------------------------------------------------------- */

const esquemaProducto = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, "El producto necesita un nombre.").max(80),
  tipoId: z.number().int().positive("Elegí el tipo de secadero del producto."),
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
      if (!actual) fallar("Ese producto ya no existe.");

      // Cambiar el tipo de un modelo que ya esta adentro de un secadero
      // volveria invalida esa carga (y su capacidad). Se bloquea.
      if (actual.tipoId !== datos.tipoId) {
        const [{ enUso }] = await db
          .select({ enUso: count() })
          .from(secaderoContenido)
          .where(eq(secaderoContenido.productoId, datos.id));
        if (enUso > 0) {
          fallar(
            "No se puede cambiar el tipo: el producto está cargado en un secadero. Descargalo primero.",
          );
        }
      }

      await db
        .update(productos)
        .set({ nombre: datos.nombre, tipoId: datos.tipoId })
        .where(eq(productos.id, datos.id));
    } else {
      await db
        .insert(productos)
        .values({ nombre: datos.nombre, tipoId: datos.tipoId });
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

    // Suspender no borra: los productos suspendidos dejan de ofrecerse al
    // cargar pero siguen apareciendo en el historial y en los secaderos ya
    // cargados.
    await db.update(productos).set({ activo }).where(eq(productos.id, id));
    revalidar();
  });
}

export async function eliminarProducto(entrada: {
  id: number;
}): Promise<Resultado> {
  return ejecutar(async () => {
    await autorizar("admin");
    const { id } = z.object({ id: z.number().int().positive() }).parse(entrada);

    // Un producto con historial no se puede borrar sin dejar movimientos
    // apuntando a la nada. Solo desaparece de verdad el que nunca se uso.
    const [{ enMovimientos }] = await db
      .select({ enMovimientos: count() })
      .from(movimientoLineas)
      .where(eq(movimientoLineas.productoId, id));

    if (enMovimientos > 0) {
      fallar(
        "Este producto ya tiene movimientos registrados. Suspendelo en lugar de eliminarlo, así el historial se conserva.",
      );
    }

    const [{ enSecaderos }] = await db
      .select({ enSecaderos: count() })
      .from(secaderoContenido)
      .where(eq(secaderoContenido.productoId, id));

    if (enSecaderos > 0) {
      fallar(
        "Este producto está cargado en un secadero ahora mismo. Descargalo primero.",
      );
    }

    // Roturas del carrusel y lineas de plan tambien apuntan al producto. Si no
    // se chequean, la clave foranea rechaza el borrado con un error de base que
    // llega a la pantalla como "no se pudo guardar, revisá la conexión".
    const [{ enRoturas }] = await db
      .select({ enRoturas: count() })
      .from(roturasCarrusel)
      .where(eq(roturasCarrusel.productoId, id));

    if (enRoturas > 0) {
      fallar(
        "Este producto tiene roturas de carrusel registradas. Suspendelo en lugar de eliminarlo.",
      );
    }

    const [{ enPlanes }] = await db
      .select({ enPlanes: count() })
      .from(planLineas)
      .where(eq(planLineas.productoId, id));

    if (enPlanes > 0) {
      fallar(
        `Este producto figura en ${enPlanes} ${enPlanes === 1 ? "línea" : "líneas"} de órdenes de producción. ` +
          "Sacalo de esos planes o suspendelo en lugar de eliminarlo.",
      );
    }

    await db.delete(productos).where(eq(productos.id, id));
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
  tipoId: z.number().int().positive("Elegí el tipo de secadero."),
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

      if (actual.tipoId !== datos.tipoId && actual.estado !== "vacio") {
        fallar(
          `El secadero ${actual.numero} está ${ETIQUETA_ESTADO[actual.estado]}. ` +
            "Para cambiarle el tipo tiene que estar vacío.",
        );
      }

      await db
        .update(secaderos)
        .set({ numero: datos.numero, tipoId: datos.tipoId })
        .where(eq(secaderos.id, datos.id));
    } else {
      await db
        .insert(secaderos)
        .values({ numero: datos.numero, tipoId: datos.tipoId });
    }

    revalidar();
  });
}

const esquemaRango = z.object({
  desde: z.number().int().positive("El número inicial tiene que ser mayor a cero."),
  hasta: z.number().int().positive("El número final tiene que ser mayor a cero."),
  tipoId: z.number().int().positive("Elegí el tipo de secadero."),
});

/**
 * Alta masiva por rango. Con 250 secaderos, cargarlos de a uno no es una
 * opcion. Los numeros que ya existen se saltean en vez de fallar, asi se puede
 * correr de nuevo para completar huecos sin tocar lo que ya estaba.
 */
export async function crearSecaderosPorRango(
  entrada: z.input<typeof esquemaRango>,
): Promise<Resultado<{ creados: number; salteados: number[] }>> {
  return ejecutar(async () => {
    await autorizar("admin");
    const datos = esquemaRango.parse(entrada);

    if (datos.hasta < datos.desde) {
      fallar("El número final tiene que ser mayor o igual al inicial.");
    }
    const cantidad = datos.hasta - datos.desde + 1;
    if (cantidad > 1000) {
      fallar("El rango es demasiado grande: probá de a 1000 como máximo.");
    }

    const [tipo] = await db
      .select()
      .from(tipos)
      .where(eq(tipos.id, datos.tipoId))
      .limit(1);
    if (!tipo) fallar("Ese tipo de secadero ya no existe.");

    const pedidos = Array.from({ length: cantidad }, (_, i) => datos.desde + i);
    const existentes = await db
      .select({ numero: secaderos.numero })
      .from(secaderos)
      .where(inArray(secaderos.numero, pedidos));

    const ocupados = new Set(existentes.map((e) => e.numero));
    const aCrear = pedidos.filter((n) => !ocupados.has(n));

    if (aCrear.length > 0) {
      await db
        .insert(secaderos)
        .values(aCrear.map((numero) => ({ numero, tipoId: datos.tipoId })));
    }

    revalidar();
    return { creados: aCrear.length, salteados: [...ocupados].sort((a, b) => a - b) };
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
  rol: z.enum([
    "admin",
    "carrusel",
    "llenado_manual",
    "horno",
    "paletizado",
    "administrativo",
    "auditor",
  ]),
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
  capacidad_horno: z.number().int().min(1).max(1000),
  minutos_horno_objetivo: z.number().int().min(1).max(100000),
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

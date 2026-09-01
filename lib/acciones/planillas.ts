"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { productos, secaderoContenido, secaderos, tipos } from "../db/schema";
import { autorizar } from "../auth";
import { clave, leerEntero, leerPlanilla, leerSiNo } from "../planilla";
import { ejecutar, fallar, type Resultado } from "./comun";
import { ETIQUETA_ESTADO } from "./motor";

/**
 * Importacion de secaderos y productos desde Excel.
 *
 * Dos decisiones que valen mas que el codigo:
 *
 * 1. La planilla NUNCA borra. Lo que no esta en el archivo se queda como
 *    estaba. Subir una planilla recortada por error no puede vaciar la
 *    instalacion.
 * 2. O entra todo o no entra nada. Si una sola fila tiene un problema se
 *    rechaza la importacion entera, porque despues de un import a medias nadie
 *    sabe que quedo aplicado y que no.
 *
 * Por eso son dos pasos: primero `analizar*` muestra fila por fila que va a
 * pasar, y recien despues `importar*` lo aplica en una transaccion.
 */

export type AccionFila = "crear" | "actualizar" | "igual" | "error";

export type FilaAnalizada = {
  fila: number;
  etiqueta: string;
  accion: AccionFila;
  detalle: string;
  /**
   * Tipo de secadero al que queda asociada la fila, para mostrarlo con su
   * etiqueta de color. "Secadero 2 - sin cambios" no dice nada si no se ve si
   * es de placa grande o chica, que es justamente lo que se esta revisando.
   */
  tipoId?: number;
  tipoNombre?: string;
};

export type Analisis = {
  filas: FilaAnalizada[];
  crear: number;
  actualizar: number;
  igual: number;
  error: number;
  sinTocar: number;
  aplicado: boolean;
};

function contar(filas: FilaAnalizada[], sinTocar: number, aplicado: boolean): Analisis {
  return {
    filas,
    crear: filas.filter((f) => f.accion === "crear").length,
    actualizar: filas.filter((f) => f.accion === "actualizar").length,
    igual: filas.filter((f) => f.accion === "igual").length,
    error: filas.filter((f) => f.accion === "error").length,
    sinTocar,
    aplicado,
  };
}

function archivoDe(fd: FormData): File {
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File)) fallar("Elegí un archivo primero.");
  return archivo;
}

function exigirSinErrores(filas: FilaAnalizada[]) {
  const errores = filas.filter((f) => f.accion === "error");
  if (errores.length > 0) {
    fallar(
      `La planilla tiene ${errores.length} ${errores.length === 1 ? "fila con problemas" : "filas con problemas"}. ` +
        "No se importó nada: corregilas en el Excel y volvé a subirlo.",
    );
  }
}

const revalidar = () => revalidatePath("/", "layout");

/* -------------------------------------------------------------------------- */
/* Secaderos                                                                  */
/* -------------------------------------------------------------------------- */

export async function analizarSecaderos(
  fd: FormData,
): Promise<Resultado<Analisis>> {
  return ejecutar(() => procesarSecaderos(fd, false));
}

export async function importarSecaderos(
  fd: FormData,
): Promise<Resultado<Analisis>> {
  return ejecutar(() => procesarSecaderos(fd, true));
}

type PlanSecadero =
  | { tipo: "crear"; numero: number; tipoId: number; activo: boolean }
  | {
      tipo: "actualizar";
      id: number;
      cambios: { tipoId?: number; activo?: boolean };
    };

async function procesarSecaderos(
  fd: FormData,
  aplicar: boolean,
): Promise<Analisis> {
  await autorizar("admin");
  const archivo = archivoDe(fd);
  const crudas = await leerPlanilla(archivo, ["numero", "tipo"]);

  const [tiposDb, secaderosDb] = await Promise.all([
    db.select().from(tipos),
    db
      .select({
        id: secaderos.id,
        numero: secaderos.numero,
        tipoId: secaderos.tipoId,
        estado: secaderos.estado,
        activo: secaderos.activo,
      })
      .from(secaderos),
  ]);

  if (tiposDb.length === 0) {
    fallar(
      "Todavía no hay tipos de secadero cargados. Creá los tipos antes de importar.",
    );
  }

  const tipoPorNombre = new Map(tiposDb.map((t) => [clave(t.nombre), t]));
  const tipoPorId = new Map(tiposDb.map((t) => [t.id, t]));
  const nombresDeTipos = tiposDb.map((t) => t.nombre).join(", ");
  const porNumero = new Map(secaderosDb.map((s) => [s.numero, s]));

  const filas: FilaAnalizada[] = [];
  const plan: PlanSecadero[] = [];
  const vistos = new Set<number>();

  for (const { fila, datos } of crudas) {
    const numero = leerEntero(datos.numero ?? "");
    const etiqueta = numero === null ? `Fila ${fila}` : `Secadero ${numero}`;

    // `marca` acompaña a la fila hasta el final, incluso si termina en error:
    // saber que el secadero trabado es de placa chica es parte de entender el
    // problema.
    let marca: { tipoId?: number; tipoNombre?: string } = {};
    const error = (detalle: string) =>
      filas.push({ fila, etiqueta, ...marca, accion: "error", detalle });

    if (numero === null || numero <= 0) {
      error(
        `El número tiene que ser un entero mayor a cero (dice "${datos.numero ?? ""}").`,
      );
      continue;
    }
    if (vistos.has(numero)) {
      error("Este número aparece más de una vez en la planilla.");
      continue;
    }
    vistos.add(numero);

    const actual = porNumero.get(numero);
    if (actual) {
      marca = {
        tipoId: actual.tipoId,
        tipoNombre: tipoPorId.get(actual.tipoId)?.nombre,
      };
    }

    const textoTipo = (datos.tipo ?? "").trim();
    if (textoTipo === "") {
      error(`Falta el tipo. Los tipos cargados son: ${nombresDeTipos}.`);
      continue;
    }
    const tipo = tipoPorNombre.get(clave(textoTipo));
    if (!tipo) {
      error(
        `El tipo "${textoTipo}" no existe. Los tipos cargados son: ${nombresDeTipos}. ` +
          "Si es un tipo nuevo, creálo primero en la pestaña Tipos.",
      );
      continue;
    }

    const activo = leerSiNo(datos.activo ?? "");
    if (activo === null) {
      error(`En la columna Activo poné SÍ o NO (dice "${datos.activo}").`);
      continue;
    }

    if (!actual) {
      marca = { tipoId: tipo.id, tipoNombre: tipo.nombre };
      plan.push({ tipo: "crear", numero, tipoId: tipo.id, activo });
      filas.push({
        fila,
        etiqueta,
        ...marca,
        accion: "crear",
        detalle: `Alta nueva${activo ? "" : ", dada de baja"}.`,
      });
      continue;
    }

    const cambios: { tipoId?: number; activo?: boolean } = {};
    const detalles: string[] = [];

    if (actual.tipoId !== tipo.id) {
      // Cambiar el tipo cambia la capacidad, y con placas adentro eso volveria
      // invalida la carga que ya esta contada.
      if (actual.estado !== "vacio") {
        error(
          `Está ${ETIQUETA_ESTADO[actual.estado]}: para cambiarle el tipo tiene que estar vacío.`,
        );
        continue;
      }
      cambios.tipoId = tipo.id;
      detalles.push(
        `pasa de ${tipoPorId.get(actual.tipoId)?.nombre ?? "?"} a ${tipo.nombre}`,
      );
      // La etiqueta pasa a mostrar en qué queda, que es lo que hay que aprobar.
      marca = { tipoId: tipo.id, tipoNombre: tipo.nombre };
    }

    if (actual.activo !== activo) {
      if (!activo && actual.estado !== "vacio") {
        error(
          `Está ${ETIQUETA_ESTADO[actual.estado]}: para darlo de baja tiene que estar vacío.`,
        );
        continue;
      }
      cambios.activo = activo;
      detalles.push(activo ? "se reactiva" : "se da de baja");
    }

    if (detalles.length === 0) {
      filas.push({
        fila,
        etiqueta,
        ...marca,
        accion: "igual",
        detalle: "Sin cambios.",
      });
    } else {
      plan.push({ tipo: "actualizar", id: actual.id, cambios });
      filas.push({
        fila,
        etiqueta,
        ...marca,
        accion: "actualizar",
        detalle: detalles.join(", ") + ".",
      });
    }
  }

  const sinTocar = secaderosDb.filter((s) => !vistos.has(s.numero)).length;

  if (!aplicar) return contar(filas, sinTocar, false);

  exigirSinErrores(filas);

  await db.transaction(async (tx) => {
    const nuevos = plan.filter((p) => p.tipo === "crear");
    for (let i = 0; i < nuevos.length; i += 500) {
      await tx.insert(secaderos).values(
        nuevos.slice(i, i + 500).map((n) => ({
          numero: n.numero,
          tipoId: n.tipoId,
          activo: n.activo,
        })),
      );
    }
    for (const p of plan) {
      if (p.tipo !== "actualizar") continue;
      await tx.update(secaderos).set(p.cambios).where(eq(secaderos.id, p.id));
    }
  });

  revalidar();
  return contar(filas, sinTocar, true);
}

/* -------------------------------------------------------------------------- */
/* Productos                                                                  */
/* -------------------------------------------------------------------------- */

export async function analizarProductos(
  fd: FormData,
): Promise<Resultado<Analisis>> {
  return ejecutar(() => procesarProductos(fd, false));
}

export async function importarProductos(
  fd: FormData,
): Promise<Resultado<Analisis>> {
  return ejecutar(() => procesarProductos(fd, true));
}

type PlanProducto =
  | { tipo: "crear"; nombre: string; tipoId: number; activo: boolean }
  | {
      tipo: "actualizar";
      id: number;
      cambios: { nombre?: string; tipoId?: number; activo?: boolean };
    };

async function procesarProductos(
  fd: FormData,
  aplicar: boolean,
): Promise<Analisis> {
  await autorizar("admin");
  const archivo = archivoDe(fd);
  const crudas = await leerPlanilla(archivo, ["nombre", "tipo"]);

  const [tiposDb, productosDb] = await Promise.all([
    db.select().from(tipos),
    db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        tipoId: productos.tipoId,
        activo: productos.activo,
      })
      .from(productos),
  ]);

  if (tiposDb.length === 0) {
    fallar(
      "Todavía no hay tipos de secadero cargados. Creá los tipos antes de importar.",
    );
  }

  const tipoPorNombre = new Map(tiposDb.map((t) => [clave(t.nombre), t]));
  const tipoPorId = new Map(tiposDb.map((t) => [t.id, t]));
  const nombresDeTipos = tiposDb.map((t) => t.nombre).join(", ");

  // Los productos se identifican por nombre, que es lo unico que el admin ve
  // en su Excel. Se compara normalizado para que "Laja 12,5" y "laja 12.5" no
  // se dupliquen; si dos productos ya existentes colisionan al normalizar, se
  // avisa en vez de elegir uno al azar.
  const porNombre = new Map<string, (typeof productosDb)[number]>();
  const ambiguos = new Set<string>();
  for (const p of productosDb) {
    const k = clave(p.nombre);
    if (porNombre.has(k)) ambiguos.add(k);
    else porNombre.set(k, p);
  }

  const filas: FilaAnalizada[] = [];
  const plan: PlanProducto[] = [];
  const vistos = new Set<string>();

  // El producto es la unidad que ya esta cargada adentro de un secadero: si es
  // uno de esos, cambiarle el tipo dejaria la carga contra una capacidad que no
  // le corresponde.
  const enUso = new Set(
    (
      await db
        .selectDistinct({ productoId: secaderoContenido.productoId })
        .from(secaderoContenido)
    ).map((f) => f.productoId),
  );

  for (const { fila, datos } of crudas) {
    const nombre = (datos.nombre ?? "").trim();
    const etiqueta = nombre === "" ? `Fila ${fila}` : nombre;

    // En qué secadero entra el producto: sin eso, "Lisa - sin cambios" no dice
    // si es de placa grande o chica.
    let marca: { tipoId?: number; tipoNombre?: string } = {};
    const error = (detalle: string) =>
      filas.push({ fila, etiqueta, ...marca, accion: "error", detalle });

    if (nombre === "") {
      error("Falta el nombre del producto.");
      continue;
    }
    if (nombre.length > 80) {
      error("El nombre no puede tener más de 80 caracteres.");
      continue;
    }

    const k = clave(nombre);
    if (k === "") {
      error(`"${nombre}" no tiene letras ni números: no sirve como nombre.`);
      continue;
    }
    if (vistos.has(k)) {
      error("Este producto aparece más de una vez en la planilla.");
      continue;
    }
    vistos.add(k);

    if (ambiguos.has(k)) {
      error(
        "Hay más de un producto cargado con este nombre. Resolvelo en la pestaña Productos antes de importar.",
      );
      continue;
    }

    const actual = porNombre.get(k);
    if (actual) {
      marca = {
        tipoId: actual.tipoId,
        tipoNombre: tipoPorId.get(actual.tipoId)?.nombre,
      };
    }

    const textoTipo = (datos.tipo ?? "").trim();
    if (textoTipo === "") {
      error(`Falta el tipo. Los tipos cargados son: ${nombresDeTipos}.`);
      continue;
    }
    const tipo = tipoPorNombre.get(clave(textoTipo));
    if (!tipo) {
      error(
        `El tipo "${textoTipo}" no existe. Los tipos cargados son: ${nombresDeTipos}. ` +
          "Si es un tipo nuevo, creálo primero en la pestaña Tipos.",
      );
      continue;
    }

    const activo = leerSiNo(datos.activo ?? "");
    if (activo === null) {
      error(`En la columna Activo poné SÍ o NO (dice "${datos.activo}").`);
      continue;
    }

    if (!actual) {
      marca = { tipoId: tipo.id, tipoNombre: tipo.nombre };
      plan.push({ tipo: "crear", nombre, tipoId: tipo.id, activo });
      filas.push({
        fila,
        etiqueta,
        ...marca,
        accion: "crear",
        detalle: `Alta nueva${activo ? "" : ", suspendida"}.`,
      });
      continue;
    }

    const cambios: { nombre?: string; tipoId?: number; activo?: boolean } = {};
    const detalles: string[] = [];

    if (actual.nombre !== nombre) {
      cambios.nombre = nombre;
      detalles.push(`se escribe "${actual.nombre}" → "${nombre}"`);
    }

    if (actual.tipoId !== tipo.id) {
      if (enUso.has(actual.id)) {
        error(
          "Está cargado adentro de un secadero: para cambiarle el tipo hay que descargarlo primero.",
        );
        continue;
      }
      cambios.tipoId = tipo.id;
      detalles.push(
        `pasa de secadero ${tipoPorId.get(actual.tipoId)?.nombre ?? "?"} a ${tipo.nombre}`,
      );
      marca = { tipoId: tipo.id, tipoNombre: tipo.nombre };
    }

    if (actual.activo !== activo) {
      cambios.activo = activo;
      detalles.push(activo ? "se reactiva" : "se suspende");
    }

    if (detalles.length === 0) {
      filas.push({
        fila,
        etiqueta,
        ...marca,
        accion: "igual",
        detalle: "Sin cambios.",
      });
    } else {
      plan.push({ tipo: "actualizar", id: actual.id, cambios });
      filas.push({
        fila,
        etiqueta,
        ...marca,
        accion: "actualizar",
        detalle: detalles.join(", ") + ".",
      });
    }
  }

  const sinTocar = productosDb.filter((p) => !vistos.has(clave(p.nombre)))
    .length;

  if (!aplicar) return contar(filas, sinTocar, false);

  exigirSinErrores(filas);

  await db.transaction(async (tx) => {
    const nuevos = plan.filter((p) => p.tipo === "crear");
    for (let i = 0; i < nuevos.length; i += 500) {
      await tx.insert(productos).values(
        nuevos.slice(i, i + 500).map((n) => ({
          nombre: n.nombre,
          tipoId: n.tipoId,
          activo: n.activo,
        })),
      );
    }
    for (const p of plan) {
      if (p.tipo !== "actualizar") continue;
      await tx.update(productos).set(p.cambios).where(eq(productos.id, p.id));
    }
  });

  revalidar();
  return contar(filas, sinTocar, true);
}

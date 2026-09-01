import "server-only";
import ExcelJS from "exceljs";
import { fallar } from "./acciones/comun";

/**
 * Lectura y escritura de planillas Excel.
 *
 * La planilla no es un formato de intercambio tecnico: es el archivo que el
 * admin ya tiene armado. Por eso se lee con tolerancia -acentos, mayusculas,
 * columnas de mas, filas en blanco- y se rechaza con mensajes que dicen que
 * fila y que columna estan mal, no "formato invalido".
 */

const LIMITE_BYTES = 3 * 1024 * 1024;
const LIMITE_FILAS = 5000;

/** Encabezado normalizado: sin acentos, sin espacios, en minusculas. */
export function clave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type FilaPlanilla = { fila: number; datos: Record<string, string> };

/**
 * Nombres alternativos de columna -> nombre canonico.
 *
 * El admin no arma la planilla mirando esta documentacion: la tiene armada de
 * antes, con los encabezados que se le ocurrieron en su momento. Reconocer las
 * variantes obvias evita rebotar un archivo que en realidad esta bien.
 */
const ALIAS: Record<string, string> = {
  n: "numero",
  nro: "numero",
  nrosecadero: "numero",
  numerodesecadero: "numero",
  numerosecadero: "numero",
  secadero: "numero",

  clase: "tipo",
  clasificacion: "tipo",
  tamano: "tipo",
  tamanio: "tipo",
  tipodesecadero: "tipo",
  tiposecadero: "tipo",

  modelo: "nombre",
  nombredelproducto: "nombre",
  nombreproducto: "nombre",
  producto: "nombre",

  activa: "activo",
  alta: "activo",
  habilitado: "activo",
  vigente: "activo",
};

/* -------------------------------------------------------------------------- */
/* Lectura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Devuelve las filas de la primera hoja indexadas por encabezado normalizado.
 * `requeridas` son claves ya normalizadas (ej: "numero", "tipo").
 */
export async function leerPlanilla(
  archivo: File,
  requeridas: string[],
): Promise<FilaPlanilla[]> {
  if (!archivo || archivo.size === 0) fallar("Elegí un archivo primero.");
  if (archivo.size > LIMITE_BYTES) {
    fallar("El archivo pesa más de 3 MB. Dejá sólo la hoja con los datos.");
  }

  const nombre = archivo.name.toLowerCase();
  if (!/\.(xlsx|xlsm|csv)$/.test(nombre)) {
    fallar(
      "El archivo tiene que ser .xlsx o .csv. Si es un .xls viejo, abrilo en " +
        "Excel y guardalo como Libro de Excel (.xlsx).",
    );
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const crudas = nombre.endsWith(".csv")
    ? leerCsv(buffer.toString("utf8"))
    : await leerXlsx(buffer);

  const conContenido = crudas.filter((f) =>
    f.celdas.some((c) => c.trim() !== ""),
  );
  if (conContenido.length === 0) fallar("La planilla está vacía.");
  if (conContenido.length - 1 > LIMITE_FILAS) {
    fallar(`La planilla tiene más de ${LIMITE_FILAS} filas de datos.`);
  }

  const [encabezado, ...cuerpo] = conContenido;
  const literales = encabezado.celdas.map((c) => clave(c));

  // El alias sólo se aplica si la columna canónica no vino con su nombre
  // propio, así una planilla que trae "Tipo" y "Tipo de secadero" a la vez no
  // se pisa a sí misma.
  const columnas = literales.map((col) => {
    const canonico = ALIAS[col];
    return canonico && !literales.includes(canonico) ? canonico : col;
  });

  const faltantes = requeridas.filter((r) => !columnas.includes(r));
  if (faltantes.length > 0) {
    fallar(
      `A la planilla le faltan columnas: ${faltantes.join(", ")}. ` +
        `Encontré: ${encabezado.celdas.filter((c) => c.trim()).join(", ") || "ninguna"}. ` +
        "Bajá la planilla con el botón de exportar y usá esos encabezados.",
    );
  }

  return cuerpo.map((f) => {
    const datos: Record<string, string> = {};
    columnas.forEach((col, i) => {
      if (col) datos[col] = (f.celdas[i] ?? "").trim();
    });
    return { fila: f.n, datos };
  });
}

type FilaCruda = { n: number; celdas: string[] };

async function leerXlsx(buffer: Buffer): Promise<FilaCruda[]> {
  const libro = new ExcelJS.Workbook();
  try {
    // exceljs declara su propio `Buffer extends ArrayBuffer` que se fusiona con
    // el global de Node; el cast salta esa incompatibilidad de tipos nomas.
    await libro.xlsx.load(
      buffer as unknown as Parameters<typeof libro.xlsx.load>[0],
    );
  } catch {
    fallar(
      "No pude abrir el archivo como planilla de Excel. " +
        "Verificá que sea un .xlsx y que no esté protegido con contraseña.",
    );
  }

  const hoja = libro.worksheets[0];
  if (!hoja) fallar("El archivo no tiene ninguna hoja.");

  const filas: FilaCruda[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => {
    // Se recorre por indice y no con eachCell porque eachCell saltea las celdas
    // vacias intermedias, y eso correria las columnas de lugar.
    const celdas: string[] = [];
    for (let i = 1; i <= fila.cellCount; i++) {
      celdas[i - 1] = textoDeCelda(fila.getCell(i).value);
    }
    filas.push({ n: fila.number, celdas });
  });
  return filas;
}

/** ExcelJS devuelve objetos para formulas, texto enriquecido e hipervinculos. */
function textoDeCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (valor instanceof Date) return valor.toISOString();

  const v = valor as Record<string, unknown>;
  if (Array.isArray(v.richText)) {
    return (v.richText as Array<{ text: string }>)
      .map((r) => r.text)
      .join("")
      .trim();
  }
  if ("result" in v) return textoDeCelda(v.result);
  if ("text" in v) return textoDeCelda(v.text);
  return String(valor).trim();
}

/**
 * CSV minimo pero suficiente: comillas dobles, saltos de linea adentro de una
 * celda y separador autodetectado, porque Excel en español guarda con ";".
 */
function leerCsv(texto: string): FilaCruda[] {
  const limpio = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (primeraLinea.match(/;/g)?.length ?? 0) >
    (primeraLinea.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const filas: string[][] = [];
  let celdas: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          actual += '"';
          i++;
        } else entreComillas = false;
      } else actual += c;
      continue;
    }
    if (c === '"') entreComillas = true;
    else if (c === sep) {
      celdas.push(actual);
      actual = "";
    } else if (c === "\n") {
      celdas.push(actual);
      filas.push(celdas);
      celdas = [];
      actual = "";
    } else if (c !== "\r") actual += c;
  }
  if (actual !== "" || celdas.length > 0) {
    celdas.push(actual);
    filas.push(celdas);
  }

  return filas.map((celdasFila, i) => ({ n: i + 1, celdas: celdasFila }));
}

/* -------------------------------------------------------------------------- */
/* Interpretacion de celdas                                                   */
/* -------------------------------------------------------------------------- */

const SI = new Set(["si", "sí", "s", "1", "true", "verdadero", "x", "activo"]);
const NO = new Set(["no", "n", "0", "false", "falso", "baja", "inactivo"]);

/** Sin dato se asume que sí: una planilla escrita a mano trae altas. */
export function leerSiNo(texto: string, siVacio = true): boolean | null {
  const t = texto.trim().toLowerCase();
  if (t === "") return siVacio;
  if (SI.has(t)) return true;
  if (NO.has(t)) return false;
  return null;
}

export function leerEntero(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, "");
  if (t === "") return null;
  if (!/^-?\d+([.,]0+)?$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return Number.isSafeInteger(n) ? n : null;
}

/* -------------------------------------------------------------------------- */
/* Escritura                                                                  */
/* -------------------------------------------------------------------------- */

export type Celda = string | number | boolean | null;
export type ColumnaSalida = { encabezado: string; ancho: number };

/** Arma un .xlsx de una hoja, con encabezado fijo y filtros ya puestos. */
export async function escribirPlanilla(
  hoja: string,
  columnas: ColumnaSalida[],
  filas: Celda[][],
): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Control de Secaderos";
  libro.created = new Date();

  const ws = libro.addWorksheet(hoja, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = columnas.map((c) => ({ header: c.encabezado, width: c.ancho }));

  const cabecera = ws.getRow(1);
  cabecera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecera.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  cabecera.alignment = { vertical: "middle" };
  cabecera.height = 22;

  for (const fila of filas) ws.addRow(fila);

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(2, filas.length + 1), column: columnas.length },
  };

  return (await libro.xlsx.writeBuffer()) as unknown as ArrayBuffer;
}

/** Nombre de archivo con fecha, para que no se pisen las descargas. */
export function nombreDeArchivo(base: string): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return `${base}-${hoy}.xlsx`;
}

export const TIPO_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

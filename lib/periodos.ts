import { esFecha, fechaLocal, rangoDeFecha, sumarDias } from "./rangos";

/*
 * Periodos de calendario para las estadisticas: un dia, una semana, un mes o
 * un año elegidos, no "los ultimos N dias".
 *
 * La pregunta que se hace en planta es "cuanto se cargo el martes" o "cuanto se
 * paletizo en septiembre", y una ventana movil no la contesta: los ultimos 30
 * dias de hoy y los de mañana son periodos distintos, y no se pueden comparar
 * ni anotar en una planilla.
 *
 * Todo se maneja como fechas YYYY-MM-DD en hora argentina, igual que el plan,
 * y recien al final se convierte en el tramo de tiempo real con `rangoDeFecha`.
 * Este modulo no depende del servidor: lo usa tambien el selector del cliente.
 */

export type TipoPeriodo = "dia" | "semana" | "mes" | "anio";

export const TIPOS_PERIODO: { tipo: TipoPeriodo; etiqueta: string }[] = [
  { tipo: "dia", etiqueta: "Día" },
  { tipo: "semana", etiqueta: "Semana" },
  { tipo: "mes", etiqueta: "Mes" },
  { tipo: "anio", etiqueta: "Año" },
];

export type Periodo = {
  tipo: TipoPeriodo;
  /** Primer dia del periodo, YYYY-MM-DD. */
  inicio: string;
  /** Ultimo dia del periodo, YYYY-MM-DD, incluido. */
  fin: string;
  /** Una fecha cualquiera del periodo anterior y del siguiente, para las flechas. */
  anterior: string;
  siguiente: string;
  etiqueta: string;
  /** Si el periodo incluye el dia de hoy: todavia no termino. */
  enCurso: boolean;
  /** Si arranca despues de hoy: no puede tener movimientos. */
  futuro: boolean;
  rango: { desde: Date; hasta: Date };
};

const esTipo = (v: string | undefined): v is TipoPeriodo =>
  TIPOS_PERIODO.some((t) => t.tipo === v);

/** Dia de la semana de una fecha, con el lunes como 0. */
function diaDeSemana(fecha: string): number {
  // Al mediodia argentino el dia UTC es el mismo, asi que getUTCDay sirve.
  const domingoCero = new Date(`${fecha}T12:00:00-03:00`).getUTCDay();
  return (domingoCero + 6) % 7;
}

/** Primer dia del mes siguiente al de `fecha`. */
function mesSiguiente(fecha: string): string {
  const [a, m] = fecha.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** "14/09" o "14/09/2026", para las etiquetas de los periodos. */
function corta(fecha: string, conAnio = false): string {
  const [a, m, d] = fecha.split("-");
  return conAnio ? `${d}/${m}/${a}` : `${d}/${m}`;
}

/** El nombre del mes de una fecha YYYY-MM-DD o YYYY-MM: "septiembre 2026". */
export function nombreMes(fecha: string): string {
  const [a, m] = fecha.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/**
 * Arma el periodo a partir de los parametros de la URL.
 *
 * Cualquier valor raro cae en un default razonable en vez de dar error: la
 * pagina se abre desde un link que alguien pudo haber copiado a medias.
 */
export function leerPeriodo(
  tipo: string | undefined,
  fecha: string | undefined,
  hoy: string = fechaLocal(),
): Periodo {
  const t: TipoPeriodo = esTipo(tipo) ? tipo : "mes";
  // El mes se puede pedir como YYYY-MM (es lo que da un <input type="month">)
  // y el año como YYYY: se completan al primer dia.
  let f = fecha;
  if (f && /^\d{4}-\d{2}$/.test(f)) f = `${f}-01`;
  if (f && /^\d{4}$/.test(f)) f = `${f}-01-01`;
  const base = esFecha(f) ? f : hoy;

  let inicio: string;
  let fin: string;
  let anterior: string;
  let siguiente: string;
  let etiqueta: string;

  switch (t) {
    case "dia": {
      inicio = fin = base;
      anterior = sumarDias(base, -1);
      siguiente = sumarDias(base, 1);
      etiqueta = `${DIAS[diaDeSemana(base)]} ${corta(base, true)}`;
      break;
    }
    case "semana": {
      inicio = sumarDias(base, -diaDeSemana(base));
      fin = sumarDias(inicio, 6);
      anterior = sumarDias(inicio, -7);
      siguiente = sumarDias(inicio, 7);
      etiqueta = `Semana del ${corta(inicio)} al ${corta(fin, true)}`;
      break;
    }
    case "mes": {
      inicio = `${base.slice(0, 7)}-01`;
      const proximo = mesSiguiente(inicio);
      fin = sumarDias(proximo, -1);
      anterior = `${sumarDias(inicio, -1).slice(0, 7)}-01`;
      siguiente = proximo;
      etiqueta = nombreMes(inicio);
      etiqueta = etiqueta[0].toUpperCase() + etiqueta.slice(1);
      break;
    }
    case "anio": {
      const anio = Number(base.slice(0, 4));
      inicio = `${anio}-01-01`;
      fin = `${anio}-12-31`;
      anterior = `${anio - 1}-01-01`;
      siguiente = `${anio + 1}-01-01`;
      etiqueta = `Año ${anio}`;
      break;
    }
  }

  return {
    tipo: t,
    inicio,
    fin,
    anterior,
    siguiente,
    etiqueta,
    enCurso: inicio <= hoy && hoy <= fin,
    futuro: inicio > hoy,
    rango: { desde: rangoDeFecha(inicio).desde, hasta: rangoDeFecha(fin).hasta },
  };
}

/**
 * Como conviene abrir el periodo en el tiempo: por dia hasta un mes, y por mes
 * en un año. Un año dia por dia son 365 filas que nadie lee.
 */
export function granularidad(tipo: TipoPeriodo): "dia" | "mes" | null {
  if (tipo === "dia") return null;
  return tipo === "anio" ? "mes" : "dia";
}

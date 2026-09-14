import { ZONA } from "./formato";

/** La misma zona, para pasarsela a Postgres en un `at time zone`. */
export const ZONA_SQL = ZONA;

/*
 * El dia se calcula en hora de Argentina, no en la del servidor: si no, una
 * carga de las 22 h figuraria como del dia siguiente cuando el server corre en
 * UTC. Argentina no tiene horario de verano, asi que el offset fijo -03:00 es
 * correcto todo el año.
 */

const soloFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Fin del dia argentino de hoy. Es el corte superior de todos los rangos
 * "hasta ahora", y NO se usa `new Date()` a proposito.
 *
 * El `creado_en` de cada fila lo pone Postgres con su propio reloj, que no es
 * el mismo que el del servidor de la app: medido contra Supabase, la base va
 * mas de un segundo adelantada. Cortando en "ahora" segun el reloj del app, la
 * fila que se acaba de insertar queda en el futuro y desaparece del listado
 * hasta que pase ese segundo. Era justo lo que hacia que una rotura recien
 * cargada no apareciera en la lista.
 *
 * Cortar al final del dia elimina el problema sin cambiar nada mas: no hay
 * movimientos legitimos mas alla de la medianoche de hoy.
 */
export function finDeHoy(): Date {
  return new Date(`${soloFecha.format(new Date())}T23:59:59.999-03:00`);
}

/* -------------------------------------------------------------------------- */
/* Fechas de plan y dia elegido                                               */
/* -------------------------------------------------------------------------- */

/** Si el valor es una fecha YYYY-MM-DD real (descarta un 2026-02-31). */
export function esFecha(valor: string | undefined): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const d = new Date(`${valor}T12:00:00-03:00`);
  return !Number.isNaN(d.getTime()) && soloFecha.format(d) === valor;
}

/** La fecha YYYY-MM-DD corrida `dias` dias, para adelante o para atras. */
export function sumarDias(fecha: string, dias: number): string {
  const base = new Date(`${fecha}T12:00:00-03:00`);
  return soloFecha.format(new Date(base.getTime() + dias * 24 * 60 * 60 * 1000));
}

/**
 * Los dias que se ofrecen de un toque en las pantallas de operario, en orden
 * cronologico. Para cualquier otro esta el calendario.
 */
export const DIAS_RAPIDOS = [
  { dias: -2, etiqueta: "Anteayer" },
  { dias: -1, etiqueta: "Ayer" },
  { dias: 0, etiqueta: "Hoy" },
  { dias: 1, etiqueta: "Mañana" },
  { dias: 2, etiqueta: "Pasado" },
] as const;

/** "Hoy", "Mañana"... o "lun 14/09" si queda fuera de los dias rapidos. */
export function etiquetaRelativa(fecha: string, hoy: string): string {
  const rapido = DIAS_RAPIDOS.find((d) => sumarDias(hoy, d.dias) === fecha);
  if (!rapido) return etiquetaDia(fecha);
  return rapido.dias === 2 ? "Pasado mañana" : rapido.etiqueta;
}

/** Fecha local argentina en formato YYYY-MM-DD, que es como se guarda el plan. */
export function fechaLocal(d: Date = new Date()): string {
  return soloFecha.format(d);
}

/** Convierte una fecha YYYY-MM-DD en el tramo de tiempo real de ese dia. */
export function rangoDeFecha(fecha: string): { desde: Date; hasta: Date } {
  return {
    desde: new Date(`${fecha}T00:00:00-03:00`),
    hasta: new Date(`${fecha}T23:59:59.999-03:00`),
  };
}

/** Los siete dias que arrancan en `desde` (YYYY-MM-DD), para la vista semanal. */
export function semanaDesde(desde: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));
}

const nombresDia = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** "lun 01/09", para encabezar cada dia de la semana. */
export function etiquetaDia(fecha: string): string {
  return nombresDia.format(new Date(`${fecha}T12:00:00-03:00`));
}

import { ZONA } from "./formato";

/** La misma zona, para pasarsela a Postgres en un `at time zone`. */
export const ZONA_SQL = ZONA;

/**
 * Rangos rapidos para las pantallas de operario.
 *
 * El dia se calcula en hora de Argentina, no en la del servidor: si no, una
 * carga de las 22 h figuraria como del dia siguiente cuando el server corre en
 * UTC. Argentina no tiene horario de verano, asi que el offset fijo -03:00 es
 * correcto todo el año.
 */

export const CLAVES_RANGO = ["hoy", "ayer", "semana"] as const;
export type ClaveRango = (typeof CLAVES_RANGO)[number];

export const ETIQUETA_RANGO: Record<ClaveRango, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana: "7 días",
};

const soloFecha = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Medianoche argentina del dia indicado, desplazado `diasAtras` dias. */
function inicioDelDia(diasAtras = 0): Date {
  const base = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
  return new Date(`${soloFecha.format(base)}T00:00:00-03:00`);
}

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

export function esClaveRango(valor: string | undefined): valor is ClaveRango {
  return !!valor && (CLAVES_RANGO as readonly string[]).includes(valor);
}

export function rangoPorClave(clave: ClaveRango): { desde: Date; hasta: Date } {
  switch (clave) {
    case "ayer":
      // Hasta un milisegundo antes de la medianoche de hoy, no hasta la
      // medianoche misma: si no, un movimiento de las 00:00:00.000 de hoy
      // caeria en los dos rangos.
      return {
        desde: inicioDelDia(1),
        hasta: new Date(inicioDelDia(0).getTime() - 1),
      };
    case "semana":
      // Los ultimos 7 dias incluyendo hoy.
      return { desde: inicioDelDia(6), hasta: finDeHoy() };
    default:
      return { desde: inicioDelDia(0), hasta: finDeHoy() };
  }
}

/* -------------------------------------------------------------------------- */
/* Fechas de plan                                                             */
/* -------------------------------------------------------------------------- */

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
  const base = new Date(`${desde}T12:00:00-03:00`);
  return Array.from({ length: 7 }, (_, i) =>
    soloFecha.format(new Date(base.getTime() + i * 24 * 60 * 60 * 1000)),
  );
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

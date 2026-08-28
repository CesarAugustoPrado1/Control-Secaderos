import { ZONA } from "./formato";

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

export function esClaveRango(valor: string | undefined): valor is ClaveRango {
  return !!valor && (CLAVES_RANGO as readonly string[]).includes(valor);
}

export function rangoPorClave(clave: ClaveRango): { desde: Date; hasta: Date } {
  switch (clave) {
    case "ayer":
      return { desde: inicioDelDia(1), hasta: inicioDelDia(0) };
    case "semana":
      // Los ultimos 7 dias incluyendo hoy.
      return { desde: inicioDelDia(6), hasta: new Date() };
    default:
      return { desde: inicioDelDia(0), hasta: new Date() };
  }
}

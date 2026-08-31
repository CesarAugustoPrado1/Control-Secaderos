import type { Estado, TipoMovimiento } from "./db/schema";

/** Modulo sin dependencias de servidor: lo usan tanto las paginas como el cliente. */

export const ORDEN_ESTADOS: Estado[] = ["vacio", "humedo", "horno", "seco"];

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  vacio: "vacío",
  humedo: "húmedo",
  horno: "en horno",
  seco: "seco",
};

/** Version en titulo, para encabezados y contadores. */
export const TITULO_ESTADO: Record<Estado, string> = {
  vacio: "Vacíos",
  humedo: "Húmedos",
  horno: "En horno",
  seco: "Secos",
};

export const COLOR_ESTADO: Record<
  Estado,
  { chip: string; borde: string; punto: string; fondo: string }
> = {
  vacio: {
    chip: "bg-slate-200 text-slate-700",
    borde: "ring-slate-200",
    punto: "bg-slate-400",
    fondo: "bg-slate-50",
  },
  humedo: {
    chip: "bg-blue-100 text-blue-800",
    borde: "ring-blue-200",
    punto: "bg-blue-500",
    fondo: "bg-blue-50",
  },
  horno: {
    chip: "bg-orange-100 text-orange-800",
    borde: "ring-orange-200",
    punto: "bg-orange-500",
    fondo: "bg-orange-50",
  },
  seco: {
    chip: "bg-emerald-100 text-emerald-800",
    borde: "ring-emerald-200",
    punto: "bg-emerald-500",
    fondo: "bg-emerald-50",
  },
};

/**
 * Color de cada tipo de secadero.
 *
 * Va por id y no por hash del nombre: con hash, dos tipos podian caer en el
 * mismo color -o en dos tonos parecidos, como pasaba con Grande y Chico, los
 * dos verdosos-. Yendo por id, los tipos que se cargan primero toman colores
 * consecutivos de la paleta y quedan siempre distintos entre si.
 *
 * El orden de la paleta esta elegido para que los primeros sean matices bien
 * separados (azul, naranja, verde, rosa), que son los que se van a usar.
 */
const PALETA_TIPOS = [
  "bg-indigo-100 text-indigo-800",
  "bg-amber-100 text-amber-900",
  "bg-teal-100 text-teal-800",
  "bg-rose-100 text-rose-800",
  "bg-cyan-100 text-cyan-800",
  "bg-fuchsia-100 text-fuchsia-800",
  "bg-lime-100 text-lime-800",
  "bg-slate-200 text-slate-700",
];

export function colorTipo(tipoId: number): string {
  const i = Math.max(0, tipoId - 1) % PALETA_TIPOS.length;
  return PALETA_TIPOS[i];
}

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  carga: "Carga",
  ajuste: "Ajuste",
  entrada_horno: "Entrada a horno",
  salida_horno: "Salida de horno",
  devolucion_horno: "Devuelto al horno",
  descarga: "Descarga a producto terminado",
  correccion: "Corrección",
};

export const ETIQUETA_MOVIMIENTO_CORTA: Record<TipoMovimiento, string> = {
  carga: "Carga",
  ajuste: "Ajuste",
  entrada_horno: "A horno",
  salida_horno: "De horno",
  devolucion_horno: "Devuelto",
  descarga: "Descarga",
  correccion: "Corrección",
};

export const COLOR_MOVIMIENTO: Record<TipoMovimiento, string> = {
  carga: "bg-blue-100 text-blue-800",
  ajuste: "bg-slate-200 text-slate-700",
  entrada_horno: "bg-orange-100 text-orange-800",
  salida_horno: "bg-emerald-100 text-emerald-800",
  devolucion_horno: "bg-red-100 text-red-800",
  descarga: "bg-violet-100 text-violet-800",
  correccion: "bg-amber-100 text-amber-900",
};

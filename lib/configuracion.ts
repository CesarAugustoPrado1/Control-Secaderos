import type { Tamano } from "./db/schema";

/**
 * Parametros editables por el admin. Modulo puro (sin acceso a base) para que
 * lo pueda importar tambien el formulario del cliente.
 * La lectura desde la base vive en `leerConfig`, en consultas.ts.
 */

export const CONFIG_POR_DEFECTO = {
  capacidad_grande: 102,
  capacidad_chico: 204,
  capacidad_horno: 15,
} as const;

export type ClaveConfig = keyof typeof CONFIG_POR_DEFECTO;

export const ETIQUETA_CONFIG: Record<ClaveConfig, string> = {
  capacidad_grande: "Capacidad de secadero grande (placas)",
  capacidad_chico: "Capacidad de secadero chico (placas)",
  capacidad_horno: "Capacidad del horno (secaderos)",
};

export type Configuracion = Record<ClaveConfig, number>;

export function capacidadDe(cfg: Configuracion, tamano: Tamano): number {
  return tamano === "grande" ? cfg.capacidad_grande : cfg.capacidad_chico;
}

/**
 * Parametros globales editables por el admin. Modulo puro (sin acceso a base)
 * para que lo pueda importar tambien el formulario del cliente.
 *
 * Las capacidades de los secaderos NO viven aca: son propias de cada tipo y
 * estan en la tabla `tipos`, porque los tipos se agregan y cambian en caliente.
 */

export const CONFIG_POR_DEFECTO = {
  capacidad_horno: 15,
  /**
   * Cuanto deberia durar un ciclo de horno. No lo hace cumplir el sistema: se
   * usa solo para comparar contra los ciclos reales y detectar los que se
   * quedaron cortos, que son los que despues vuelven sin secar.
   */
  minutos_horno_objetivo: 300,
} as const;

export type ClaveConfig = keyof typeof CONFIG_POR_DEFECTO;

export const ETIQUETA_CONFIG: Record<ClaveConfig, string> = {
  capacidad_horno: "Capacidad del horno (secaderos)",
  minutos_horno_objetivo: "Tiempo objetivo de horno (minutos)",
};

export type Configuracion = Record<ClaveConfig, number>;

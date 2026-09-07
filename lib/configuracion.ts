/**
 * Parametros globales editables por el admin. Modulo puro (sin acceso a base)
 * para que lo pueda importar tambien el formulario del cliente.
 *
 * Las capacidades de los secaderos NO viven aca: son propias de cada tipo y
 * estan en la tabla `tipos`, porque los tipos se agregan y cambian en caliente.
 */

export const CONFIG_POR_DEFECTO = {
  /**
   * Lugares del horno que se reparten los tipos SIN cupo propio: grandes,
   * chicos y especiales. Los que tienen estructura aparte -las guardas- llevan
   * su cupo en `tipos.cupoHorno` y no descuentan de este numero.
   */
  capacidad_horno: 15,
  /**
   * Cuanto deberia durar un ciclo de horno. No lo hace cumplir el sistema: se
   * usa solo para comparar contra los ciclos reales y detectar los que se
   * quedaron cortos, que son los que despues vuelven sin secar.
   */
  minutos_horno_objetivo: 300,
  /**
   * Cuanto pesa un bolson de yeso y cuanto un balde de desperdicio. No validan
   * nada: solo convierten unidades a kilos para poder sumarlas.
   *
   * Cambiarlos afecta a lo que se registre de aca en adelante y no al
   * historial, porque cada registro se queda con el peso que regia ese dia.
   */
  kg_por_bolson: 800,
  kg_por_balde_yeso: 20,
} as const;

export type ClaveConfig = keyof typeof CONFIG_POR_DEFECTO;

export const ETIQUETA_CONFIG: Record<ClaveConfig, string> = {
  capacidad_horno: "Lugares del horno para los tipos sin cupo propio",
  minutos_horno_objetivo: "Tiempo objetivo de horno (minutos)",
  kg_por_bolson: "Peso de un bolsón de yeso (kg)",
  kg_por_balde_yeso: "Peso de un balde de desperdicio (kg)",
};

export type Configuracion = Record<ClaveConfig, number>;

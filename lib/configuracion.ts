/**
 * Parametros globales editables por el admin. Modulo puro (sin acceso a base)
 * para que lo pueda importar tambien el formulario del cliente.
 *
 * Las capacidades de los secaderos NO viven aca: son propias de cada tipo y
 * estan en la tabla `tipos`, porque los tipos se agregan y cambian en caliente.
 */

export const CONFIG_POR_DEFECTO = {
  capacidad_horno: 15,
} as const;

export type ClaveConfig = keyof typeof CONFIG_POR_DEFECTO;

export const ETIQUETA_CONFIG: Record<ClaveConfig, string> = {
  capacidad_horno: "Capacidad del horno (secaderos)",
};

export type Configuracion = Record<ClaveConfig, number>;

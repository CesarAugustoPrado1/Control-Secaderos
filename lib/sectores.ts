/**
 * Sectores del resumen de produccion. Modulo puro, sin acceso a base: lo
 * importan tanto la consulta del servidor como el panel del cliente.
 *
 * El horno esta aunque el administrativo no lo mire a diario: sin el, un dia en
 * que el carrusel cargo mucho y paletizado entrego poco no tendria explicacion
 * a la vista.
 */

export const SECTORES = ["carrusel", "horno", "paletizado"] as const;
export type SectorResumen = (typeof SECTORES)[number];

export const ETIQUETA_SECTOR_RESUMEN: Record<SectorResumen, string> = {
  carrusel: "Carrusel",
  horno: "Horno",
  paletizado: "Paletizado",
};

/**
 * Que cuenta exactamente cada sector, para que el numero no quede a
 * interpretacion. Cambia con la unidad: contar secaderos no es contar placas, y
 * dejar el texto de placas mientras se muestran secaderos confunde mas de lo
 * que aclara.
 */
export const DETALLE_SECTOR: Record<SectorResumen, string> = {
  carrusel: "Placas cargadas en secaderos, más lo roto en la línea",
  horno: "Placas entregadas secas, más lo roto al meter y sacar",
  paletizado: "Placas a producto terminado, más lo roto al descargar",
};

export const DETALLE_SECTOR_SECADEROS: Record<SectorResumen, string> = {
  carrusel: "Secaderos cargados. Lo roto en la línea no entró a ninguno",
  horno: "Secaderos que salieron secos del horno",
  paletizado: "Secaderos descargados a producto terminado",
};

/**
 * Como se relaciona la rotura con los secaderos contados.
 *
 * En el carrusel la placa se rompe ANTES de llenar el secadero: no esta adentro
 * de ninguno de los que se cuentan, asi que se suma aparte. "2 secaderos de
 * Laja + 15 placas rotas" son dos secaderos llenos y quince placas que ademas
 * paso la maquina.
 *
 * En horno y paletizado la placa rota SALIO de esos mismos secaderos, asi que
 * se resta. "1 secadero de San Juan 60 - 3 placas rotas" es un secadero del que
 * llegaron enteras todas menos tres.
 *
 * Poner el mismo signo en los tres seria comodo y estaria mal: en un caso la
 * rotura se agrega a lo contado y en el otro sale de adentro.
 */
export const SIGNO_ROTURA: Record<SectorResumen, "+" | "−"> = {
  carrusel: "+",
  horno: "−",
  paletizado: "−",
};

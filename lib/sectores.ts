/**
 * Sectores del resumen de produccion. Modulo puro, sin acceso a base: lo
 * importan tanto la consulta del servidor como el panel del cliente.
 *
 * El horno esta aunque el administrativo no lo mire a diario: sin el, un dia en
 * que el carrusel cargo mucho y paletizado entrego poco no tendria explicacion
 * a la vista.
 *
 * Los dos sectores "manual" son el circuito de las guardas, que no pasa por el
 * carrusel ni por paletizado: el operario de guardas llena el secadero a mano y
 * despues lo descarga el mismo. Van como dos sectores y no como uno solo
 * porque son dos operaciones sobre la MISMA placa: juntarlas en una sola
 * tarjeta contaria cada placa dos veces y el total del sector no querria decir
 * nada. Separadas, se leen igual que carrusel y paletizado, que son sus
 * equivalentes en el circuito principal.
 *
 * El horno no se parte: el hornero mete y saca las guardas igual que todo lo
 * demas, asi que su numero es uno solo.
 *
 * Los sectores manuales se omiten del resumen los dias en que no hubo nada:
 * ver `resumenDelDia`. En una planta donde las guardas se hacen de vez en
 * cuando, dos tarjetas vacias todos los dias son ruido.
 */

export const SECTORES = [
  "carrusel",
  "llenado_manual",
  "horno",
  "paletizado",
  "descarga_manual",
] as const;
export type SectorResumen = (typeof SECTORES)[number];

/** Los que solo aparecen si ese dia hubo movimiento de llenado manual. */
export const SECTORES_MANUALES: SectorResumen[] = [
  "llenado_manual",
  "descarga_manual",
];

export const ETIQUETA_SECTOR_RESUMEN: Record<SectorResumen, string> = {
  carrusel: "Carrusel",
  llenado_manual: "Llenado manual",
  horno: "Horno",
  paletizado: "Paletizado",
  descarga_manual: "Descarga manual",
};

/**
 * Que cuenta exactamente cada sector, para que el numero no quede a
 * interpretacion. Cambia con la unidad: contar secaderos no es contar placas, y
 * dejar el texto de placas mientras se muestran secaderos confunde mas de lo
 * que aclara.
 */
export const DETALLE_SECTOR: Record<SectorResumen, string> = {
  carrusel: "Placas cargadas en secaderos, más lo roto en la línea",
  llenado_manual: "Placas cargadas a mano, fuera del carrusel",
  horno: "Placas entregadas secas, más lo roto al meter y sacar",
  paletizado: "Placas a producto terminado, más lo roto al descargar",
  descarga_manual:
    "Placas a producto terminado descargadas a mano, más lo roto al descargar",
};

export const DETALLE_SECTOR_SECADEROS: Record<SectorResumen, string> = {
  carrusel: "Secaderos cargados. Lo roto en la línea no entró a ninguno",
  llenado_manual: "Secaderos llenados a mano",
  horno: "Secaderos que salieron secos del horno",
  paletizado: "Secaderos descargados a producto terminado",
  descarga_manual: "Secaderos descargados a mano a producto terminado",
};

/**
 * Como se relaciona la rotura con los secaderos contados.
 *
 * En el carrusel la placa se rompe ANTES de llenar el secadero: no esta adentro
 * de ninguno de los que se cuentan, asi que se suma aparte. "2 secaderos de
 * Laja + 15 placas rotas" son dos secaderos llenos y quince placas que ademas
 * paso la maquina.
 *
 * En horno y en las dos descargas la placa rota SALIO de esos mismos secaderos,
 * asi que se resta. "1 secadero de San Juan 60 - 3 placas rotas" es un secadero
 * del que llegaron enteras todas menos tres.
 *
 * El llenado manual no tiene roturas propias: no hay linea que las produzca
 * antes de entrar al secadero, y lo que se rompe despues se registra al
 * descargar. Lleva "+" por coherencia con el otro sector de llenado, pero en la
 * practica el signo no llega a mostrarse nunca.
 *
 * Poner el mismo signo en todos seria comodo y estaria mal: en un caso la
 * rotura se agrega a lo contado y en el otro sale de adentro.
 */
export const SIGNO_ROTURA: Record<SectorResumen, "+" | "−"> = {
  carrusel: "+",
  llenado_manual: "+",
  horno: "−",
  paletizado: "−",
  descarga_manual: "−",
};

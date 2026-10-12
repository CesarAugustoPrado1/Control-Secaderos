/**
 * Los fondos que el admin puede elegir para toda la app, en Administracion ->
 * Apariencia. Modulo puro: lo usan el layout, la pagina del admin y la accion
 * que lo guarda.
 *
 * El fondo es lo que se ve ENTRE las tarjetas: las tarjetas siguen blancas y
 * los colores de estado no cambian, asi que ninguna opcion afecta la lectura.
 * Cada fondo es una clase de globals.css con el mismo nombre (`fondo-yeso`...).
 */
export const FONDOS = [
  {
    clave: "clasico",
    nombre: "Clásico",
    detalle: "El gris claro de siempre.",
  },
  {
    clave: "yeso",
    nombre: "Yeso",
    detalle: "Crema con una grilla de puntitos suaves, como papel de plano.",
  },
  {
    clave: "listones",
    nombre: "Listones",
    detalle: "Gris azulado con rayas diagonales finas, como placas apiladas.",
  },
  {
    clave: "degrade",
    nombre: "Degradé",
    detalle: "Celeste arriba que se aclara hacia abajo, sin textura.",
  },
] as const;

export type Fondo = (typeof FONDOS)[number]["clave"];

export const FONDO_POR_DEFECTO: Fondo = "clasico";

/** Clave con la que se guarda en la tabla `config`. */
export const CLAVE_FONDO = "fondo";

export const esFondo = (v: unknown): v is Fondo =>
  FONDOS.some((f) => f.clave === v);

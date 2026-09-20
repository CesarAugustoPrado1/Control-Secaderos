import type { Estado } from "./db/schema";

/**
 * Lo que el buscador de secaderos necesita, y como se arma desde una fila de
 * la base.
 *
 * Vive en `lib` y no al lado del componente por una razon concreta: el
 * componente es `"use client"`, y una funcion exportada desde un modulo de
 * cliente no es una funcion cuando la mira el servidor, es una referencia que
 * React usa para hidratar. Llamarla desde una pagina -que es un componente de
 * servidor- tira "Attempted to call aBuscable() from the server" en runtime, y
 * ni `tsc` ni `next build` lo ven venir: el error aparece recien cuando el
 * array tiene al menos un elemento y el `.map` la ejecuta de verdad.
 *
 * Modulo sin dependencias de servidor ni de cliente, como `estados.ts`: lo
 * importan las dos puntas.
 */
export type SecaderoBuscable = {
  id: number;
  numero: number;
  tipoId: number;
  tipoNombre: string;
  /** null = el tipo no tiene tope fijo. */
  capacidad: number | null;
  estado: Estado;
  /** Serializado: cruza del servidor al cliente. */
  estadoDesde: string;
  total: number;
  contenido: string;
  /** Cuantos productos distintos tiene adentro. */
  productos: number;
};

/** Lo que devuelve `secaderosConContenido`, sin atar este modulo a `consultas`. */
type FilaSecadero = {
  id: number;
  numero: number;
  tipoId: number;
  tipoNombre: string;
  capacidad: number | null;
  estado: Estado;
  estadoDesde: Date;
  total: number;
  contenido: { nombre: string }[];
};

/**
 * Las tres pantallas que usan el buscador -carrusel, paletizado y llenado
 * manual- arman la lista igual, asi que la conversion vive una sola vez.
 */
export function aBuscable(s: FilaSecadero): SecaderoBuscable {
  return {
    id: s.id,
    numero: s.numero,
    tipoId: s.tipoId,
    tipoNombre: s.tipoNombre,
    capacidad: s.capacidad,
    estado: s.estado,
    estadoDesde: s.estadoDesde.toISOString(),
    total: s.total,
    contenido: s.contenido.map((c) => c.nombre).join(", "),
    productos: s.contenido.length,
  };
}

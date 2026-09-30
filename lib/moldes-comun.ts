import type { MotivoMoldesIncompletos } from "./db/schema";

/**
 * Moldes del carrusel: lo que se puede calcular sin base. Lo usan el servidor
 * para validar y las pantallas para mostrar, asi que no importa nada de db.
 */

/** Cuantos moldes de un modelo. Es la forma de un set montado o pedido. */
export type LineaMoldes = {
  productoId: number;
  nombre: string;
  cantidad: number;
};

export const MOTIVOS_MOLDES_INCOMPLETOS: MotivoMoldesIncompletos[] = [
  "mesa_mantenimiento",
  "falta_moldes",
  "otro",
];

export const ETIQUETA_MOTIVO_MOLDES: Record<MotivoMoldesIncompletos, string> = {
  mesa_mantenimiento: "Mesa en mantenimiento",
  falta_moldes: "Falta de moldes",
  otro: "Otro",
};

export function totalMoldes(set: { cantidad: number }[]): number {
  return set.reduce((a, l) => a + l.cantidad, 0);
}

/**
 * Lo que sale y lo que entra para pasar de un set a otro.
 *
 * Se expresa por modelo y no como "cambiar 10 Ekos por 10 Dividida": un cambio
 * puede sacar de dos modelos y meter de uno solo, y emparejarlos seria inventar
 * una correspondencia que el operario no necesita.
 */
export function diferenciaMoldes(
  antes: LineaMoldes[],
  despues: LineaMoldes[],
): { salen: LineaMoldes[]; entran: LineaMoldes[] } {
  const nombres = new Map<number, string>();
  const a = new Map<number, number>();
  const d = new Map<number, number>();
  for (const l of antes) {
    a.set(l.productoId, (a.get(l.productoId) ?? 0) + l.cantidad);
    nombres.set(l.productoId, l.nombre);
  }
  for (const l of despues) {
    d.set(l.productoId, (d.get(l.productoId) ?? 0) + l.cantidad);
    nombres.set(l.productoId, l.nombre);
  }

  const salen: LineaMoldes[] = [];
  const entran: LineaMoldes[] = [];
  for (const id of new Set([...a.keys(), ...d.keys()])) {
    const delta = (d.get(id) ?? 0) - (a.get(id) ?? 0);
    const linea = { productoId: id, nombre: nombres.get(id) ?? "", cantidad: 0 };
    if (delta < 0) salen.push({ ...linea, cantidad: -delta });
    if (delta > 0) entran.push({ ...linea, cantidad: delta });
  }
  const orden = (x: LineaMoldes, y: LineaMoldes) =>
    y.cantidad - x.cantidad || x.nombre.localeCompare(y.nombre);
  return { salen: salen.sort(orden), entran: entran.sort(orden) };
}

export function mismosMoldes(a: LineaMoldes[], b: LineaMoldes[]): boolean {
  const { salen, entran } = diferenciaMoldes(a, b);
  return salen.length === 0 && entran.length === 0;
}

/** "10 Ekos · 4 Lisa" */
export function listaMoldes(set: LineaMoldes[]): string {
  return set
    .filter((l) => l.cantidad > 0)
    .map((l) => `${l.cantidad} ${l.nombre}`)
    .join(" · ");
}

/** El set ordenado como se muestra: los que mas moldes tienen primero. */
export function ordenarSet(set: LineaMoldes[]): LineaMoldes[] {
  return set
    .filter((l) => l.cantidad > 0)
    .sort((x, y) => y.cantidad - x.cantidad || x.nombre.localeCompare(y.nombre));
}

import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
} from "drizzle-orm";
import { db } from "./db";
import {
  ajustesInventarioMoldes,
  cambioMoldesLineas,
  cambiosMoldes,
  planMoldes,
  productos,
  tipos,
  type MotivoMoldesIncompletos,
} from "./db/schema";
import { diferenciaMoldes, ordenarSet, type LineaMoldes } from "./moldes-comun";
import { finDeHoy, rangoDeFecha } from "./rangos";

/** Un cambio de moldes con el set que dejo montado. */
export type CambioMoldes = {
  id: number;
  creadoEn: Date;
  usuarioId: number;
  usuarioNombre: string;
  total: number;
  lugares: number;
  motivoIncompleto: MotivoMoldesIncompletos | null;
  nota: string | null;
  anuladoEn: Date | null;
  anuladoPorNombre: string | null;
  motivoAnulacion: string | null;
  set: LineaMoldes[];
};

async function lineasDe(ids: number[]) {
  const porCambio = new Map<number, LineaMoldes[]>();
  if (ids.length === 0) return porCambio;
  const filas = await db
    .select({
      cambioId: cambioMoldesLineas.cambioId,
      productoId: cambioMoldesLineas.productoId,
      nombre: cambioMoldesLineas.productoNombre,
      cantidad: cambioMoldesLineas.cantidad,
    })
    .from(cambioMoldesLineas)
    .where(inArray(cambioMoldesLineas.cambioId, ids));
  for (const f of filas) {
    const lista = porCambio.get(f.cambioId) ?? [];
    lista.push({ productoId: f.productoId, nombre: f.nombre, cantidad: f.cantidad });
    porCambio.set(f.cambioId, lista);
  }
  return porCambio;
}

const columnas = {
  id: cambiosMoldes.id,
  creadoEn: cambiosMoldes.creadoEn,
  usuarioId: cambiosMoldes.usuarioId,
  usuarioNombre: cambiosMoldes.usuarioNombre,
  total: cambiosMoldes.total,
  lugares: cambiosMoldes.lugares,
  motivoIncompleto: cambiosMoldes.motivoIncompleto,
  nota: cambiosMoldes.nota,
  anuladoEn: cambiosMoldes.anuladoEn,
  anuladoPorNombre: cambiosMoldes.anuladoPorNombre,
  motivoAnulacion: cambiosMoldes.motivoAnulacion,
};

/**
 * Lo que estaba montado en el carrusel en un instante: el ultimo cambio
 * vigente hasta ese momento. null si todavia no se cargo ninguno.
 *
 * Sin argumento es "ahora". Se corta al final del dia y no en `new Date()` por
 * lo mismo que explica `finDeHoy`: el reloj de la base va adelantado.
 */
export async function montadoEn(
  instante: Date = finDeHoy(),
): Promise<CambioMoldes | null> {
  const [fila] = await db
    .select(columnas)
    .from(cambiosMoldes)
    .where(
      and(lte(cambiosMoldes.creadoEn, instante), isNull(cambiosMoldes.anuladoEn)),
    )
    .orderBy(desc(cambiosMoldes.creadoEn), desc(cambiosMoldes.id))
    .limit(1);
  if (!fila) return null;
  const lineas = await lineasDe([fila.id]);
  return { ...fila, set: ordenarSet(lineas.get(fila.id) ?? []) };
}

export type CambioConDiferencia = CambioMoldes & {
  salen: LineaMoldes[];
  entran: LineaMoldes[];
  /** Es el primer set que se cargo: no hay contra que compararlo. */
  inicial: boolean;
};

/**
 * Los cambios de un tramo, del mas nuevo al mas viejo, cada uno con lo que
 * salio y lo que entro respecto del set vigente anterior.
 *
 * Un cambio anulado tambien se compara contra el vigente anterior a el: es lo
 * que habria cambiado si hubiera sido bueno, y asi se lee en el historial.
 */
export async function cambiosDeMoldes(
  desde: Date,
  hasta: Date,
  limite = 200,
): Promise<CambioConDiferencia[]> {
  const filas = await db
    .select(columnas)
    .from(cambiosMoldes)
    .where(
      and(gte(cambiosMoldes.creadoEn, desde), lte(cambiosMoldes.creadoEn, hasta)),
    )
    .orderBy(desc(cambiosMoldes.creadoEn), desc(cambiosMoldes.id))
    .limit(limite);
  if (filas.length === 0) return [];

  const anteriorAlTramo = await montadoEn(new Date(desde.getTime() - 1));
  const lineas = await lineasDe(filas.map((f) => f.id));

  // Se recorre del mas viejo al mas nuevo llevando el ultimo vigente.
  const resultado: CambioConDiferencia[] = [];
  let previo: LineaMoldes[] | null = anteriorAlTramo?.set ?? null;
  for (const f of [...filas].reverse()) {
    const set = ordenarSet(lineas.get(f.id) ?? []);
    const { salen, entran } = diferenciaMoldes(previo ?? [], set);
    resultado.push({ ...f, set, salen, entran, inicial: previo === null });
    if (!f.anuladoEn) previo = set;
  }
  return resultado.reverse();
}

/** El ultimo cambio vigente, que es el unico que se puede anular. */
export async function ultimoCambioVigente() {
  const [fila] = await db
    .select({ id: cambiosMoldes.id })
    .from(cambiosMoldes)
    .where(isNull(cambiosMoldes.anuladoEn))
    .orderBy(desc(cambiosMoldes.creadoEn), desc(cambiosMoldes.id))
    .limit(1);
  return fila?.id ?? null;
}

/** Los moldes pedidos para un dia, o null si ese dia va "sin cambios". */
export async function moldesPedidos(fecha: string): Promise<LineaMoldes[] | null> {
  const filas = await db
    .select({
      productoId: planMoldes.productoId,
      nombre: productos.nombre,
      cantidad: planMoldes.moldes,
    })
    .from(planMoldes)
    .innerJoin(productos, eq(productos.id, planMoldes.productoId))
    .where(eq(planMoldes.fecha, fecha));
  return filas.length === 0 ? null : ordenarSet(filas);
}

/** Que dias de la lista tienen un set de moldes pedido. */
export async function fechasConMoldesPedidos(fechas: string[]): Promise<string[]> {
  if (fechas.length === 0) return [];
  const filas = await db
    .selectDistinct({ fecha: planMoldes.fecha })
    .from(planMoldes)
    .where(inArray(planMoldes.fecha, fechas));
  return filas.map((f) => f.fecha);
}

/**
 * Contra que se compara el set pedido de un dia: "lo de ayer".
 *
 * - Un dia que ya empezo o paso: lo montado al arrancar ese dia (hoy, si
 *   todavia no habia nada cargado, lo montado ahora).
 * - Un dia futuro: el ultimo set pedido entre hoy y el dia anterior, porque
 *   se supone que para entonces ya se habra hecho; si no hay ninguno, lo
 *   montado ahora.
 *
 * Es lo que se muestra cuando el dia no tiene pedido ("sin cambios: sigue
 * esto") y contra lo que se calcula que sale y que entra.
 */
export async function moldesDeReferencia(
  fecha: string,
  hoy: string,
): Promise<LineaMoldes[] | null> {
  if (fecha <= hoy) {
    const m = await montadoEn(new Date(rangoDeFecha(fecha).desde.getTime() - 1));
    // Si el primer set se cargo hoy mismo no hay "ayer": lo mas cercano es lo
    // montado ahora.
    if (!m && fecha === hoy) return (await montadoEn())?.set ?? null;
    return m?.set ?? null;
  }

  const [ultimo] = await db
    .select({ fecha: planMoldes.fecha })
    .from(planMoldes)
    .where(and(gte(planMoldes.fecha, hoy), lt(planMoldes.fecha, fecha)))
    .orderBy(desc(planMoldes.fecha))
    .limit(1);
  if (ultimo) return moldesPedidos(ultimo.fecha);

  const m = await montadoEn();
  return m?.set ?? null;
}

/**
 * Inventario de moldes: los modelos del carrusel con cuantos moldes hay de
 * cada uno. Solo el circuito principal: las guardas no van en el carrusel.
 */
export async function inventarioMoldes() {
  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      moldes: productos.moldes,
      activo: productos.activo,
    })
    .from(productos)
    .innerJoin(tipos, eq(tipos.id, productos.tipoId))
    .where(eq(tipos.llenadoManual, false))
    .orderBy(asc(productos.nombre));
}

/**
 * Todo lo que la pantalla del carrusel necesita de moldes para un dia.
 *
 * Hoy: lo montado ahora y lo pedido para hoy. Un dia pasado: lo que quedo
 * montado al terminar el dia, y lo que se cambio ese dia. Un dia futuro: lo
 * pedido y contra que se compara.
 */
export async function datosMoldesCarrusel(
  fecha: string,
  hoy: string,
  quien: { uid: number; rol: string },
) {
  const { desde, hasta } = rangoDeFecha(fecha);
  const esFuturo = fecha > hoy;

  const [montado, pedido, referencia, inventario, cambios, ultimoId] =
    await Promise.all([
      esFuturo ? Promise.resolve(null) : montadoEn(fecha === hoy ? finDeHoy() : hasta),
      moldesPedidos(fecha),
      esFuturo ? moldesDeReferencia(fecha, hoy) : Promise.resolve(null),
      inventarioMoldes(),
      esFuturo ? Promise.resolve([]) : cambiosDeMoldes(desde, hasta),
      ultimoCambioVigente(),
    ]);

  const puedeAnular = (c: CambioConDiferencia) =>
    !c.anuladoEn &&
    c.id === ultimoId &&
    (quien.rol === "admin" ||
      (quien.rol === "carrusel" && c.usuarioId === quien.uid && fecha === hoy));

  return {
    montado: montado && {
      id: montado.id,
      set: montado.set,
      total: montado.total,
      motivoIncompleto: montado.motivoIncompleto,
      nota: montado.nota,
      usuarioNombre: montado.usuarioNombre,
      creadoEn: montado.creadoEn.toISOString(),
    },
    pedido,
    referencia,
    inventario: inventario
      .filter((p) => p.activo)
      .map((p) => ({ id: p.id, nombre: p.nombre, moldes: p.moldes })),
    cambios: cambios.map((c) => ({
      id: c.id,
      creadoEn: c.creadoEn.toISOString(),
      usuarioNombre: c.usuarioNombre,
      total: c.total,
      lugares: c.lugares,
      motivoIncompleto: c.motivoIncompleto,
      nota: c.nota,
      anulado: !!c.anuladoEn,
      anuladoPorNombre: c.anuladoPorNombre,
      motivoAnulacion: c.motivoAnulacion,
      salen: c.salen,
      entran: c.entran,
      inicial: c.inicial,
      set: c.set,
      anulable: puedeAnular(c),
    })),
  };
}

/** Los cambios del inventario de moldes de un tramo, del mas nuevo al mas viejo. */
export async function ajustesDeInventario(desde: Date, hasta: Date, limite = 300) {
  return db
    .select()
    .from(ajustesInventarioMoldes)
    .where(
      and(
        gte(ajustesInventarioMoldes.creadoEn, desde),
        lte(ajustesInventarioMoldes.creadoEn, hasta),
      ),
    )
    .orderBy(desc(ajustesInventarioMoldes.creadoEn), desc(ajustesInventarioMoldes.id))
    .limit(limite);
}

/**
 * Cuantos moldes habia de cada modelo en un instante: el "despues" del ultimo
 * ajuste de cada modelo hasta ese momento. Un modelo sin ajustes hasta ahi no
 * figura, porque su inventario todavia no se habia cargado.
 */
export async function inventarioEn(instante: Date) {
  const filas = await db
    .selectDistinctOn([ajustesInventarioMoldes.productoId], {
      productoId: ajustesInventarioMoldes.productoId,
      nombre: ajustesInventarioMoldes.productoNombre,
      moldes: ajustesInventarioMoldes.despues,
    })
    .from(ajustesInventarioMoldes)
    .where(lte(ajustesInventarioMoldes.creadoEn, instante))
    .orderBy(
      ajustesInventarioMoldes.productoId,
      desc(ajustesInventarioMoldes.creadoEn),
      desc(ajustesInventarioMoldes.id),
    );
  return filas
    .filter((f) => f.moldes > 0)
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

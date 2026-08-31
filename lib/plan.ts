import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  motivosDesvio,
  movimientoLineas,
  movimientos,
  planLineas,
  planes,
  productos,
  tipos,
  type Sector,
} from "./db/schema";
import { rangoDeFecha } from "./rangos";

/** El movimiento que cuenta como "hecho" para cada sector. */
const MOVIMIENTO_DEL_SECTOR = {
  carrusel: "carga",
  paletizado: "descarga",
} as const;

export type LineaPlan = {
  lineaId: number;
  productoId: number;
  producto: string;
  tipoNombre: string;
  capacidad: number;
  pedidos: number;
  hechos: number;
  placas: number;
  placasEsperadas: number;
  motivoDesvioId: number | null;
  notaDesvio: string | null;
  explicadoPorNombre: string | null;
};

export type ComparacionPlan = {
  fecha: string;
  sector: Sector;
  /** null significa que ese dia no se cargo plan, que no es lo mismo que cero. */
  hayPlan: boolean;
  planId: number | null;
  nota: string | null;
  lineas: LineaPlan[];
  /** Lo que se hizo y no estaba pedido. */
  fueraDePlan: { producto: string; hechos: number; placas: number }[];
  totalPedido: number;
  totalHecho: number;
};

/**
 * Compara la orden del dia contra lo que realmente se hizo.
 *
 * El desvio no se carga en ningun lado: se calcula. Lo unico que una persona
 * agrega despues es el motivo, y eso vive en la linea del plan.
 *
 * Un secadero con varios productos cuenta para cada producto que lleva adentro.
 * Es deliberado: el flujo optimo es un producto por secadero, asi que un mixto
 * es la excepcion y conviene que se vea en las dos columnas y no repartido a
 * medias en ninguna.
 */
export async function compararPlan(
  fecha: string,
  sector: Sector,
): Promise<ComparacionPlan> {
  const { desde, hasta } = rangoDeFecha(fecha);
  const tipoMovimiento = MOVIMIENTO_DEL_SECTOR[sector];

  const [plan] = await db
    .select()
    .from(planes)
    .where(and(eq(planes.fecha, fecha), eq(planes.sector, sector)))
    .limit(1);

  const lineasPlan = plan
    ? await db
        .select({
          lineaId: planLineas.id,
          productoId: planLineas.productoId,
          producto: productos.nombre,
          tipoNombre: tipos.nombre,
          capacidad: tipos.capacidad,
          pedidos: planLineas.secaderos,
          motivoDesvioId: planLineas.motivoDesvioId,
          notaDesvio: planLineas.notaDesvio,
          explicadoPorNombre: planLineas.explicadoPorNombre,
        })
        .from(planLineas)
        .innerJoin(productos, eq(productos.id, planLineas.productoId))
        .innerJoin(tipos, eq(tipos.id, productos.tipoId))
        .where(eq(planLineas.planId, plan.id))
        .orderBy(asc(productos.nombre))
    : [];

  // Lo hecho: secaderos distintos y placas, por producto.
  const realizado = await db
    .select({
      productoId: movimientoLineas.productoId,
      producto: movimientoLineas.productoNombre,
      hechos: sql<string>`count(distinct ${movimientos.id})`,
      placas: sql<string>`coalesce(sum(${movimientoLineas.cantidad}), 0)`,
    })
    .from(movimientos)
    .innerJoin(
      movimientoLineas,
      eq(movimientoLineas.movimientoId, movimientos.id),
    )
    .where(
      and(
        eq(movimientos.tipo, tipoMovimiento),
        gte(movimientos.creadoEn, desde),
        lte(movimientos.creadoEn, hasta),
        sql`${movimientoLineas.cantidad} > 0`,
      ),
    )
    .groupBy(movimientoLineas.productoId, movimientoLineas.productoNombre);

  const porProducto = new Map(
    realizado.map((r) => [
      r.productoId,
      {
        producto: r.producto,
        hechos: Number(r.hechos),
        placas: Number(r.placas),
      },
    ]),
  );

  const lineas: LineaPlan[] = lineasPlan.map((l) => {
    const real = porProducto.get(l.productoId);
    porProducto.delete(l.productoId);
    return {
      ...l,
      hechos: real?.hechos ?? 0,
      placas: real?.placas ?? 0,
      placasEsperadas: l.pedidos * l.capacidad,
    };
  });

  const fueraDePlan = [...porProducto.values()].sort(
    (a, b) => b.hechos - a.hechos,
  );

  return {
    fecha,
    sector,
    hayPlan: !!plan,
    planId: plan?.id ?? null,
    nota: plan?.nota ?? null,
    lineas,
    fueraDePlan,
    totalPedido: lineas.reduce((a, l) => a + l.pedidos, 0),
    totalHecho: lineas.reduce((a, l) => a + Math.min(l.hechos, l.pedidos), 0),
  };
}

/**
 * Cuantos secaderos entrego el horno ese dia.
 *
 * Paletizado no controla su techo: si el horno no seco, no hay nada que
 * descargar. Sin este numero, medir su cumplimiento contra el plan seria
 * medirlos por un problema ajeno.
 *
 * Se cuenta lo que SALIO del horno ese dia y no "lo que habia disponible":
 * reconstruir cuantos secaderos estaban secos al empezar la jornada exigiria
 * rearmar el estado historico de cada secadero. Este numero es medible sin
 * inventar nada, y es el que explica un dia flojo.
 */
export async function entregadosPorElHorno(fecha: string) {
  const { desde, hasta } = rangoDeFecha(fecha);

  const [r] = await db
    .select({ n: sql<string>`count(*)` })
    .from(movimientos)
    .where(
      and(
        eq(movimientos.tipo, "salida_horno"),
        gte(movimientos.creadoEn, desde),
        lte(movimientos.creadoEn, hasta),
      ),
    );

  return Number(r?.n ?? 0);
}

/** Planes cargados en un rango de fechas, para la vista semanal del admin. */
export async function planesDeFechas(fechas: string[]) {
  if (fechas.length === 0) return [];

  const filas = await db
    .select({
      id: planes.id,
      fecha: planes.fecha,
      sector: planes.sector,
      lineas: sql<string>`count(${planLineas.id})`,
      secaderos: sql<string>`coalesce(sum(${planLineas.secaderos}), 0)`,
    })
    .from(planes)
    .leftJoin(planLineas, eq(planLineas.planId, planes.id))
    .where(inArray(planes.fecha, fechas))
    .groupBy(planes.id, planes.fecha, planes.sector);

  return filas.map((f) => ({
    id: f.id,
    fecha: f.fecha,
    sector: f.sector,
    lineas: Number(f.lineas),
    secaderos: Number(f.secaderos),
  }));
}

/**
 * Lo pedido en cada dia de la semana para un sector, producto por producto.
 *
 * Se trae entero para que "copiar de otro dia" sea instantaneo en el cliente.
 * Cargar siete dias tipeando desde cero no lo hace nadie, asi que copiar tiene
 * que ser un toque y no una navegacion de ida y vuelta.
 */
export async function lineasDeSemana(fechas: string[], sector: Sector) {
  if (fechas.length === 0) return {} as Record<string, Record<number, number>>;

  const filas = await db
    .select({
      fecha: planes.fecha,
      productoId: planLineas.productoId,
      secaderos: planLineas.secaderos,
    })
    .from(planes)
    .innerJoin(planLineas, eq(planLineas.planId, planes.id))
    .where(and(inArray(planes.fecha, fechas), eq(planes.sector, sector)));

  const porFecha: Record<string, Record<number, number>> = {};
  for (const f of filas) {
    (porFecha[f.fecha] ??= {})[f.productoId] = f.secaderos;
  }
  return porFecha;
}

export async function motivosDesvioActivos() {
  return db
    .select()
    .from(motivosDesvio)
    .where(eq(motivosDesvio.activo, true))
    .orderBy(asc(motivosDesvio.nombre));
}

export async function todosLosMotivosDesvio() {
  return db.select().from(motivosDesvio).orderBy(asc(motivosDesvio.nombre));
}

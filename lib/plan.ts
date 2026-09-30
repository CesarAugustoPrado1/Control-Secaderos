import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  motivosDesvio,
  movimientoLineas,
  movimientos,
  notasHorno,
  paletsArmados,
  planLineas,
  planes,
  productos,
  tipos,
  type Destino,
  type Sector,
  type TipoPalet,
} from "./db/schema";
import { rangoDeFecha } from "./rangos";
import { vigente } from "./vigencia";

/** El movimiento que cuenta como "hecho" para cada sector. */
const MOVIMIENTO_DEL_SECTOR = {
  carrusel: "carga",
  paletizado: "descarga",
} as const;

/** Palets pedidos y confirmados de un tipo. */
export type AvancePalets = { pedidos: number; hechos: number };

export type LineaPlan = {
  lineaId: number;
  productoId: number;
  producto: string;
  tipoNombre: string;
  /** null = el tipo no tiene tope fijo. */
  capacidad: number | null;
  pedidos: number;
  hechos: number;
  placas: number;
  /**
   * Cuantas placas deberian salir de los secaderos pedidos. Es null cuando el
   * tipo no tiene tope: sin capacidad no hay meta en placas que calcular, y el
   * plan de esos productos se sigue solo por cantidad de secaderos.
   */
  placasEsperadas: number | null;
  /**
   * Destino de los planes viejos, de antes de pedir palets por cantidad. Se
   * sigue mostrando para leer esos dias; los planes nuevos lo dejan en null.
   */
  destino: Destino | null;
  /** Solo en paletizado. */
  palets: Record<TipoPalet, AvancePalets>;
  cliente: string | null;
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
  fueraDePlan: {
    producto: string;
    hechos: number;
    placas: number;
    palets: Record<TipoPalet, number>;
  }[];
  totalPedido: number;
  totalHecho: number;
  /**
   * Palets de todo el dia, por tipo. Lo hecho suma sin tope: si se pidieron 7
   * y se armaron 9, es 9/7 y tiene que verse asi.
   */
  palets: Record<TipoPalet, AvancePalets>;
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
          destino: planLineas.destino,
          cliente: planLineas.cliente,
          paletsEstandar: planLineas.paletsEstandar,
          paletsOptimizados: planLineas.paletsOptimizados,
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

  /**
   * Lo hecho: secaderos distintos y placas, por producto.
   *
   * Se excluyen los tipos de llenado manual. El plan es del carrusel y de
   * paletizado, y las guardas las llena y las descarga otro puesto: contarlas
   * aca le acreditaria al carrusel secaderos que no cargo, y encima
   * apareciendo como "fuera de plan", que es la columna que se mira para
   * entender un desvio. El leftJoin es porque el tipo pudo haberse borrado, y
   * en ese caso el movimiento es del circuito principal.
   */
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
    .leftJoin(tipos, eq(tipos.id, movimientos.secaderoTipoId))
    .where(
      and(
        eq(movimientos.tipo, tipoMovimiento),
        gte(movimientos.creadoEn, desde),
        lte(movimientos.creadoEn, hasta),
        sql`${movimientoLineas.cantidad} > 0`,
        sql`coalesce(${tipos.llenadoManual}, false) = false`,
        vigente(),
      ),
    )
    .groupBy(movimientoLineas.productoId, movimientoLineas.productoNombre);

  /**
   * Palets confirmados ese dia, por producto y tipo. Solo paletizado arma
   * palets. Van por fecha del plan, no por la hora del registro.
   */
  const armados =
    sector === "paletizado"
      ? await db
          .select({
            productoId: paletsArmados.productoId,
            producto: paletsArmados.productoNombre,
            tipo: paletsArmados.tipo,
            cantidad: sql<string>`coalesce(sum(${paletsArmados.cantidad}), 0)`,
          })
          .from(paletsArmados)
          .where(eq(paletsArmados.fecha, fecha))
          .groupBy(
            paletsArmados.productoId,
            paletsArmados.productoNombre,
            paletsArmados.tipo,
          )
      : [];

  const vacio = () => ({ estandar: 0, optimizado: 0 });
  const porProducto = new Map<
    number,
    {
      producto: string;
      hechos: number;
      placas: number;
      palets: Record<TipoPalet, number>;
    }
  >(
    realizado.map((r) => [
      r.productoId,
      {
        producto: r.producto,
        hechos: Number(r.hechos),
        placas: Number(r.placas),
        palets: vacio(),
      },
    ]),
  );
  for (const a of armados) {
    const n = Number(a.cantidad);
    if (n === 0) continue;
    const fila = porProducto.get(a.productoId) ?? {
      producto: a.producto,
      hechos: 0,
      placas: 0,
      palets: vacio(),
    };
    fila.palets[a.tipo] += n;
    porProducto.set(a.productoId, fila);
  }

  const lineas: LineaPlan[] = lineasPlan.map(
    ({ paletsEstandar, paletsOptimizados, ...l }) => {
      const real = porProducto.get(l.productoId);
      porProducto.delete(l.productoId);
      return {
        ...l,
        hechos: real?.hechos ?? 0,
        placas: real?.placas ?? 0,
        placasEsperadas: l.capacidad === null ? null : l.pedidos * l.capacidad,
        palets: {
          estandar: {
            pedidos: paletsEstandar ?? 0,
            hechos: real?.palets.estandar ?? 0,
          },
          optimizado: {
            pedidos: paletsOptimizados ?? 0,
            hechos: real?.palets.optimizado ?? 0,
          },
        },
      };
    },
  );

  const fueraDePlan = [...porProducto.values()].sort(
    (a, b) => b.hechos - a.hechos,
  );

  const sumaPalets = (tipo: TipoPalet): AvancePalets => ({
    pedidos: lineas.reduce((a, l) => a + l.palets[tipo].pedidos, 0),
    hechos:
      lineas.reduce((a, l) => a + l.palets[tipo].hechos, 0) +
      fueraDePlan.reduce((a, f) => a + f.palets[tipo], 0),
  });

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
    palets: { estandar: sumaPalets("estandar"), optimizado: sumaPalets("optimizado") },
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
        vigente(),
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
      palets: sql<string>`coalesce(sum(coalesce(${planLineas.paletsEstandar}, 0) + coalesce(${planLineas.paletsOptimizados}, 0)), 0)`,
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
    palets: Number(f.palets),
  }));
}

/** Lo pedido para un producto en un dia: cantidad, destino y cliente. */
export type PedidoDeDia = {
  secaderos: number;
  destino: Destino | null;
  cliente: string | null;
  paletsEstandar: number | null;
  paletsOptimizados: number | null;
};

/**
 * Lo pedido en cada dia de la semana para un sector, producto por producto.
 *
 * Se trae entero para que "copiar de otro dia" sea instantaneo en el cliente.
 * Cargar siete dias tipeando desde cero no lo hace nadie, asi que copiar tiene
 * que ser un toque y no una navegacion de ida y vuelta.
 *
 * Copia tambien destino y cliente: si copiar el lunes al martes trajera solo
 * las cantidades, habria que volver a escribir a mano la instruccion de cada
 * linea, que es justo la parte tediosa.
 */
export async function lineasDeSemana(fechas: string[], sector: Sector) {
  if (fechas.length === 0)
    return {} as Record<string, Record<number, PedidoDeDia>>;

  const filas = await db
    .select({
      fecha: planes.fecha,
      productoId: planLineas.productoId,
      secaderos: planLineas.secaderos,
      destino: planLineas.destino,
      cliente: planLineas.cliente,
      paletsEstandar: planLineas.paletsEstandar,
      paletsOptimizados: planLineas.paletsOptimizados,
    })
    .from(planes)
    .innerJoin(planLineas, eq(planLineas.planId, planes.id))
    .where(and(inArray(planes.fecha, fechas), eq(planes.sector, sector)));

  const porFecha: Record<string, Record<number, PedidoDeDia>> = {};
  for (const f of filas) {
    (porFecha[f.fecha] ??= {})[f.productoId] = {
      secaderos: f.secaderos,
      destino: f.destino,
      cliente: f.cliente,
      paletsEstandar: f.paletsEstandar,
      paletsOptimizados: f.paletsOptimizados,
    };
  }
  return porFecha;
}

/** Las dos indicaciones del dia para el hornero. Vacias si no se cargo nada. */
export async function notasDelHorno(fecha: string) {
  const [fila] = await db
    .select({ carga: notasHorno.carga, descarga: notasHorno.descarga })
    .from(notasHorno)
    .where(eq(notasHorno.fecha, fecha))
    .limit(1);

  return { carga: fila?.carga ?? null, descarga: fila?.descarga ?? null };
}

/** Que dias de la semana tienen indicaciones para el horno. */
export async function notasHornoDeFechas(fechas: string[]) {
  if (fechas.length === 0) return [];
  return db
    .select({
      fecha: notasHorno.fecha,
      carga: notasHorno.carga,
      descarga: notasHorno.descarga,
    })
    .from(notasHorno)
    .where(inArray(notasHorno.fecha, fechas));
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

import "server-only";
import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  max,
  min,
  sql,
  sum,
} from "drizzle-orm";
import { db } from "./db";
import {
  movimientoLineas,
  movimientos,
  tipos,
  type TipoMovimiento,
} from "./db/schema";

export type Rango = { desde: Date; hasta: Date };

export function rangoDeDias(dias: number): Rango {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 24 * 60 * 60 * 1000);
  return { desde, hasta };
}

const enRango = (r: Rango) =>
  and(gte(movimientos.creadoEn, r.desde), lte(movimientos.creadoEn, r.hasta));

const aNumero = (v: string | number | null) => (v == null ? 0 : Number(v));

/* -------------------------------------------------------------------------- */
/* Tiempos                                                                    */
/* -------------------------------------------------------------------------- */

export type TiempoPorEtapa = {
  tipo: TipoMovimiento;
  movimientos: number;
  promedioMin: number;
  minimoMin: number;
  maximoMin: number;
};

/**
 * `duracion_min` de un movimiento es cuanto duro el estado ANTERIOR. Entonces:
 *  - salida_horno  -> tiempo de horno
 *  - entrada_horno -> espera del secadero humedo antes de entrar
 *  - descarga      -> espera del secadero seco antes de paletizarse
 *  - carga         -> cuanto estuvo el secadero parado sin usar
 */
export async function tiemposPorEtapa(rango: Rango): Promise<TiempoPorEtapa[]> {
  const filas = await db
    .select({
      tipo: movimientos.tipo,
      movimientos: count(),
      promedio: avg(movimientos.duracionMin),
      minimo: min(movimientos.duracionMin),
      maximo: max(movimientos.duracionMin),
    })
    .from(movimientos)
    .where(and(enRango(rango), isNotNull(movimientos.duracionMin)))
    .groupBy(movimientos.tipo);

  return filas.map((f) => ({
    tipo: f.tipo,
    movimientos: f.movimientos,
    promedioMin: Math.round(aNumero(f.promedio)),
    minimoMin: aNumero(f.minimo),
    maximoMin: aNumero(f.maximo),
  }));
}

export type TiempoHorno = {
  tipo: string;
  ciclos: number;
  promedioMin: number;
  minimoMin: number;
  maximoMin: number;
};

/** Tiempo de horno abierto por tipo de secadero: es la comparacion que importa. */
export async function tiempoDeHornoPorTipo(
  rango: Rango,
): Promise<TiempoHorno[]> {
  const filas = await db
    .select({
      tipo: movimientos.secaderoTipoNombre,
      ciclos: count(),
      promedio: avg(movimientos.duracionMin),
      minimo: min(movimientos.duracionMin),
      maximo: max(movimientos.duracionMin),
    })
    .from(movimientos)
    .where(
      and(
        enRango(rango),
        eq(movimientos.tipo, "salida_horno"),
        isNotNull(movimientos.duracionMin),
      ),
    )
    .groupBy(movimientos.secaderoTipoNombre);

  return filas.map((f) => ({
    tipo: f.tipo,
    ciclos: f.ciclos,
    promedioMin: Math.round(aNumero(f.promedio)),
    minimoMin: aNumero(f.minimo),
    maximoMin: aNumero(f.maximo),
  }));
}

/** Ciclos de horno mas recientes, para ver la dispersion real y no solo el promedio. */
export async function ultimosCiclosDeHorno(rango: Rango, limite = 30) {
  return db
    .select({
      id: movimientos.id,
      secaderoNumero: movimientos.secaderoNumero,
      tipo: movimientos.secaderoTipoNombre,
      duracionMin: movimientos.duracionMin,
      creadoEn: movimientos.creadoEn,
      usuarioNombre: movimientos.usuarioNombre,
    })
    .from(movimientos)
    .where(
      and(
        enRango(rango),
        eq(movimientos.tipo, "salida_horno"),
        isNotNull(movimientos.duracionMin),
      ),
    )
    .orderBy(desc(movimientos.creadoEn))
    .limit(limite);
}

/* -------------------------------------------------------------------------- */
/* Produccion y desperdicio                                                   */
/* -------------------------------------------------------------------------- */

export type Totales = {
  cargadas: number;
  terminadas: number;
  rotas: number;
};

/**
 * `cargadas` cuenta lo que entro al circuito (placas cargadas + las que se
 * rompieron en la propia carga), asi el porcentaje de rotura tiene un
 * denominador honesto.
 */
export async function totales(rango: Rango): Promise<Totales> {
  const [fila] = await db
    .select({
      cargadas: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'carga'
        then ${movimientoLineas.cantidad} + ${movimientoLineas.desperdicio} else 0 end), 0)`,
      terminadas: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'descarga'
        then ${movimientoLineas.cantidad} else 0 end), 0)`,
      rotas: sql<string>`coalesce(sum(${movimientoLineas.desperdicio}), 0)`,
    })
    .from(movimientoLineas)
    .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
    .where(enRango(rango));

  return {
    cargadas: aNumero(fila?.cargadas ?? 0),
    terminadas: aNumero(fila?.terminadas ?? 0),
    rotas: aNumero(fila?.rotas ?? 0),
  };
}

export async function desperdicioPorMotivo(rango: Rango) {
  const filas = await db
    .select({
      motivo: sql<string>`coalesce(${movimientoLineas.motivoNombre}, 'Sin motivo')`,
      placas: sum(movimientoLineas.desperdicio),
    })
    .from(movimientoLineas)
    .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
    .where(and(enRango(rango), sql`${movimientoLineas.desperdicio} > 0`))
    .groupBy(sql`coalesce(${movimientoLineas.motivoNombre}, 'Sin motivo')`)
    .orderBy(desc(sum(movimientoLineas.desperdicio)));

  return filas.map((f) => ({ motivo: f.motivo, placas: aNumero(f.placas) }));
}

/** En que paso del circuito se rompen las placas. */
export async function desperdicioPorEtapa(rango: Rango) {
  const filas = await db
    .select({
      tipo: movimientos.tipo,
      placas: sum(movimientoLineas.desperdicio),
    })
    .from(movimientoLineas)
    .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
    .where(and(enRango(rango), sql`${movimientoLineas.desperdicio} > 0`))
    .groupBy(movimientos.tipo)
    .orderBy(desc(sum(movimientoLineas.desperdicio)));

  return filas.map((f) => ({ tipo: f.tipo, placas: aNumero(f.placas) }));
}

export type FilaModelo = {
  modelo: string;
  cargadas: number;
  terminadas: number;
  rotas: number;
};

export async function resumenPorModelo(rango: Rango): Promise<FilaModelo[]> {
  const filas = await db
    .select({
      modelo: movimientoLineas.productoNombre,
      cargadas: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'carga'
        then ${movimientoLineas.cantidad} + ${movimientoLineas.desperdicio} else 0 end), 0)`,
      terminadas: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'descarga'
        then ${movimientoLineas.cantidad} else 0 end), 0)`,
      rotas: sql<string>`coalesce(sum(${movimientoLineas.desperdicio}), 0)`,
    })
    .from(movimientoLineas)
    .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
    .where(enRango(rango))
    .groupBy(movimientoLineas.productoNombre)
    .orderBy(desc(sql`coalesce(sum(case when ${movimientos.tipo} = 'carga'
      then ${movimientoLineas.cantidad} + ${movimientoLineas.desperdicio} else 0 end), 0)`));

  return filas.map((f) => ({
    modelo: f.modelo,
    cargadas: aNumero(f.cargadas),
    terminadas: aNumero(f.terminadas),
    rotas: aNumero(f.rotas),
  }));
}

/** Roturas atribuidas a cada operario, para detectar donde reforzar. */
export async function desperdicioPorUsuario(rango: Rango) {
  const filas = await db
    .select({
      usuario: movimientos.usuarioNombre,
      placas: sum(movimientoLineas.desperdicio),
      movimientos: sql<string>`count(distinct ${movimientos.id})`,
    })
    .from(movimientoLineas)
    .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
    .where(and(enRango(rango), sql`${movimientoLineas.desperdicio} > 0`))
    .groupBy(movimientos.usuarioNombre)
    .orderBy(desc(sum(movimientoLineas.desperdicio)));

  return filas.map((f) => ({
    usuario: f.usuario,
    placas: aNumero(f.placas),
    movimientos: aNumero(f.movimientos),
  }));
}

/* -------------------------------------------------------------------------- */
/* Adherencia al flujo optimo                                                 */
/* -------------------------------------------------------------------------- */

export type Adherencia = {
  total: number;
  optimas: number;
  incompletas: number;
  mezcladas: number;
  desvios: {
    id: number;
    secaderoNumero: number;
    tipo: string;
    placas: number;
    capacidad: number;
    productos: number;
    usuarioNombre: string;
    creadoEn: Date;
  }[];
};

/**
 * El flujo optimo es: secadero completo y con un solo producto.
 *
 * Se mide sobre las cargas, comparando lo que entro contra la capacidad del
 * tipo. Las que se apartan se listan para poder revisarlas: el valor no esta
 * en el porcentaje sino en ver que carga concreta se salio de la norma.
 */
export async function adherenciaAlFlujo(rango: Rango): Promise<Adherencia> {
  const filas = await db
    .select({
      id: movimientos.id,
      secaderoNumero: movimientos.secaderoNumero,
      tipoNombre: movimientos.secaderoTipoNombre,
      capacidad: tipos.capacidad,
      usuarioNombre: movimientos.usuarioNombre,
      creadoEn: movimientos.creadoEn,
      placas: sql<string>`coalesce(sum(${movimientoLineas.cantidad}), 0)`,
      productos: sql<string>`count(distinct ${movimientoLineas.productoId})
        filter (where ${movimientoLineas.cantidad} > 0)`,
    })
    .from(movimientos)
    .innerJoin(movimientoLineas, eq(movimientoLineas.movimientoId, movimientos.id))
    // El tipo puede haberse borrado; en ese caso la carga no se puede evaluar.
    .innerJoin(tipos, eq(tipos.id, movimientos.secaderoTipoId))
    .where(and(enRango(rango), eq(movimientos.tipo, "carga")))
    .groupBy(
      movimientos.id,
      movimientos.secaderoNumero,
      movimientos.secaderoTipoNombre,
      tipos.capacidad,
      movimientos.usuarioNombre,
      movimientos.creadoEn,
    )
    .orderBy(desc(movimientos.creadoEn));

  let optimas = 0;
  let incompletas = 0;
  let mezcladas = 0;
  const desvios: Adherencia["desvios"] = [];

  for (const f of filas) {
    const placas = aNumero(f.placas);
    const productos = aNumero(f.productos);
    const completa = placas >= f.capacidad;
    const simple = productos === 1;

    if (completa && simple) {
      optimas++;
      continue;
    }
    if (!completa) incompletas++;
    if (!simple) mezcladas++;
    if (desvios.length < 50) {
      desvios.push({
        id: f.id,
        secaderoNumero: f.secaderoNumero,
        tipo: f.tipoNombre,
        placas,
        capacidad: f.capacidad,
        productos,
        usuarioNombre: f.usuarioNombre,
        creadoEn: f.creadoEn,
      });
    }
  }

  return { total: filas.length, optimas, incompletas, mezcladas, desvios };
}

/* -------------------------------------------------------------------------- */
/* Promedios de rotura                                                        */
/* -------------------------------------------------------------------------- */

export type PromedioRotura = {
  clave: string;
  secaderos: number;
  rotas: number;
  promedio: number;
};

const armarPromedio = (
  filas: { clave: string; secaderos: string | number; rotas: string | number }[],
): PromedioRotura[] =>
  filas.map((f) => {
    const secaderos = aNumero(f.secaderos);
    const rotas = aNumero(f.rotas);
    return {
      clave: f.clave,
      secaderos,
      rotas,
      // Promedio por secadero movido, no por placa: es la unidad con la que se
      // trabaja en planta ("cuantas se rompen por secadero").
      promedio: secaderos > 0 ? rotas / secaderos : 0,
    };
  });

/** Roturas promedio por secadero, abiertas por tipo de secadero. */
export async function roturasPorTipoSecadero(
  rango: Rango,
): Promise<PromedioRotura[]> {
  const filas = await db
    .select({
      clave: movimientos.secaderoTipoNombre,
      secaderos: sql<string>`count(distinct ${movimientos.id})`,
      rotas: sql<string>`coalesce(sum(${movimientoLineas.desperdicio}), 0)`,
    })
    .from(movimientos)
    .leftJoin(movimientoLineas, eq(movimientoLineas.movimientoId, movimientos.id))
    .where(and(enRango(rango), eq(movimientos.tipo, "carga")))
    .groupBy(movimientos.secaderoTipoNombre);

  return armarPromedio(filas).sort((a, b) => b.promedio - a.promedio);
}

/** Roturas promedio por secadero movido, abiertas por etapa del proceso. */
export async function roturasPorEtapa(rango: Rango): Promise<PromedioRotura[]> {
  const filas = await db
    .select({
      clave: movimientos.tipo,
      secaderos: sql<string>`count(distinct ${movimientos.id})`,
      rotas: sql<string>`coalesce(sum(${movimientoLineas.desperdicio}), 0)`,
    })
    .from(movimientos)
    .leftJoin(movimientoLineas, eq(movimientoLineas.movimientoId, movimientos.id))
    .where(enRango(rango))
    .groupBy(movimientos.tipo);

  return armarPromedio(filas).sort((a, b) => b.promedio - a.promedio);
}

/** Roturas promedio por secadero cargado, abiertas por producto. */
export async function roturasPorProducto(
  rango: Rango,
): Promise<PromedioRotura[]> {
  const filas = await db
    .select({
      clave: movimientoLineas.productoNombre,
      secaderos: sql<string>`count(distinct ${movimientos.id})`,
      rotas: sql<string>`coalesce(sum(${movimientoLineas.desperdicio}), 0)`,
    })
    .from(movimientoLineas)
    .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
    .where(enRango(rango))
    .groupBy(movimientoLineas.productoNombre);

  return armarPromedio(filas)
    .filter((f) => f.rotas > 0)
    .sort((a, b) => b.promedio - a.promedio);
}

/* -------------------------------------------------------------------------- */
/* Horno                                                                      */
/* -------------------------------------------------------------------------- */

/** Secaderos que entraron y salieron del horno cada dia. */
export async function movimientoDeHornoDiario(rango: Rango) {
  const dia = sql`to_char(${movimientos.creadoEn} at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`;

  const filas = await db
    .select({
      dia: sql<string>`${dia}`,
      entraron: sql<string>`count(*) filter (where ${movimientos.tipo} = 'entrada_horno')`,
      salieron: sql<string>`count(*) filter (where ${movimientos.tipo} = 'salida_horno')`,
    })
    .from(movimientos)
    .where(
      and(
        enRango(rango),
        inArray(movimientos.tipo, ["entrada_horno", "salida_horno"]),
      ),
    )
    .groupBy(dia)
    .orderBy(desc(dia))
    .limit(14);

  return filas.map((f) => ({
    dia: f.dia,
    entraron: aNumero(f.entraron),
    salieron: aNumero(f.salieron),
  }));
}

/** Placas terminadas por dia, para el grafico de barras. */
export async function produccionDiaria(rango: Rango) {
  const filas = await db
    .select({
      dia: sql<string>`to_char(${movimientos.creadoEn} at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`,
      terminadas: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'descarga'
        then ${movimientoLineas.cantidad} else 0 end), 0)`,
      rotas: sql<string>`coalesce(sum(${movimientoLineas.desperdicio}), 0)`,
    })
    .from(movimientoLineas)
    .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
    .where(enRango(rango))
    .groupBy(
      sql`to_char(${movimientos.creadoEn} at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`,
    )
    .orderBy(
      sql`to_char(${movimientos.creadoEn} at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`,
    );

  return filas.map((f) => ({
    dia: f.dia,
    terminadas: aNumero(f.terminadas),
    rotas: aNumero(f.rotas),
  }));
}

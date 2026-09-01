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

/* -------------------------------------------------------------------------- */
/* Aprovechamiento del horno                                                  */
/* -------------------------------------------------------------------------- */

export type Hornada = {
  inicio: Date;
  usuario: string;
  secaderos: number;
  /** Cuantos secaderos habia en humedo justo antes de esta hornada. */
  habiaEsperando: number;
};

export type UsoDelHorno = {
  hornadas: Hornada[];
  total: number;
  promedioSecaderos: number;
  completas: number;
  /**
   * Hornadas que entraron por debajo de la capacidad TENIENDO material de
   * sobra esperando. Son las unicas que dependen del sector: si el horno entro
   * a medias porque no habia mas humedos, no es un desvio de nadie.
   */
  cortasConMaterial: number;
};

/**
 * Como se esta aprovechando el horno.
 *
 * Las hornadas se reconstruyen agrupando entradas consecutivas separadas por
 * menos de 15 minutos: no se guarda un id de lote, pero una hornada se carga de
 * corrido, asi que el hueco temporal las separa bien.
 *
 * El dato que vuelve justa la medicion es `habiaEsperando`: se reconstruye el
 * estado historico mirando, para cada secadero, cual fue su ultimo movimiento
 * antes de la hornada. Si termino en `humedo`, estaba en la cola.
 */
export async function usoDelHorno(
  rango: Rango,
  capacidad: number,
): Promise<UsoDelHorno> {
  const filas = await db.execute<{
    inicio: string;
    usuario: string;
    secaderos: string;
    habia_esperando: string;
  }>(sql`
    with entradas as (
      select id, creado_en, usuario_nombre,
             case
               when lag(creado_en) over (order by creado_en) is null
                 or creado_en - lag(creado_en) over (order by creado_en)
                    > interval '15 minutes'
               then 1 else 0
             end as arranca
      from movimientos
      where tipo = 'entrada_horno'
        and creado_en >= ${rango.desde.toISOString()}::timestamptz
        and creado_en <= ${rango.hasta.toISOString()}::timestamptz
    ),
    agrupadas as (
      select *, sum(arranca) over (order by creado_en) as hornada from entradas
    ),
    hornadas as (
      select hornada,
             min(creado_en) as inicio,
             min(usuario_nombre) as usuario,
             count(*) as secaderos
      from agrupadas
      group by hornada
    )
    select h.inicio::text as inicio,
           h.usuario,
           h.secaderos::text as secaderos,
           (
             select count(*) from (
               select distinct on (m.secadero_id) m.estado_hasta
               from movimientos m
               where m.creado_en < h.inicio
               order by m.secadero_id, m.creado_en desc, m.id desc
             ) u where u.estado_hasta = 'humedo'
           )::text as habia_esperando
    from hornadas h
    order by h.inicio desc
    limit 60
  `);

  const hornadas: Hornada[] = [...filas].map((f) => ({
    inicio: new Date(f.inicio),
    usuario: f.usuario,
    secaderos: aNumero(f.secaderos),
    habiaEsperando: aNumero(f.habia_esperando),
  }));

  const total = hornadas.length;
  const completas = hornadas.filter((h) => h.secaderos >= capacidad).length;
  const cortasConMaterial = hornadas.filter(
    (h) => h.secaderos < capacidad && h.habiaEsperando > h.secaderos,
  ).length;

  return {
    hornadas,
    total,
    promedioSecaderos:
      total > 0 ? hornadas.reduce((a, h) => a + h.secaderos, 0) / total : 0,
    completas,
    cortasConMaterial,
  };
}

export type CicloContraObjetivo = {
  ciclos: number;
  cortos: number;
  largos: number;
  enObjetivo: number;
  promedioMin: number;
};

/** Cuantos ciclos de horno quedaron por debajo o por encima del objetivo. */
export async function ciclosContraObjetivo(
  rango: Rango,
  objetivoMin: number,
  tolerancia = 0.1,
): Promise<CicloContraObjetivo> {
  const filas = await db
    .select({ duracion: movimientos.duracionMin })
    .from(movimientos)
    .where(
      and(
        enRango(rango),
        eq(movimientos.tipo, "salida_horno"),
        isNotNull(movimientos.duracionMin),
      ),
    );

  const minimo = objetivoMin * (1 - tolerancia);
  const maximo = objetivoMin * (1 + tolerancia);

  let cortos = 0;
  let largos = 0;
  let suma = 0;
  for (const f of filas) {
    const d = f.duracion ?? 0;
    suma += d;
    if (d < minimo) cortos++;
    else if (d > maximo) largos++;
  }

  return {
    ciclos: filas.length,
    cortos,
    largos,
    enObjetivo: filas.length - cortos - largos,
    promedioMin: filas.length > 0 ? Math.round(suma / filas.length) : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Devoluciones al horno                                                      */
/* -------------------------------------------------------------------------- */

export type ResumenDevoluciones = {
  devoluciones: number;
  ciclosDevueltos: number;
  ciclosBuenos: number;
  promedioDevueltosMin: number;
  promedioBuenosMin: number;
  porProducto: { producto: string; veces: number }[];
};

/**
 * Devoluciones al horno y, sobre todo, cuanto duro el horneado que NO alcanzo.
 *
 * Para cada salida del horno se mira cual fue el movimiento siguiente de ese
 * secadero: si fue una devolucion, ese ciclo se quedo corto. Comparar el
 * promedio de los ciclos que fallaron contra el de los que salieron bien es lo
 * que da el tiempo minimo real de horno, que es el dato accionable.
 */
export async function resumenDevoluciones(
  rango: Rango,
): Promise<ResumenDevoluciones> {
  // Las fechas van como ISO con cast explicito: en una consulta cruda el driver
  // no serializa objetos Date y falla con ERR_INVALID_ARG_TYPE.
  const comparacion = await db.execute<{
    ciclos_devueltos: string;
    ciclos_buenos: string;
    prom_devueltos: string | null;
    prom_buenos: string | null;
  }>(sql`
    with secuencia as (
      select id, secadero_id, tipo, duracion_min, creado_en,
             lead(tipo) over (partition by secadero_id order by id) as siguiente
      from movimientos
    )
    select
      count(*) filter (where siguiente = 'devolucion_horno')::text as ciclos_devueltos,
      count(*) filter (where siguiente is distinct from 'devolucion_horno')::text as ciclos_buenos,
      avg(duracion_min) filter (where siguiente = 'devolucion_horno')::text as prom_devueltos,
      avg(duracion_min) filter (where siguiente is distinct from 'devolucion_horno')::text as prom_buenos
    from secuencia
    where tipo = 'salida_horno'
      and duracion_min is not null
      and creado_en >= ${rango.desde.toISOString()}::timestamptz
      and creado_en <= ${rango.hasta.toISOString()}::timestamptz
  `);

  const c = [...comparacion][0];

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(movimientos)
    .where(and(enRango(rango), eq(movimientos.tipo, "devolucion_horno")));

  const productos = await db
    .select({
      producto: movimientoLineas.productoNombre,
      veces: sql<string>`count(distinct ${movimientos.id})`,
    })
    .from(movimientos)
    .innerJoin(movimientoLineas, eq(movimientoLineas.movimientoId, movimientos.id))
    .where(and(enRango(rango), eq(movimientos.tipo, "devolucion_horno")))
    .groupBy(movimientoLineas.productoNombre)
    .orderBy(desc(sql`count(distinct ${movimientos.id})`))
    .limit(10);

  return {
    devoluciones: total,
    ciclosDevueltos: aNumero(c?.ciclos_devueltos ?? 0),
    ciclosBuenos: aNumero(c?.ciclos_buenos ?? 0),
    promedioDevueltosMin: Math.round(aNumero(c?.prom_devueltos ?? 0)),
    promedioBuenosMin: Math.round(aNumero(c?.prom_buenos ?? 0)),
    porProducto: productos.map((p) => ({
      producto: p.producto,
      veces: aNumero(p.veces),
    })),
  };
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

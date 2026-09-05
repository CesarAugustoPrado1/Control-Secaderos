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
  roturasCarrusel,
  tipos,
  type TipoMovimiento,
} from "./db/schema";
import { ETIQUETA_MOVIMIENTO } from "./estados";
import { finDeHoy } from "./rangos";

export type Rango = { desde: Date; hasta: Date };

/**
 * Los ultimos N dias. El corte de arriba es el fin del dia de hoy y no "ahora"
 * por la misma razon que en `rangos.ts`: el reloj de la base va adelantado
 * respecto del de la app, y cortar en "ahora" esconde lo que se acaba de
 * registrar.
 */
export function rangoDeDias(dias: number): Rango {
  const hasta = finDeHoy();
  const desde = new Date(hasta.getTime() - dias * 24 * 60 * 60 * 1000);
  return { desde, hasta };
}

const enRango = (r: Rango) =>
  and(gte(movimientos.creadoEn, r.desde), lte(movimientos.creadoEn, r.hasta));

const enRangoCarrusel = (r: Rango) =>
  and(
    gte(roturasCarrusel.creadoEn, r.desde),
    lte(roturasCarrusel.creadoEn, r.hasta),
  );

/** Etiqueta de la etapa previa al secadero, usada en los cortes de desperdicio. */
export const ETAPA_ANTES_DEL_SECADERO = "Antes del secadero";

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
 * `cargadas` es todo lo que el carrusel produjo: lo que entro a un secadero mas
 * lo que se rompio antes de entrar. Sin ese segundo termino el denominador del
 * porcentaje de rotura seria mas chico que la realidad y el indice saldria
 * favorecido justo por las placas que se perdieron.
 *
 * `rotas` suma las dos fuentes: lo que se rompio con la placa ya adentro de un
 * secadero (movimiento_lineas) y lo que se rompio en la linea, antes
 * (roturas_carrusel).
 */
export async function totales(rango: Rango): Promise<Totales> {
  const [[fila], [antes]] = await Promise.all([
    db
      .select({
        cargadas: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'carga'
          then ${movimientoLineas.cantidad} + ${movimientoLineas.desperdicio} else 0 end), 0)`,
        terminadas: sql<string>`coalesce(sum(case when ${movimientos.tipo} = 'descarga'
          then ${movimientoLineas.cantidad} else 0 end), 0)`,
        rotas: sql<string>`coalesce(sum(${movimientoLineas.desperdicio}), 0)`,
      })
      .from(movimientoLineas)
      .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
      .where(enRango(rango)),
    db
      .select({ placas: sum(roturasCarrusel.cantidad) })
      .from(roturasCarrusel)
      .where(enRangoCarrusel(rango)),
  ]);

  const rotasAntes = aNumero(antes?.placas ?? 0);

  return {
    cargadas: aNumero(fila?.cargadas ?? 0) + rotasAntes,
    terminadas: aNumero(fila?.terminadas ?? 0),
    rotas: aNumero(fila?.rotas ?? 0) + rotasAntes,
  };
}

/**
 * Motivos de rotura de las dos fuentes juntas.
 *
 * Los motivos salen de la misma tabla se rompa donde se rompa, asi que
 * mostrarlos separados obligaria a sumar de a dos paneles para saber cual es el
 * problema principal de la planta.
 */
export async function desperdicioPorMotivo(rango: Rango) {
  const [enCircuito, antes] = await Promise.all([
    db
      .select({
        motivo: sql<string>`coalesce(${movimientoLineas.motivoNombre}, 'Sin motivo')`,
        placas: sum(movimientoLineas.desperdicio),
      })
      .from(movimientoLineas)
      .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
      .where(and(enRango(rango), sql`${movimientoLineas.desperdicio} > 0`))
      .groupBy(sql`coalesce(${movimientoLineas.motivoNombre}, 'Sin motivo')`),
    db
      .select({
        motivo: sql<string>`coalesce(${roturasCarrusel.motivoNombre}, 'Sin motivo')`,
        placas: sum(roturasCarrusel.cantidad),
      })
      .from(roturasCarrusel)
      .where(enRangoCarrusel(rango))
      .groupBy(sql`coalesce(${roturasCarrusel.motivoNombre}, 'Sin motivo')`),
  ]);

  const total = new Map<string, number>();
  for (const f of [...enCircuito, ...antes]) {
    total.set(f.motivo, (total.get(f.motivo) ?? 0) + aNumero(f.placas));
  }

  return [...total.entries()]
    .map(([motivo, placas]) => ({ motivo, placas }))
    .sort((a, b) => b.placas - a.placas);
}

/**
 * En que paso del circuito se rompen las placas.
 *
 * "Antes del secadero" es una etapa mas, aunque no sea un movimiento: es donde
 * mas se rompe y dejarla afuera daria la impresion de que el problema esta en
 * el horno o en la descarga.
 */
export async function desperdicioPorEtapa(rango: Rango) {
  const [enCircuito, [antes]] = await Promise.all([
    db
      .select({
        tipo: movimientos.tipo,
        placas: sum(movimientoLineas.desperdicio),
      })
      .from(movimientoLineas)
      .innerJoin(movimientos, eq(movimientos.id, movimientoLineas.movimientoId))
      .where(and(enRango(rango), sql`${movimientoLineas.desperdicio} > 0`))
      .groupBy(movimientos.tipo),
    db
      .select({ placas: sum(roturasCarrusel.cantidad) })
      .from(roturasCarrusel)
      .where(enRangoCarrusel(rango)),
  ]);

  const filas = enCircuito.map((f) => ({
    etapa: ETIQUETA_MOVIMIENTO[f.tipo],
    placas: aNumero(f.placas),
  }));

  const rotasAntes = aNumero(antes?.placas ?? 0);
  if (rotasAntes > 0) {
    filas.push({ etapa: ETAPA_ANTES_DEL_SECADERO, placas: rotasAntes });
  }

  return filas.sort((a, b) => b.placas - a.placas);
}

export type FilaModelo = {
  modelo: string;
  cargadas: number;
  terminadas: number;
  rotas: number;
};

/**
 * Produccion y rotura por producto, con las dos fuentes sumadas: es la tabla
 * donde se responde "cuanto se rompe de este modelo", y esa respuesta seria
 * enganosa si dejara afuera lo que se rompe antes de entrar al secadero.
 */
export async function resumenPorModelo(rango: Rango): Promise<FilaModelo[]> {
  const [enCircuito, antes] = await Promise.all([
    db
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
      .groupBy(movimientoLineas.productoNombre),
    db
      .select({
        modelo: roturasCarrusel.productoNombre,
        placas: sum(roturasCarrusel.cantidad),
      })
      .from(roturasCarrusel)
      .where(enRangoCarrusel(rango))
      .groupBy(roturasCarrusel.productoNombre),
  ]);

  const porModelo = new Map<string, FilaModelo>();
  const asegurar = (modelo: string) => {
    let fila = porModelo.get(modelo);
    if (!fila) {
      fila = { modelo, cargadas: 0, terminadas: 0, rotas: 0 };
      porModelo.set(modelo, fila);
    }
    return fila;
  };

  for (const f of enCircuito) {
    const fila = asegurar(f.modelo);
    fila.cargadas += aNumero(f.cargadas);
    fila.terminadas += aNumero(f.terminadas);
    fila.rotas += aNumero(f.rotas);
  }
  // Rota antes de entrar cuenta como producida y como rota, igual que en el
  // total general: si no, el producto que mas se rompe en la linea aparece con
  // menos rotura que el que se rompe adentro.
  for (const f of antes) {
    const fila = asegurar(f.modelo);
    const placas = aNumero(f.placas);
    fila.cargadas += placas;
    fila.rotas += placas;
  }

  return [...porModelo.values()].sort((a, b) => b.cargadas - a.cargadas);
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
  /** Cargas evaluables, es decir las de tipos con tope fijo. */
  total: number;
  optimas: number;
  incompletas: number;
  mezcladas: number;
  /** Cargas dejadas afuera por ser de un tipo sin tope fijo. */
  sinNorma: number;
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
 *
 * La norma aplica SOLO a los tipos con tope fijo. Una carga de guarda o especial
 * no se puede evaluar: sin tope no hay "completa", y ahi llevar varios productos
 * es lo habitual. Se cuentan aparte en `sinNorma` en vez de descartarlas en
 * silencio, para que el porcentaje se lea sabiendo sobre cuantas cargas se
 * calculo. Meterlas al denominador hundiria el indicador con cargas correctas.
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

  let evaluables = 0;
  let sinNorma = 0;
  let optimas = 0;
  let incompletas = 0;
  let mezcladas = 0;
  const desvios: Adherencia["desvios"] = [];

  for (const f of filas) {
    if (f.capacidad === null) {
      sinNorma++;
      continue;
    }
    evaluables++;

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

  return { total: evaluables, optimas, incompletas, mezcladas, sinNorma, desvios };
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

/* -------------------------------------------------------------------------- */
/* Roturas del carrusel                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Cuanto se rompio antes del secadero, por modelo.
 *
 * Es la metrica que justifica registrar estas roturas: sin ella se sabe cuanto
 * se rompe adentro de un secadero -eso ya lo daba `movimiento_lineas`- pero no
 * cuanto se pierde en la linea, que es donde el carrusel puede hacer algo.
 */
export async function roturasCarruselPorProducto(rango: Rango) {
  const filas = await db
    .select({
      producto: roturasCarrusel.productoNombre,
      placas: sum(roturasCarrusel.cantidad),
      reportes: count(),
    })
    .from(roturasCarrusel)
    .where(
      and(
        gte(roturasCarrusel.creadoEn, rango.desde),
        lte(roturasCarrusel.creadoEn, rango.hasta),
      ),
    )
    .groupBy(roturasCarrusel.productoNombre)
    .orderBy(desc(sum(roturasCarrusel.cantidad)));

  return filas.map((f) => ({
    producto: f.producto,
    placas: aNumero(f.placas),
    reportes: Number(f.reportes),
  }));
}

/** Lo mismo agrupado por motivo: donde conviene intervenir. */
export async function roturasCarruselPorMotivo(rango: Rango) {
  const filas = await db
    .select({
      motivo: roturasCarrusel.motivoNombre,
      placas: sum(roturasCarrusel.cantidad),
      reportes: count(),
    })
    .from(roturasCarrusel)
    .where(
      and(
        gte(roturasCarrusel.creadoEn, rango.desde),
        lte(roturasCarrusel.creadoEn, rango.hasta),
      ),
    )
    .groupBy(roturasCarrusel.motivoNombre)
    .orderBy(desc(sum(roturasCarrusel.cantidad)));

  return filas.map((f) => ({
    motivo: f.motivo ?? "Sin motivo",
    placas: aNumero(f.placas),
    reportes: Number(f.reportes),
  }));
}

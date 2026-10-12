import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import type { Rol, TipoMovimiento, TipoPalet } from "./db/schema";
import type { Rango } from "./estadisticas";
import { ZONA_SQL } from "./rangos";

/*
 * Las estadisticas de una sola persona: lo que hizo ella, no la planta.
 *
 * Todo se filtra por `usuario_id`, que es quien hizo el trabajo. En una
 * correccion el movimiento nuevo hereda el autor del original (ver
 * `Reemplazo` en lib/acciones/motor.ts), asi que corregir una carga no se la
 * quita a quien la hizo ni se la pasa al admin que la arreglo.
 *
 * Solo cuentan los movimientos vigentes, igual que en el resto de las
 * estadisticas. Los anulados se cuentan aparte, como correcciones.
 */

const aNumero = (v: string | number | null | undefined) =>
  v == null ? 0 : Number(v);

const desde = (r: Rango) => r.desde.toISOString();
const hasta = (r: Rango) => r.hasta.toISOString();

export type MiFilaTipo = {
  tipo: TipoMovimiento;
  secaderos: number;
  placas: number;
  rotas: number;
};

/** Cuantos secaderos y placas movio, por tipo de movimiento. */
export async function misMovimientosPorTipo(
  uid: number,
  r: Rango,
): Promise<MiFilaTipo[]> {
  const filas = await db.execute<{
    tipo: TipoMovimiento;
    secaderos: string;
    placas: string;
    rotas: string;
  }>(sql`
    select m.tipo,
           count(distinct m.id)::text as secaderos,
           coalesce(sum(l.cantidad), 0)::text as placas,
           coalesce(sum(l.desperdicio), 0)::text as rotas
    from movimientos m
    left join movimiento_lineas l on l.movimiento_id = m.id
    where m.usuario_id = ${uid}
      -- Vigentes solamente: ver lib/vigencia.ts.
      and m.anulado_en is null
      and m.creado_en >= ${desde(r)}::timestamptz
      and m.creado_en <= ${hasta(r)}::timestamptz
    group by m.tipo
    order by count(distinct m.id) desc
  `);
  return [...filas].map((f) => ({
    tipo: f.tipo,
    secaderos: aNumero(f.secaderos),
    placas: aNumero(f.placas),
    rotas: aNumero(f.rotas),
  }));
}

/** Lo mismo abierto en el tiempo, por dia o por mes. */
export async function misMovimientosEnElTiempo(
  uid: number,
  r: Rango,
  paso: "dia" | "mes",
) {
  const formato = paso === "dia" ? "YYYY-MM-DD" : "YYYY-MM";
  const filas = await db.execute<{
    clave: string;
    secaderos: string;
    placas: string;
    rotas: string;
  }>(sql`
    select to_char(m.creado_en at time zone ${ZONA_SQL}, ${formato}) as clave,
           count(distinct m.id)::text as secaderos,
           coalesce(sum(l.cantidad), 0)::text as placas,
           coalesce(sum(l.desperdicio), 0)::text as rotas
    from movimientos m
    left join movimiento_lineas l on l.movimiento_id = m.id
    where m.usuario_id = ${uid}
      and m.anulado_en is null
      and m.creado_en >= ${desde(r)}::timestamptz
      and m.creado_en <= ${hasta(r)}::timestamptz
    group by 1
    order by 1
  `);
  return [...filas].map((f) => ({
    clave: f.clave,
    secaderos: aNumero(f.secaderos),
    placas: aNumero(f.placas),
    rotas: aNumero(f.rotas),
  }));
}

/** Placas por modelo y tipo de movimiento: que modelos trabajo y en que paso. */
export async function misPlacasPorModelo(uid: number, r: Rango) {
  const filas = await db.execute<{
    modelo: string;
    tipo: TipoMovimiento;
    placas: string;
  }>(sql`
    select l.producto_nombre as modelo,
           m.tipo,
           coalesce(sum(l.cantidad), 0)::text as placas
    from movimientos m
    join movimiento_lineas l on l.movimiento_id = m.id
    where m.usuario_id = ${uid}
      and m.anulado_en is null
      and m.creado_en >= ${desde(r)}::timestamptz
      and m.creado_en <= ${hasta(r)}::timestamptz
    group by 1, 2
  `);
  return [...filas].map((f) => ({
    modelo: f.modelo,
    tipo: f.tipo,
    placas: aNumero(f.placas),
  }));
}

/**
 * Las roturas que registro, por motivo: las de un movimiento suyo y las que
 * reporto en la linea del carrusel, antes del secadero.
 *
 * Es lo que la persona cargo, no necesariamente lo que rompio: quien descarga
 * un secadero registra lo que encuentra roto, se haya roto donde se haya roto.
 */
export async function misRoturasPorMotivo(uid: number, r: Rango) {
  const filas = await db.execute<{ motivo: string; placas: string }>(sql`
    select motivo, sum(placas)::text as placas from (
      select coalesce(l.motivo_nombre, 'Sin motivo') as motivo,
             l.desperdicio as placas
      from movimientos m
      join movimiento_lineas l on l.movimiento_id = m.id
      where m.usuario_id = ${uid}
        and m.anulado_en is null
        and l.desperdicio > 0
        and m.creado_en >= ${desde(r)}::timestamptz
        and m.creado_en <= ${hasta(r)}::timestamptz
      union all
      select coalesce(rc.motivo_nombre, 'Sin motivo'), rc.cantidad
      from roturas_carrusel rc
      where rc.usuario_id = ${uid}
        and rc.creado_en >= ${desde(r)}::timestamptz
        and rc.creado_en <= ${hasta(r)}::timestamptz
    ) t
    group by motivo
    order by sum(placas) desc
  `);
  return [...filas].map((f) => ({ motivo: f.motivo, placas: aNumero(f.placas) }));
}

/**
 * Palets que confirmo, por tipo. Los palets van por la fecha del plan, no por
 * la hora del registro (ver `paletsArmados`), asi que el filtro es por fecha.
 * Suma tambien los descuentos, que se guardan en negativo.
 */
export async function misPalets(
  uid: number,
  inicio: string,
  fin: string,
): Promise<Record<TipoPalet, number>> {
  const filas = await db.execute<{ tipo: TipoPalet; cantidad: string }>(sql`
    select tipo, coalesce(sum(cantidad), 0)::text as cantidad
    from palets_armados
    where usuario_id = ${uid}
      and fecha >= ${inicio}::date
      and fecha <= ${fin}::date
    group by tipo
  `);
  const total: Record<TipoPalet, number> = { estandar: 0, optimizado: 0 };
  for (const f of filas) total[f.tipo] = aNumero(f.cantidad);
  return total;
}

/**
 * Dias con al menos un movimiento suyo, y cuantos de sus movimientos se
 * anularon despues por estar mal cargados.
 */
export async function misDiasYCorrecciones(uid: number, r: Rango) {
  const [fila] = await db.execute<{ dias: string; corregidos: string }>(sql`
    select
      count(distinct to_char(creado_en at time zone ${ZONA_SQL}, 'YYYY-MM-DD'))
        filter (where anulado_en is null)::text as dias,
      count(*) filter (where anulado_en is not null)::text as corregidos
    from movimientos
    where usuario_id = ${uid}
      and creado_en >= ${desde(r)}::timestamptz
      and creado_en <= ${hasta(r)}::timestamptz
  `);
  return {
    dias: aNumero(fila?.dias),
    corregidos: aNumero(fila?.corregidos),
  };
}

export type ResumenOperario = {
  uid: number;
  nombre: string;
  rol: Rol;
  activo: boolean;
  secaderos: number;
  placas: number;
  /** Las mismas que "Roturas registradas" en su detalle: movimientos y linea. */
  rotas: number;
  dias: number;
  palets: number;
};

/**
 * Una fila por operario con lo que hizo en el periodo, para la vista del
 * admin. Aparecen todos los usuarios activos de los puestos de planta, aunque
 * no hayan hecho nada: un operario en cero tambien es un dato. Los inactivos y
 * los admin solo si trabajaron en el periodo.
 *
 * Los numeros salen igual que en `DetalleOperario`, asi la fila y el detalle
 * de cada uno coinciden.
 */
export async function resumenDeOperarios(
  r: Rango,
  inicio: string,
  fin: string,
): Promise<ResumenOperario[]> {
  const filas = await db.execute<{
    uid: number;
    nombre: string;
    rol: Rol;
    activo: boolean;
    secaderos: string;
    placas: string;
    rotas: string;
    dias: string;
    palets: string;
  }>(sql`
    with mov as (
      select m.usuario_id,
             count(distinct m.id) as secaderos,
             coalesce(sum(l.cantidad), 0) as placas,
             coalesce(sum(l.desperdicio), 0) as rotas,
             count(distinct to_char(m.creado_en at time zone ${ZONA_SQL}, 'YYYY-MM-DD')) as dias
      from movimientos m
      left join movimiento_lineas l on l.movimiento_id = m.id
      -- Vigentes solamente: ver lib/vigencia.ts.
      where m.anulado_en is null
        and m.creado_en >= ${desde(r)}::timestamptz
        and m.creado_en <= ${hasta(r)}::timestamptz
      group by m.usuario_id
    ),
    rc as (
      select usuario_id, sum(cantidad) as rotas
      from roturas_carrusel
      where creado_en >= ${desde(r)}::timestamptz
        and creado_en <= ${hasta(r)}::timestamptz
      group by usuario_id
    ),
    pal as (
      select usuario_id, sum(cantidad) as palets
      from palets_armados
      where fecha >= ${inicio}::date and fecha <= ${fin}::date
      group by usuario_id
    )
    select u.id as uid, u.nombre, u.rol, u.activo,
           coalesce(mov.secaderos, 0)::text as secaderos,
           coalesce(mov.placas, 0)::text as placas,
           (coalesce(mov.rotas, 0) + coalesce(rc.rotas, 0))::text as rotas,
           coalesce(mov.dias, 0)::text as dias,
           coalesce(pal.palets, 0)::text as palets
    from usuarios u
    left join mov on mov.usuario_id = u.id
    left join rc on rc.usuario_id = u.id
    left join pal on pal.usuario_id = u.id
    where (u.activo and u.rol in ('carrusel', 'llenado_manual', 'horno', 'paletizado'))
       or mov.usuario_id is not null
       or rc.usuario_id is not null
       or coalesce(pal.palets, 0) <> 0
    order by coalesce(mov.secaderos, 0) desc, u.nombre
  `);
  return [...filas].map((f) => ({
    uid: Number(f.uid),
    nombre: f.nombre,
    rol: f.rol,
    activo: f.activo,
    secaderos: aNumero(f.secaderos),
    placas: aNumero(f.placas),
    rotas: aNumero(f.rotas),
    dias: aNumero(f.dias),
    palets: aNumero(f.palets),
  }));
}

/** Nombre del usuario, para encabezar su detalle. null si no existe. */
export async function nombreDeUsuario(uid: number) {
  const [fila] = await db.execute<{ nombre: string; rol: Rol }>(sql`
    select nombre, rol from usuarios where id = ${uid}
  `);
  return fila ?? null;
}

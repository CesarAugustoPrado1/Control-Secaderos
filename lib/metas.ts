import "server-only";
import { and, desc, eq, gte, like, lt, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { config, movimientos, tipos, type Sector } from "./db/schema";
import { rangoDeFecha } from "./rangos";
import { vigente } from "./vigencia";

/*
 * La meta del dia: cuantos secaderos se quieren mover en cada sector, aparte
 * de lo que pide el plan modelo por modelo. Es el numero redondo que se mira
 * primero ("hoy 20 secaderos en el carrusel"), y contra el se compara tanto lo
 * programado como lo hecho.
 *
 * Se guarda en la tabla `config`, una fila por dia con clave
 * "meta-plan:YYYY-MM-DD" y un JSON {carrusel, paletizado}: son pocos numeros y
 * asi no hace falta tocar el esquema de la base.
 */

export type Metas = Record<Sector, number | null>;

const PREFIJO = "meta-plan:";
export const claveMeta = (fecha: string) => `${PREFIJO}${fecha}`;

const SIN_META: Metas = { carrusel: null, paletizado: null };

export function parsearMetas(valor: string | null | undefined): Metas {
  if (!valor) return { ...SIN_META };
  try {
    const v = JSON.parse(valor) as Partial<Record<Sector, unknown>>;
    const num = (x: unknown) =>
      typeof x === "number" && Number.isInteger(x) && x > 0 ? x : null;
    return { carrusel: num(v.carrusel), paletizado: num(v.paletizado) };
  } catch {
    return { ...SIN_META };
  }
}

/**
 * La meta de un dia y la que se sugiere si no tiene: la ultima fijada antes,
 * sector por sector, porque casi siempre se trabaja con la misma.
 */
export async function leerMetas(
  fecha: string,
): Promise<{ metas: Metas; sugeridas: Metas }> {
  const [propia, anteriores] = await Promise.all([
    db
      .select({ valor: config.valor })
      .from(config)
      .where(eq(config.clave, claveMeta(fecha)))
      .limit(1),
    // Las claves llevan la fecha en formato ISO: ordenarlas como texto es
    // ordenarlas por fecha.
    db
      .select({ valor: config.valor })
      .from(config)
      .where(and(like(config.clave, `${PREFIJO}%`), lt(config.clave, claveMeta(fecha))))
      .orderBy(desc(config.clave))
      .limit(60),
  ]);

  const sugeridas: Metas = { ...SIN_META };
  for (const fila of anteriores) {
    const m = parsearMetas(fila.valor);
    sugeridas.carrusel ??= m.carrusel;
    sugeridas.paletizado ??= m.paletizado;
    if (sugeridas.carrusel !== null && sugeridas.paletizado !== null) break;
  }

  return { metas: parsearMetas(propia[0]?.valor), sugeridas };
}

/**
 * Secaderos que de verdad movio cada sector ese dia, esten o no en el plan:
 * es lo que cuenta contra la meta. Un secadero con dos modelos cuenta una vez.
 * Sin los tipos de llenado manual, igual que el plan.
 */
export async function secaderosDelDia(fecha: string): Promise<Record<Sector, number>> {
  const { desde, hasta } = rangoDeFecha(fecha);
  const filas = await db
    .select({
      tipo: movimientos.tipo,
      n: sql<string>`count(distinct ${movimientos.id})`,
    })
    .from(movimientos)
    .leftJoin(tipos, eq(tipos.id, movimientos.secaderoTipoId))
    .where(
      and(
        gte(movimientos.creadoEn, desde),
        lte(movimientos.creadoEn, hasta),
        sql`${movimientos.tipo} in ('carga', 'descarga')`,
        sql`coalesce(${tipos.llenadoManual}, false) = false`,
        vigente(),
      ),
    )
    .groupBy(movimientos.tipo);

  const de = (t: string) => Number(filas.find((f) => f.tipo === t)?.n ?? 0);
  return { carrusel: de("carga"), paletizado: de("descarga") };
}

import "server-only";
import { and, eq, gte, inArray, lte, sql, sum } from "drizzle-orm";
import { db } from "./db";
import { movimientoLineas, movimientos, roturasCarrusel } from "./db/schema";
import { rangoDeFecha, ZONA_SQL } from "./rangos";
import { SECTORES, type SectorResumen } from "./sectores";

/**
 * Resumen de produccion de un dia, sector por sector.
 *
 * Es la vista del administrativo: no opera nada, necesita el numero del dia
 * cerrado. Cada sector muestra, por producto, cuantas placas paso y cuantas de
 * esas se rompieron ahi: "Laja 635 = 631 + 4 rotas".
 *
 * Que cuenta cada sector:
 *
 *  - Carrusel: las placas que metio en secaderos (`carga`) mas las que rompio
 *    en la linea sin llegar a entrar (`roturas_carrusel`). Las dos cosas
 *    salieron de la maquina, asi que las dos cuentan como procesadas.
 *
 *  - Horno: las placas que entrego secas (`salida_horno`) mas todo lo que se
 *    rompio en el horno, tanto al meter los secaderos como al sacarlos. Se
 *    suma el desperdicio de `entrada_horno` porque esa placa entro al horno y
 *    nunca llego a la salida: si se contara solo `salida_horno`, el horno
 *    figuraria procesando menos de lo que realmente manipulo.
 *
 *  - Paletizado: las placas que mando a producto terminado (`descarga`) mas
 *    las que rompio al descargar.
 *
 * Un secadero mixto cuenta para cada uno de los productos que lleva adentro,
 * igual que en la comparacion contra el plan.
 */

export type FilaProducto = {
  producto: string;
  /** Placas que siguieron viaje. */
  buenas: number;
  /** Placas rotas en este sector. */
  rotas: number;
  /** Procesadas = buenas + rotas. Es el numero grande de la linea. */
  total: number;
  /** Secaderos distintos en los que aparecio el producto. */
  secaderos: number;
};

export type ResumenSector = {
  sector: SectorResumen;
  productos: FilaProducto[];
  buenas: number;
  rotas: number;
  total: number;
  /**
   * Secaderos DISTINTOS que paso el sector.
   *
   * No es la suma de la columna de cada producto: un secadero mixto aparece en
   * la fila de cada producto que lleva adentro, asi que sumarlas daria mas
   * secaderos de los que hubo. Se cuenta aparte, sobre los movimientos.
   */
  secaderos: number;
};

export type ResumenDelDia = {
  fecha: string;
  sectores: ResumenSector[];
  hayMovimiento: boolean;
};

type Acumulado = { buenas: number; rotas: number; secaderos: number };

const nuevo = (): Acumulado => ({ buenas: 0, rotas: 0, secaderos: 0 });

export async function resumenDelDia(fecha: string): Promise<ResumenDelDia> {
  const { desde, hasta } = rangoDeFecha(fecha);

  const [porMovimiento, roturasLinea, secaderosPorSector] = await Promise.all([
    db
      .select({
        tipo: movimientos.tipo,
        producto: movimientoLineas.productoNombre,
        buenas: sum(movimientoLineas.cantidad),
        rotas: sum(movimientoLineas.desperdicio),
        secaderos: sql<string>`count(distinct ${movimientos.id})`,
      })
      .from(movimientoLineas)
      .innerJoin(
        movimientos,
        eq(movimientos.id, movimientoLineas.movimientoId),
      )
      .where(
        and(
          gte(movimientos.creadoEn, desde),
          lte(movimientos.creadoEn, hasta),
          inArray(movimientos.tipo, [
            "carga",
            "entrada_horno",
            "salida_horno",
            "descarga",
          ]),
        ),
      )
      .groupBy(movimientos.tipo, movimientoLineas.productoNombre),
    db
      .select({
        producto: roturasCarrusel.productoNombre,
        rotas: sum(roturasCarrusel.cantidad),
      })
      .from(roturasCarrusel)
      .where(
        and(
          gte(roturasCarrusel.creadoEn, desde),
          lte(roturasCarrusel.creadoEn, hasta),
        ),
      )
      .groupBy(roturasCarrusel.productoNombre),
    // Secaderos distintos por sector. Va en su propia consulta justamente para
    // no pasar por `movimiento_lineas`, que es lo que multiplica los mixtos.
    db
      .select({
        tipo: movimientos.tipo,
        secaderos: sql<string>`count(distinct ${movimientos.id})`,
      })
      .from(movimientos)
      .where(
        and(
          gte(movimientos.creadoEn, desde),
          lte(movimientos.creadoEn, hasta),
          inArray(movimientos.tipo, ["carga", "salida_horno", "descarga"]),
        ),
      )
      .groupBy(movimientos.tipo),
  ]);

  const porSector = new Map<SectorResumen, Map<string, Acumulado>>(
    SECTORES.map((s) => [s, new Map()]),
  );
  const asegurar = (sector: SectorResumen, producto: string) => {
    const mapa = porSector.get(sector)!;
    let fila = mapa.get(producto);
    if (!fila) {
      fila = nuevo();
      mapa.set(producto, fila);
    }
    return fila;
  };

  const aNumero = (v: string | number | null) => (v == null ? 0 : Number(v));

  for (const f of porMovimiento) {
    const buenas = aNumero(f.buenas);
    const rotas = aNumero(f.rotas);
    const secaderos = aNumero(f.secaderos);

    switch (f.tipo) {
      case "carga": {
        const fila = asegurar("carrusel", f.producto);
        fila.buenas += buenas;
        fila.secaderos += secaderos;
        break;
      }
      case "salida_horno": {
        const fila = asegurar("horno", f.producto);
        fila.buenas += buenas;
        fila.rotas += rotas;
        fila.secaderos += secaderos;
        break;
      }
      case "entrada_horno": {
        // Solo la rotura: las placas que entraron se cuentan cuando salen, y
        // sumar las dos cosas contaria dos veces la misma placa.
        const fila = asegurar("horno", f.producto);
        fila.rotas += rotas;
        break;
      }
      case "descarga": {
        const fila = asegurar("paletizado", f.producto);
        fila.buenas += buenas;
        fila.rotas += rotas;
        fila.secaderos += secaderos;
        break;
      }
    }
  }

  for (const f of roturasLinea) {
    // No suman secaderos: se rompieron antes de entrar a uno.
    asegurar("carrusel", f.producto).rotas += aNumero(f.rotas);
  }

  const MOVIMIENTO_DEL_SECTOR: Record<SectorResumen, string> = {
    carrusel: "carga",
    horno: "salida_horno",
    paletizado: "descarga",
  };
  const distintos = new Map(
    secaderosPorSector.map((f) => [f.tipo as string, Number(f.secaderos)]),
  );

  const sectores: ResumenSector[] = SECTORES.map((sector) => {
    const productos = [...porSector.get(sector)!.entries()]
      .map(([producto, a]) => ({
        producto,
        buenas: a.buenas,
        rotas: a.rotas,
        total: a.buenas + a.rotas,
        secaderos: a.secaderos,
      }))
      .filter((p) => p.total > 0 || p.secaderos > 0)
      .sort((a, b) => b.total - a.total || a.producto.localeCompare(b.producto));

    return {
      sector,
      productos,
      buenas: productos.reduce((a, p) => a + p.buenas, 0),
      rotas: productos.reduce((a, p) => a + p.rotas, 0),
      total: productos.reduce((a, p) => a + p.total, 0),
      secaderos: distintos.get(MOVIMIENTO_DEL_SECTOR[sector]) ?? 0,
    };
  });

  return {
    fecha,
    sectores,
    hayMovimiento: sectores.some((s) => s.productos.length > 0),
  };
}

/**
 * Los dias con actividad dentro de los ultimos `dias`, del mas nuevo al mas
 * viejo.
 *
 * Se listan solo los que tienen algo: en una planta que no trabaja los domingos,
 * ofrecer catorce botones de los cuales cinco estan vacios obliga a probar uno
 * por uno para encontrar el que sirve. La fecha se calcula en hora argentina,
 * que es la que define de que dia es un turno.
 */
export async function diasConMovimiento(dias = 14): Promise<string[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const filas = await db.execute<{ fecha: string }>(sql`
    select fecha::text as fecha from (
      select (creado_en at time zone ${ZONA_SQL})::date as fecha
        from movimientos where creado_en >= ${desde.toISOString()}::timestamptz
      union
      select (creado_en at time zone ${ZONA_SQL})::date as fecha
        from roturas_carrusel where creado_en >= ${desde.toISOString()}::timestamptz
    ) d
    group by fecha
    order by fecha desc
  `);

  return [...filas].map((f) => f.fecha);
}

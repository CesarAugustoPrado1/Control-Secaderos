import "server-only";
import { and, count, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { movimientos, paletsArmados } from "./db/schema";
import { produccionPorPuesto } from "./estadisticas";
import { cumplimientoDeFechas, type Avance } from "./plan";
import { etiquetaDia, rangoDeFecha } from "./rangos";
import { escaparHtml } from "./telegram";
import { vigente } from "./vigencia";

/**
 * El informe de cumplimiento de un dia, como mensaje de Telegram (HTML).
 *
 * Devuelve null si ese dia no se trabajo: ni un movimiento ni un palet. Un
 * dia sin trabajo no manda nada, en vez de un mensaje lleno de ceros que
 * acostumbra a no leerlo.
 */
export async function informeDelDia(fecha: string): Promise<string | null> {
  const rango = rangoDeFecha(fecha);

  const [[movs], [palets], cumplimiento, prod] = await Promise.all([
    db
      .select({ n: count() })
      .from(movimientos)
      .where(
        and(
          gte(movimientos.creadoEn, rango.desde),
          lte(movimientos.creadoEn, rango.hasta),
          vigente(),
        ),
      ),
    db
      .select({ n: sql<string>`coalesce(sum(${paletsArmados.cantidad}), 0)` })
      .from(paletsArmados)
      .where(eq(paletsArmados.fecha, fecha)),
    cumplimientoDeFechas([fecha], fecha),
    produccionPorPuesto(rango),
  ]);

  if (movs.n === 0 && Number(palets.n) === 0) return null;

  const car = cumplimiento.find((c) => c.sector === "carrusel");
  const pal = cumplimiento.find((c) => c.sector === "paletizado");
  const t = prod.totales;

  const lineas = [
    `<b>Informe de cumplimiento · ${escaparHtml(etiquetaDia(fecha))}</b>`,
    "",
    "<b>Plan del día</b>",
    renglon("Carrusel · secaderos", car?.secaderos),
    renglon("Paletizado · secaderos", pal?.secaderos),
    renglon("Paletizado · palets", pal?.palets),
    "",
    "<b>Producción</b>",
    `Carrusel: ${t.carrusel.secaderos} secaderos (${miles(t.carrusel.placas)} placas)`,
    `Horno: ${t.horno.secaderos} secaderos (${miles(t.horno.placas)} placas)`,
    `Paletizado: ${t.paletizado.secaderos} secaderos (${miles(t.paletizado.placas)} placas)`,
  ];
  if (t.manual_carga.secaderos > 0 || t.manual_descarga.secaderos > 0) {
    lineas.push(
      `Llenado manual: ${t.manual_carga.secaderos} cargados, ${t.manual_descarga.secaderos} descargados`,
    );
  }
  return lineas.join("\n");
}

const miles = (n: number) => n.toLocaleString("es-AR");

/**
 * Un renglon del plan. Sin plan o sin nada pedido de esa parte no hay
 * porcentaje que dar, y se dice asi en vez de mostrar un 0% que no es.
 */
function renglon(etiqueta: string, a: Avance | undefined): string {
  if (!a || a.pedidos === 0) return `▫️ ${etiqueta}: sin plan`;
  const pct = Math.round((a.hechos / a.pedidos) * 100);
  const marca = pct >= 100 ? "✅" : pct >= 50 ? "🟡" : "🔴";
  return `${marca} ${etiqueta}: ${pct}% (${a.hechos} de ${a.pedidos})`;
}

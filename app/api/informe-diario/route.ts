import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/auth";
import { informeDelDia } from "@/lib/informe";
import { esFecha, fechaLocal } from "@/lib/rangos";
import { enviarTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/**
 * El informe diario por Telegram. Lo llama el cron de Vercel a las 22 hs de
 * Argentina (ver vercel.json); no lo usa ninguna pantalla.
 *
 * Vercel manda `Authorization: Bearer <CRON_SECRET>`. Sin esa clave la ruta
 * no hace nada: si no, cualquiera que conociera la direccion podria llenarle
 * el Telegram al dueño.
 *
 * Para probar, tambien lo puede abrir el admin logueado desde el navegador,
 * que no puede mandar ese encabezado:
 *   /api/informe-diario?fecha=YYYY-MM-DD   manda el informe de ese dia
 *   ...&ver=1                              muestra el texto sin mandarlo
 */
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const esCron =
    !!secreto && req.headers.get("authorization") === `Bearer ${secreto}`;
  if (!esCron && (await sesionActual())?.rol !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pedida = req.nextUrl.searchParams.get("fecha") ?? undefined;
  const fecha = esFecha(pedida) ? pedida : fechaLocal();
  const texto = await informeDelDia(fecha);

  if (!texto) {
    return NextResponse.json({ fecha, enviado: false, motivo: "No se trabajó ese día" });
  }
  if (req.nextUrl.searchParams.get("ver") === "1") {
    return NextResponse.json({ fecha, enviado: false, texto });
  }

  try {
    await enviarTelegram(texto);
  } catch (e) {
    console.error("Informe diario:", e);
    return NextResponse.json(
      { fecha, enviado: false, error: (e as Error).message },
      { status: 502 },
    );
  }
  return NextResponse.json({ fecha, enviado: true });
}

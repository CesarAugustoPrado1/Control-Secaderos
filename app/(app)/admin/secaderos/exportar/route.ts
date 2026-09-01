import { autorizar } from "@/lib/auth";
import { todosLosSecaderos } from "@/lib/consultas";
import { ETIQUETA_ESTADO } from "@/lib/estados";
import {
  TIPO_XLSX,
  escribirPlanilla,
  nombreDeArchivo,
} from "@/lib/planilla";

export const dynamic = "force-dynamic";

/**
 * Baja la lista completa de secaderos como .xlsx.
 *
 * Las columnas Estado y Capacidad van de sola lectura: son utiles para mirar
 * la planilla, pero al importar se ignoran, porque el estado lo mueven los
 * operarios y la capacidad la define el tipo.
 */
export async function GET() {
  try {
    await autorizar("admin");
  } catch {
    return new Response("Sin permiso.", { status: 403 });
  }

  const filas = await todosLosSecaderos();

  const archivo = await escribirPlanilla(
    "Secaderos",
    [
      { encabezado: "Numero", ancho: 12 },
      { encabezado: "Tipo", ancho: 22 },
      { encabezado: "Activo", ancho: 10 },
      { encabezado: "Estado", ancho: 14 },
      { encabezado: "Capacidad", ancho: 12 },
    ],
    filas.map((s) => [
      s.numero,
      s.tipoNombre,
      s.activo ? "SI" : "NO",
      ETIQUETA_ESTADO[s.estado],
      s.capacidad,
    ]),
  );

  return new Response(archivo, {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${nombreDeArchivo("secaderos")}"`,
      "Cache-Control": "no-store",
    },
  });
}

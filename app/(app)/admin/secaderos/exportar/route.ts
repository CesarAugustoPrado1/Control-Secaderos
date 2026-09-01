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
 * El encabezado dice "Tipo de secadero" y no "Tipo" a proposito: abierta en
 * Excel, lejos de la app, una columna que dice "Grande" no aclara si eso
 * describe al secadero o a la placa que entra. La columna de placas al lado lo
 * termina de fijar.
 *
 * Estado y placas van de sola lectura: sirven para mirar la planilla, pero al
 * importar se ignoran, porque el estado lo mueven los operarios y la capacidad
 * la define el tipo.
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
      { encabezado: "Tipo de secadero", ancho: 20 },
      { encabezado: "Activo", ancho: 10 },
      { encabezado: "Placas que entran", ancho: 18 },
      { encabezado: "Estado", ancho: 14 },
    ],
    filas.map((s) => [
      s.numero,
      s.tipoNombre,
      s.activo ? "SI" : "NO",
      s.capacidad,
      ETIQUETA_ESTADO[s.estado],
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

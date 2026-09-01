import { autorizar } from "@/lib/auth";
import { todosLosProductos } from "@/lib/consultas";
import {
  TIPO_XLSX,
  escribirPlanilla,
  nombreDeArchivo,
} from "@/lib/planilla";

export const dynamic = "force-dynamic";

/** Baja la lista completa de productos como .xlsx, lista para reimportar. */
export async function GET() {
  try {
    await autorizar("admin");
  } catch {
    return new Response("Sin permiso.", { status: 403 });
  }

  const filas = await todosLosProductos();

  const archivo = await escribirPlanilla(
    "Productos",
    [
      { encabezado: "Nombre", ancho: 34 },
      { encabezado: "Tipo", ancho: 22 },
      { encabezado: "Activo", ancho: 10 },
    ],
    filas.map((p) => [p.nombre, p.tipoNombre, p.activo ? "SI" : "NO"]),
  );

  return new Response(archivo, {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${nombreDeArchivo("productos")}"`,
      "Cache-Control": "no-store",
    },
  });
}

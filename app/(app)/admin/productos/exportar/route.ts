import { autorizar } from "@/lib/auth";
import { todosLosProductos, todosLosTipos } from "@/lib/consultas";
import {
  TIPO_XLSX,
  escribirPlanilla,
  nombreDeArchivo,
} from "@/lib/planilla";

export const dynamic = "force-dynamic";

/**
 * Baja la lista completa de productos como .xlsx.
 *
 * "Tipo de secadero" y no "Tipo": en una planilla de productos, una columna
 * que dice "Grande" al lado de un nombre se lee como si el producto fuera
 * grande. Lo que dice en realidad es en que secadero entra, y la columna de
 * placas al lado lo hace evidente.
 */
export async function GET() {
  try {
    await autorizar("admin");
  } catch {
    return new Response("Sin permiso.", { status: 403 });
  }

  const [filas, tipos] = await Promise.all([
    todosLosProductos(),
    todosLosTipos(),
  ]);
  const capacidadPorTipo = new Map(tipos.map((t) => [t.id, t.capacidad]));

  const archivo = await escribirPlanilla(
    "Productos",
    [
      { encabezado: "Nombre", ancho: 34 },
      { encabezado: "Tipo de secadero", ancho: 20 },
      { encabezado: "Activo", ancho: 10 },
      { encabezado: "Placas que entran", ancho: 18 },
    ],
    filas.map((p) => [
      p.nombre,
      p.tipoNombre,
      p.activo ? "SI" : "NO",
      capacidadPorTipo.get(p.tipoId) ?? null,
    ]),
  );

  return new Response(archivo, {
    headers: {
      "Content-Type": TIPO_XLSX,
      "Content-Disposition": `attachment; filename="${nombreDeArchivo("productos")}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { requerirRol } from "@/lib/auth";
import { leerConfig } from "@/lib/consultas";
import { leerPeriodo } from "@/lib/periodos";
import { fechaLocal } from "@/lib/rangos";
import { Titulo } from "@/components/ui";
import { Horno } from "./horno";
import { Opciones } from "./piezas";
import { Produccion, type Unidad } from "./produccion";
import { Rendimiento } from "./rendimiento";
import { Roturas } from "./roturas";
import { SelectorPeriodo } from "./selector-periodo";

export const metadata = { title: "Estadísticas · Secaderos" };
export const dynamic = "force-dynamic";

/*
 * Las estadisticas van en categorias para que cada pregunta tenga su lugar:
 * "cuanto se hizo" no se mezcla con "cuanto se rompio". Ademas cada categoria
 * corre solo sus propias consultas, asi que abrir una no paga las de las demas.
 */
const CATEGORIAS = [
  { clave: "produccion", etiqueta: "Producción" },
  { clave: "rendimiento", etiqueta: "Rendimiento" },
  { clave: "roturas", etiqueta: "Roturas" },
  { clave: "horno", etiqueta: "Horno" },
] as const;

type Categoria = (typeof CATEGORIAS)[number]["clave"];

export default async function PaginaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{
    cat?: string;
    periodo?: string;
    fecha?: string;
    unidad?: string;
  }>;
}) {
  await requerirRol("admin", "auditor");
  const params = await searchParams;

  const hoy = fechaLocal();
  const periodo = leerPeriodo(params.periodo, params.fecha, hoy);
  const cat: Categoria =
    CATEGORIAS.find((c) => c.clave === params.cat)?.clave ?? "produccion";
  const unidad: Unidad = params.unidad === "secaderos" ? "secaderos" : "placas";

  // Cada link cambia una sola cosa y conserva el resto de lo que se esta
  // mirando: cambiar de categoria no vuelve al mes actual.
  const href = (cambios: Record<string, string>) => {
    const q = new URLSearchParams({
      cat,
      periodo: periodo.tipo,
      fecha: periodo.inicio,
      unidad,
      ...cambios,
    });
    return `/estadisticas?${q}`;
  };
  const consultaSinPeriodo = new URLSearchParams({ cat, unidad }).toString();

  return (
    <>
      <Titulo detalle={periodo.etiqueta}>Estadísticas</Titulo>

      <div className="mb-4">
        <Opciones
          opciones={CATEGORIAS.map((c) => ({
            href: href({ cat: c.clave }),
            etiqueta: c.etiqueta,
            activa: c.clave === cat,
          }))}
        />
      </div>

      <div className="tarjeta mb-6 p-4">
        <SelectorPeriodo
          tipo={periodo.tipo}
          inicio={periodo.inicio}
          anterior={periodo.anterior}
          siguiente={periodo.siguiente}
          etiqueta={periodo.etiqueta}
          enCurso={periodo.enCurso}
          hoy={hoy}
          consulta={consultaSinPeriodo}
        />
      </div>

      {cat === "produccion" && (
        <Produccion
          periodo={periodo}
          rango={periodo.rango}
          unidad={unidad}
          hrefUnidad={(u) => href({ unidad: u })}
        />
      )}
      {cat === "rendimiento" && <Rendimiento rango={periodo.rango} />}
      {cat === "roturas" && <Roturas rango={periodo.rango} />}
      {cat === "horno" && <Horno rango={periodo.rango} cfg={await leerConfig()} />}
    </>
  );
}

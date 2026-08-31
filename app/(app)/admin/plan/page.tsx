import { productosActivos } from "@/lib/consultas";
import { compararPlan, lineasDeSemana, planesDeFechas } from "@/lib/plan";
import type { Sector } from "@/lib/db/schema";
import { fechaLocal, semanaDesde } from "@/lib/rangos";
import { EditorPlan } from "./editor";
import { Semana } from "./semana";

export const metadata = { title: "Plan · Administración" };
export const dynamic = "force-dynamic";

const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esSector = (v?: string): v is Sector =>
  v === "carrusel" || v === "paletizado";

export default async function PaginaAdminPlan({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; dia?: string; sector?: string }>;
}) {
  const { desde, dia, sector } = await searchParams;
  const hoy = fechaLocal();
  const inicio = esFecha(desde) ? desde! : hoy;
  const fechas = semanaDesde(inicio);

  const diaElegido = esFecha(dia) ? dia! : null;
  const sectorElegido: Sector = esSector(sector) ? sector : "carrusel";

  const [productos, resumen, comparacion, semanaDelSector] = await Promise.all([
    productosActivos(),
    planesDeFechas(fechas),
    diaElegido ? compararPlan(diaElegido, sectorElegido) : Promise.resolve(null),
    lineasDeSemana(fechas, sectorElegido),
  ]);

  return (
    <div className="space-y-5">
      <Semana
        inicio={inicio}
        fechas={fechas}
        hoy={hoy}
        resumen={resumen}
        diaElegido={diaElegido}
        sectorElegido={sectorElegido}
      />

      {comparacion && (
        <EditorPlan
          key={`${diaElegido}-${sectorElegido}`}
          fecha={diaElegido!}
          sector={sectorElegido}
          esPasado={diaElegido! < hoy}
          productos={productos.map((p) => ({ id: p.id, nombre: p.nombre }))}
          comparacion={comparacion}
          semana={fechas}
          lineasSemana={semanaDelSector}
        />
      )}
    </div>
  );
}

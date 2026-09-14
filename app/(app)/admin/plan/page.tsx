import { productosActivos } from "@/lib/consultas";
import {
  compararPlan,
  lineasDeSemana,
  notasDelHorno,
  notasHornoDeFechas,
  planesDeFechas,
} from "@/lib/plan";
import type { Sector } from "@/lib/db/schema";
import { fechaLocal, semanaDesde } from "@/lib/rangos";
import { EditorNotasHorno } from "./notas-horno";
import { EditorPlan } from "./editor";
import { Semana, type Fila } from "./semana";

export const metadata = { title: "Plan · Administración" };
export const dynamic = "force-dynamic";

const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esFila = (v?: string): v is Fila =>
  v === "carrusel" || v === "paletizado" || v === "horno";

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
  const filaElegida: Fila = esFila(sector) ? sector : "carrusel";
  // El horno no tiene plan, solo notas. Para las consultas del plan se usa
  // carrusel, que igual no se muestra mientras el horno este elegido.
  const esHorno = filaElegida === "horno";
  const sectorElegido: Sector = esHorno ? "carrusel" : filaElegida;

  const [productos, resumen, notasSemana, comparacion, semanaDelSector, notas] =
    await Promise.all([
      productosActivos(),
      planesDeFechas(fechas),
      notasHornoDeFechas(fechas),
      diaElegido && !esHorno
        ? compararPlan(diaElegido, sectorElegido)
        : Promise.resolve(null),
      lineasDeSemana(fechas, sectorElegido),
      diaElegido && esHorno
        ? notasDelHorno(diaElegido)
        : Promise.resolve(null),
    ]);

  return (
    <div className="space-y-5">
      <Semana
        inicio={inicio}
        fechas={fechas}
        hoy={hoy}
        resumen={resumen}
        notasHorno={notasSemana.map((n) => n.fecha)}
        diaElegido={diaElegido}
        filaElegida={filaElegida}
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

      {notas && (
        <EditorNotasHorno
          key={`${diaElegido}-horno`}
          fecha={diaElegido!}
          carga={notas.carga}
          descarga={notas.descarga}
          semana={fechas}
          notasSemana={notasSemana}
        />
      )}
    </div>
  );
}

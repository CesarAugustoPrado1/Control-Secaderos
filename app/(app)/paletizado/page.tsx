import { requerirRol } from "@/lib/auth";
import { listarMovimientos, secaderosConContenido } from "@/lib/consultas";
import {
  compararPlan,
  entregadosPorElHorno,
  motivosDesvioActivos,
} from "@/lib/plan";
import {
  esFecha,
  etiquetaRelativa,
  fechaLocal,
  rangoDeFecha,
} from "@/lib/rangos";
import { Actividad } from "@/components/actividad";
import { PlanDelDia } from "@/components/plan-del-dia";
import { aBuscable } from "@/lib/buscables";
import { BuscadorAccion } from "@/components/buscador-accion";
import { SelectorDia } from "@/components/selector-dia";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Descargar · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaPaletizado({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const sesion = await requerirRol("paletizado", "admin");
  const { dia } = await searchParams;
  const hoy = fechaLocal();
  const fecha = esFecha(dia) ? dia : hoy;
  const { desde, hasta } = rangoDeFecha(fecha);
  const esFuturo = fecha > hoy;

  const [secaderos, descargas, plan, motivosDesvio, entregados] =
    await Promise.all([
      secaderosConContenido(),
      listarMovimientos({
        tipo: "descarga",
        llenadoManual: false,
        desde,
        hasta,
        porPagina: 200,
        orden: "asc",
      }),
      compararPlan(fecha, "paletizado"),
      motivosDesvioActivos(),
      entregadosPorElHorno(fecha),
    ]);

  return (
    <div className="space-y-6">
      <Titulo detalle="Escribí el número del secadero que vas a descargar">
        Descargar
      </Titulo>

      <SelectorDia rutaBase="/paletizado" fecha={fecha} hoy={hoy} />

      <PlanDelDia
        fecha={fecha}
        hoy={hoy}
        comparacion={plan}
        motivos={motivosDesvio.map((m) => ({ id: m.id, nombre: m.nombre }))}
        entregadosPorHorno={entregados}
        puedeExplicar={sesion.rol !== "auditor"}
      />

      {/* Las guardas las descarga el mismo operario que las llenó, desde
          /llenado-manual. Acá no se ven, ni siquiera como ocupadas. */}
      <BuscadorAccion
        secaderos={secaderos.filter((s) => !s.llenadoManual).map(aBuscable)}
        estadoObjetivo="seco"
        hrefBase="/paletizado"
        verbo="Descargar"
        etiquetaDisponibles="secaderos secos esperando"
      />

      {!esFuturo && (
        <Actividad
          titulo="Descargado"
          dia={etiquetaRelativa(fecha, hoy)}
          movimientos={descargas.items}
          vacio={
            fecha === hoy
              ? "Todavía no se descargó ningún secadero hoy."
              : "Ese día no se descargó ningún secadero."
          }
        />
      )}
    </div>
  );
}

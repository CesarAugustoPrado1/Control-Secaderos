import { requerirRol } from "@/lib/auth";
import { listarMovimientos, secaderosConContenido } from "@/lib/consultas";
import {
  compararPlan,
  entregadosPorElHorno,
  motivosDesvioActivos,
} from "@/lib/plan";
import {
  esClaveRango,
  fechaLocal,
  rangoPorClave,
  type ClaveRango,
} from "@/lib/rangos";
import { Actividad } from "@/components/actividad";
import { PlanDelDia } from "@/components/plan-del-dia";
import { BuscadorAccion } from "@/components/buscador-accion";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Descargar · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaPaletizado({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const sesion = await requerirRol("paletizado", "llenado_manual", "admin");
  const { rango: rangoParam } = await searchParams;
  const rango: ClaveRango = esClaveRango(rangoParam) ? rangoParam : "hoy";
  const { desde, hasta } = rangoPorClave(rango);

  const hoy = fechaLocal();
  const [secaderos, descargas, plan, motivosDesvio, entregados] =
    await Promise.all([
      secaderosConContenido(),
      listarMovimientos({
        tipo: "descarga",
        desde,
        hasta,
        porPagina: 200,
        orden: "asc",
      }),
      compararPlan(hoy, "paletizado"),
      motivosDesvioActivos(),
      entregadosPorElHorno(hoy),
    ]);

  return (
    <div className="space-y-6">
      <Titulo detalle="Escribí el número del secadero que vas a descargar">
        Descargar
      </Titulo>

      <PlanDelDia
        comparacion={plan}
        motivos={motivosDesvio.map((m) => ({ id: m.id, nombre: m.nombre }))}
        entregadosPorHorno={entregados}
        puedeExplicar={sesion.rol !== "auditor"}
      />

      <BuscadorAccion
        secaderos={secaderos.map((s) => ({
          id: s.id,
          numero: s.numero,
          tipoNombre: s.tipoNombre,
          capacidad: s.capacidad,
          estado: s.estado,
          estadoDesde: s.estadoDesde.toISOString(),
          total: s.total,
          contenido: s.contenido.map((c) => c.nombre).join(", "),
          productos: s.contenido.length,
        }))}
        estadoObjetivo="seco"
        hrefBase="/paletizado"
        verbo="Descargar"
        etiquetaDisponibles="secaderos secos esperando"
      />

      <Actividad
        titulo="Descargado"
        movimientos={descargas.items}
        rango={rango}
        rutaBase="/paletizado"
        vacio="Todavía no se descargó ningún secadero en este período."
      />
    </div>
  );
}

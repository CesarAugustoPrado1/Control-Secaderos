import { requerirRol } from "@/lib/auth";
import {
  listarMovimientos,
  motivosActivos,
  productosActivos,
  roturasDeCarrusel,
  secaderosConContenido,
} from "@/lib/consultas";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { compararPlan, motivosDesvioActivos } from "@/lib/plan";
import {
  ETIQUETA_RANGO,
  esClaveRango,
  fechaLocal,
  rangoPorClave,
  type ClaveRango,
} from "@/lib/rangos";
import { Actividad } from "@/components/actividad";
import { PlanDelDia } from "@/components/plan-del-dia";
import { BuscadorAccion } from "@/components/buscador-accion";
import { RoturasCarrusel } from "@/components/roturas-carrusel";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Cargar · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaCarrusel({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const sesion = await requerirRol("carrusel", "llenado_manual", "admin");
  const { rango: rangoParam } = await searchParams;
  const rango: ClaveRango = esClaveRango(rangoParam) ? rangoParam : "hoy";
  const { desde, hasta } = rangoPorClave(rango);

  const hoy = fechaLocal();
  const [secaderos, cargas, plan, motivosDesvio, productos, motivos, roturas] =
    await Promise.all([
      secaderosConContenido(),
      listarMovimientos({
        tipo: "carga",
        desde,
        hasta,
        porPagina: 200,
        orden: "asc",
      }),
      compararPlan(hoy, "carrusel"),
      motivosDesvioActivos(),
      productosActivos(),
      motivosActivos(),
      roturasDeCarrusel(desde, hasta),
    ]);

  const sector =
    sesion.rol === "llenado_manual" || sesion.rol === "carrusel"
      ? ETIQUETA_ROL[sesion.rol]
      : "Cargar secaderos";

  return (
    <div className="space-y-6">
      <Titulo detalle="Escribí el número del secadero que vas a cargar">
        {sector}
      </Titulo>

      <PlanDelDia
        comparacion={plan}
        motivos={motivosDesvio.map((m) => ({ id: m.id, nombre: m.nombre }))}
        puedeExplicar={sesion.rol !== "auditor"}
      />

      <BuscadorAccion
        secaderos={secaderos.map((s) => ({
          id: s.id,
          numero: s.numero,
          tipoId: s.tipoId,
          tipoNombre: s.tipoNombre,
          capacidad: s.capacidad,
          estado: s.estado,
          estadoDesde: s.estadoDesde.toISOString(),
          total: s.total,
          contenido: s.contenido.map((c) => c.nombre).join(", "),
          productos: s.contenido.length,
        }))}
        estadoObjetivo="vacio"
        hrefBase="/carrusel"
        verbo="Cargar"
        etiquetaDisponibles="secaderos vacíos disponibles"
      />

      <RoturasCarrusel
        productos={productos.map((p) => ({ id: p.id, nombre: p.nombre }))}
        motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
        roturas={roturas.map((r) => ({
          ...r,
          creadoEn: r.creadoEn.toISOString(),
        }))}
        puedeCargar={sesion.rol !== "auditor"}
        puedeBorrar={sesion.rol === "admin"}
        etiquetaRango={ETIQUETA_RANGO[rango].toLowerCase()}
      />

      <Actividad
        titulo="Cargado"
        movimientos={cargas.items}
        rango={rango}
        rutaBase="/carrusel"
        vacio="Todavía no se cargó ningún secadero en este período."
      />
    </div>
  );
}

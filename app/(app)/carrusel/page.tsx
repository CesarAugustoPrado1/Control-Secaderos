import { requerirRol } from "@/lib/auth";
import {
  consumoDeYeso,
  listarMovimientos,
  motivosActivos,
  productosActivos,
  roturasDeCarrusel,
  secaderosConContenido,
} from "@/lib/consultas";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { compararPlan, motivosDesvioActivos } from "@/lib/plan";
import {
  esFecha,
  etiquetaRelativa,
  fechaLocal,
  rangoDeFecha,
} from "@/lib/rangos";
import { Actividad } from "@/components/actividad";
import { PlanDelDia } from "@/components/plan-del-dia";
import { BuscadorAccion } from "@/components/buscador-accion";
import { RoturasCarrusel } from "@/components/roturas-carrusel";
import { SelectorDia } from "@/components/selector-dia";
import { YesoCarrusel } from "@/components/yeso-carrusel";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Cargar · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaCarrusel({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const sesion = await requerirRol("carrusel", "llenado_manual", "admin");
  const { dia } = await searchParams;
  const hoy = fechaLocal();
  const fecha = esFecha(dia) ? dia : hoy;
  const { desde, hasta } = rangoDeFecha(fecha);
  const etiqueta = etiquetaRelativa(fecha, hoy);
  // Un dia que no llego no tiene nada registrado: mostrar roturas, yeso y
  // cargas vacias solo empuja el plan, que es lo que se vino a ver.
  const esFuturo = fecha > hoy;

  const [
    secaderos,
    cargas,
    plan,
    motivosDesvio,
    productos,
    motivos,
    roturas,
    yeso,
  ] = await Promise.all([
    secaderosConContenido(),
    listarMovimientos({
      tipo: "carga",
      desde,
      hasta,
      porPagina: 200,
      orden: "asc",
    }),
    compararPlan(fecha, "carrusel"),
    motivosDesvioActivos(),
    productosActivos(),
    motivosActivos(),
    roturasDeCarrusel(desde, hasta),
    consumoDeYeso(desde, hasta),
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

      <SelectorDia rutaBase="/carrusel" fecha={fecha} hoy={hoy} />

      <PlanDelDia
        fecha={fecha}
        hoy={hoy}
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

      {!esFuturo && (
        <>
          {/* Fuera de hoy se ve pero no se carga: lo registrado queda con la
              hora de ahora, asi que no apareceria en la lista del dia mirado. */}
          <RoturasCarrusel
            productos={productos.map((p) => ({ id: p.id, nombre: p.nombre }))}
            motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
            roturas={roturas.map((r) => ({
              ...r,
              creadoEn: r.creadoEn.toISOString(),
            }))}
            puedeCargar={sesion.rol !== "auditor" && fecha === hoy}
            puedeBorrar={sesion.rol === "admin"}
            etiquetaRango={etiqueta.toLowerCase()}
          />

          <YesoCarrusel
            registros={yeso.map((r) => ({
              ...r,
              creadoEn: r.creadoEn.toISOString(),
            }))}
            puedeCargar={sesion.rol !== "auditor" && fecha === hoy}
            puedeBorrar={sesion.rol === "admin"}
            etiquetaRango={etiqueta.toLowerCase()}
          />

          <Actividad
            titulo="Cargado"
            dia={etiqueta}
            movimientos={cargas.items}
            vacio={
              fecha === hoy
                ? "Todavía no se cargó ningún secadero hoy."
                : "Ese día no se cargó ningún secadero."
            }
          />
        </>
      )}
    </div>
  );
}

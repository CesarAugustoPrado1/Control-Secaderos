import { requerirRol } from "@/lib/auth";
import {
  consumoDeYeso,
  listarMovimientos,
  motivosActivos,
  productosDelCircuito,
  roturasDeCarrusel,
  secaderosConContenido,
} from "@/lib/consultas";
import { compararPlan, motivosDesvioActivos } from "@/lib/plan";
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
  const sesion = await requerirRol("carrusel", "admin");
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
      llenadoManual: false,
      desde,
      hasta,
      porPagina: 200,
      orden: "asc",
    }),
    compararPlan(fecha, "carrusel"),
    motivosDesvioActivos(),
    productosDelCircuito(false),
    motivosActivos(),
    roturasDeCarrusel(desde, hasta),
    consumoDeYeso(desde, hasta),
  ]);

  return (
    <div className="space-y-6">
      <Titulo detalle="Escribí el número del secadero que vas a cargar">
        Carrusel
      </Titulo>

      <SelectorDia rutaBase="/carrusel" fecha={fecha} hoy={hoy} />

      <PlanDelDia
        fecha={fecha}
        hoy={hoy}
        comparacion={plan}
        motivos={motivosDesvio.map((m) => ({ id: m.id, nombre: m.nombre }))}
        puedeExplicar={sesion.rol !== "auditor"}
      />

      {/* Las guardas no las carga el carrusel: las llena a mano su propio
          operario desde /llenado-manual, y por eso no aparecen ni siquiera
          como ocupadas. */}
      <BuscadorAccion
        secaderos={secaderos.filter((s) => !s.llenadoManual).map(aBuscable)}
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

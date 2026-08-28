import { requerirRol } from "@/lib/auth";
import { listarMovimientos, secaderosConContenido } from "@/lib/consultas";
import { esClaveRango, rangoPorClave, type ClaveRango } from "@/lib/rangos";
import { Actividad } from "@/components/actividad";
import { BuscadorAccion } from "@/components/buscador-accion";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Descargar · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaPaletizado({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string }>;
}) {
  await requerirRol("paletizado", "llenado_manual", "admin");
  const { rango: rangoParam } = await searchParams;
  const rango: ClaveRango = esClaveRango(rangoParam) ? rangoParam : "hoy";
  const { desde, hasta } = rangoPorClave(rango);

  const [secaderos, descargas] = await Promise.all([
    secaderosConContenido(),
    listarMovimientos({
      tipo: "descarga",
      desde,
      hasta,
      porPagina: 200,
      orden: "asc",
    }),
  ]);

  return (
    <div className="space-y-6">
      <Titulo detalle="Escribí el número del secadero que vas a descargar">
        Descargar
      </Titulo>

      <BuscadorAccion
        secaderos={secaderos.map((s) => ({
          id: s.id,
          numero: s.numero,
          tipoNombre: s.tipoNombre,
          estado: s.estado,
          estadoDesde: s.estadoDesde.toISOString(),
          total: s.total,
          contenido: s.contenido.map((c) => c.nombre).join(", "),
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

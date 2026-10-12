import { requerirRol } from "@/lib/auth";
import { leerPeriodo } from "@/lib/periodos";
import { fechaLocal } from "@/lib/rangos";
import { Titulo } from "@/components/ui";
import { SelectorPeriodo } from "../estadisticas/selector-periodo";
import { DetalleOperario } from "./detalle";

export const metadata = { title: "Mis estadísticas · Secaderos" };
export const dynamic = "force-dynamic";

/**
 * Lo que hizo la persona logueada: sus movimientos, sus placas, las roturas
 * que registro y los palets que armo. No ve el trabajo de nadie mas; el admin
 * ve el de cada uno en "Estadisticas operarios".
 */
export default async function PaginaMisEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; fecha?: string }>;
}) {
  const sesion = await requerirRol(
    "carrusel",
    "llenado_manual",
    "horno",
    "paletizado",
    "admin",
  );
  const params = await searchParams;

  const hoy = fechaLocal();
  // Por defecto la semana: es lo que un operario mira para saber como viene.
  const periodo = leerPeriodo(params.periodo ?? "semana", params.fecha, hoy);

  return (
    <>
      <Titulo detalle={`${sesion.nombre} · ${periodo.etiqueta}`}>
        Mis estadísticas
      </Titulo>

      <div className="tarjeta mb-6 p-4">
        <SelectorPeriodo
          ruta="/mis-estadisticas"
          tipo={periodo.tipo}
          inicio={periodo.inicio}
          anterior={periodo.anterior}
          siguiente={periodo.siguiente}
          etiqueta={periodo.etiqueta}
          enCurso={periodo.enCurso}
          hoy={hoy}
          consulta=""
        />
      </div>

      <DetalleOperario uid={sesion.uid} periodo={periodo} propio />
    </>
  );
}

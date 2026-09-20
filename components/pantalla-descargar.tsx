import Link from "next/link";
import { notFound } from "next/navigation";
import { motivosActivos, secaderoPorId } from "@/lib/consultas";
import { duracion, minutosDesde } from "@/lib/formato";
import { Aviso } from "@/components/ui";
import { FormularioDescarga } from "@/components/formulario-descarga";

/**
 * La pantalla de descargar un secadero, compartida por paletizado y el llenado
 * manual. Mismo criterio que `PantallaCargar`: una sola operacion, dos puestos,
 * y lo unico propio de cada uno es a donde vuelve.
 */
export async function PantallaDescargar({
  id,
  volverA,
}: {
  id: string;
  volverA: string;
}) {
  const secadero = await secaderoPorId(Number(id));
  if (!secadero) notFound();

  const motivos = await motivosActivos();

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href={volverA}
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500"
      >
        ← Volver
      </Link>

      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">
          Descargar secadero {secadero.numero}
        </h1>
        <p className="text-sm text-slate-500">
          {secadero.tipoNombre} · seco hace{" "}
          {duracion(minutosDesde(secadero.estadoDesde))}
        </p>
      </div>

      {secadero.estado !== "seco" ? (
        <Aviso>
          Este secadero ya no está seco. Alguien lo movió mientras tenías la
          pantalla abierta.
        </Aviso>
      ) : secadero.contenido.length === 0 ? (
        <Aviso>
          El secadero figura sin placas. Avisale al administrador para que lo
          corrija.
        </Aviso>
      ) : (
        <FormularioDescarga
          secaderoId={secadero.id}
          secaderoNumero={secadero.numero}
          contenido={secadero.contenido}
          motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
          volverA={volverA}
        />
      )}
    </div>
  );
}

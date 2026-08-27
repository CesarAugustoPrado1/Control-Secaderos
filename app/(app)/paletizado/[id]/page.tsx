import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import { motivosActivos, secaderoPorId } from "@/lib/consultas";
import { ETIQUETA_TAMANO } from "@/lib/estados";
import { duracion, minutosDesde } from "@/lib/formato";
import { Aviso } from "@/components/ui";
import { FormularioDescarga } from "./formulario";

export default async function PaginaDescargar({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirRol("paletizado", "admin");
  const { id } = await params;

  const secadero = await secaderoPorId(Number(id));
  if (!secadero) notFound();

  const motivos = await motivosActivos();

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/paletizado"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500"
      >
        ← Volver
      </Link>

      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">
          Descargar secadero {secadero.numero}
        </h1>
        <p className="text-sm text-slate-500">
          Placa {ETIQUETA_TAMANO[secadero.tamano].toLowerCase()} · seco hace{" "}
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
        />
      )}
    </div>
  );
}

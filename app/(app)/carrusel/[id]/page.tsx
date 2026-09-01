import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import { productosActivos, secaderoPorId } from "@/lib/consultas";
import { Aviso } from "@/components/ui";
import { FormularioCarga } from "./formulario";

export default async function PaginaCargar({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirRol("carrusel", "llenado_manual", "admin");
  const { id } = await params;

  const secadero = await secaderoPorId(Number(id));
  if (!secadero) notFound();

  const modelos = await productosActivos(secadero.tipoId);

  return (
    <div className="mx-auto max-w-lg">
      <Link
        href="/carrusel"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500"
      >
        ← Volver
      </Link>

      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">
          Cargar secadero {secadero.numero}
        </h1>
        <p className="text-sm text-slate-500">
          {secadero.tipoNombre} · hasta {secadero.capacidad} placas
        </p>
      </div>

      {secadero.estado !== "vacio" ? (
        <Aviso>
          Este secadero ya no está vacío. Alguien lo cargó mientras tenías la
          pantalla abierta.
        </Aviso>
      ) : modelos.length === 0 ? (
        <Aviso tono="info">
          No hay productos habilitados para el tipo {secadero.tipoNombre}.
          Pedile al administrador que cargue alguno.
        </Aviso>
      ) : (
        <FormularioCarga
          secaderoId={secadero.id}
          secaderoNumero={secadero.numero}
          capacidad={secadero.capacidad}
          modelos={modelos.map((m) => ({ id: m.id, nombre: m.nombre }))}
        />
      )}
    </div>
  );
}

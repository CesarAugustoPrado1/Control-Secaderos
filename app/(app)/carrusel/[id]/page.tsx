import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import { capacidadDe } from "@/lib/configuracion";
import {
  leerConfig,
  motivosActivos,
  productosActivos,
  secaderoPorId,
} from "@/lib/consultas";
import { ETIQUETA_TAMANO } from "@/lib/estados";
import { Aviso } from "@/components/ui";
import { FormularioCarga } from "./formulario";

export default async function PaginaCargar({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirRol("carrusel", "admin");
  const { id } = await params;

  const secadero = await secaderoPorId(Number(id));
  if (!secadero) notFound();

  const [cfg, modelos, motivos] = await Promise.all([
    leerConfig(),
    productosActivos(secadero.tamano),
    motivosActivos(),
  ]);

  const capacidad = capacidadDe(cfg, secadero.tamano);

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
          Placa {ETIQUETA_TAMANO[secadero.tamano].toLowerCase()} · hasta{" "}
          {capacidad} placas
        </p>
      </div>

      {secadero.estado !== "vacio" ? (
        <Aviso>
          Este secadero ya no está vacío. Alguien lo cargó mientras tenías la
          pantalla abierta.
        </Aviso>
      ) : modelos.length === 0 ? (
        <Aviso tono="info">
          No hay modelos de placa {ETIQUETA_TAMANO[secadero.tamano].toLowerCase()}{" "}
          habilitados. Pedile al administrador que cargue alguno.
        </Aviso>
      ) : (
        <FormularioCarga
          secaderoId={secadero.id}
          secaderoNumero={secadero.numero}
          capacidad={capacidad}
          modelos={modelos.map((m) => ({ id: m.id, nombre: m.nombre }))}
          motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
        />
      )}
    </div>
  );
}

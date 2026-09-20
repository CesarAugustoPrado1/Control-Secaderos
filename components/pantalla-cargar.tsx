import Link from "next/link";
import { notFound } from "next/navigation";
import { productosActivos, secaderoPorId } from "@/lib/consultas";
import { capacidadTexto } from "@/lib/formato";
import { Aviso } from "@/components/ui";
import { FormularioCarga } from "@/components/formulario-carga";

/**
 * La pantalla de cargar un secadero, compartida por el carrusel y el llenado
 * manual.
 *
 * Es la MISMA operacion hecha por dos puestos distintos: vacio -> humedo. Lo
 * unico que cambia es a donde vuelve el operario cuando termina, asi que vive
 * una sola vez y cada ruta le pasa su `volverA`. El permiso lo revisa cada
 * pagina antes de llamarla, que es donde se sabe que rol corresponde.
 */
export async function PantallaCargar({
  id,
  volverA,
}: {
  id: string;
  volverA: string;
}) {
  const secadero = await secaderoPorId(Number(id));
  if (!secadero) notFound();

  const modelos = await productosActivos(secadero.tipoId);

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
          Cargar secadero {secadero.numero}
        </h1>
        <p className="text-sm text-slate-500">
          {secadero.tipoNombre} · {capacidadTexto(secadero.capacidad)}
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
          volverA={volverA}
        />
      )}
    </div>
  );
}

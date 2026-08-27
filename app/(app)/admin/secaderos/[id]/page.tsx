import Link from "next/link";
import { notFound } from "next/navigation";
import { capacidadDe } from "@/lib/configuracion";
import {
  historialDeSecadero,
  leerConfig,
  secaderoPorId,
  todosLosProductos,
} from "@/lib/consultas";
import {
  COLOR_MOVIMIENTO,
  ETIQUETA_ESTADO,
  ETIQUETA_MOVIMIENTO,
  ETIQUETA_TAMANO,
} from "@/lib/estados";
import { duracion, fechaHora, numero } from "@/lib/formato";
import { ChipEstado } from "@/components/ui";
import { FormularioCorreccion } from "./formulario";

export const dynamic = "force-dynamic";

export default async function PaginaCorregir({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const secadero = await secaderoPorId(Number(id));
  if (!secadero) notFound();

  const [cfg, productos, historial] = await Promise.all([
    leerConfig(),
    todosLosProductos(),
    historialDeSecadero(secadero.id, 15),
  ]);

  const delTamano = productos.filter((p) => p.tamano === secadero.tamano);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/secaderos"
          className="mb-3 inline-flex text-sm font-medium text-slate-500"
        >
          ← Volver a secaderos
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            Secadero {secadero.numero}
          </h2>
          <ChipEstado estado={secadero.estado} />
          <span className="text-sm text-slate-500">
            {ETIQUETA_TAMANO[secadero.tamano]} · hasta{" "}
            {capacidadDe(cfg, secadero.tamano)} placas
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <strong>Corrección manual.</strong> Forzá el estado y el contenido solo
        cuando algo se haya cargado mal. Queda registrado como un movimiento de
        corrección con tu nombre y el motivo.
      </div>

      <FormularioCorreccion
        secaderoId={secadero.id}
        estadoActual={secadero.estado}
        capacidad={capacidadDe(cfg, secadero.tamano)}
        contenidoActual={secadero.contenido}
        modelos={delTamano.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          activo: p.activo,
        }))}
      />

      <section>
        <h3 className="mb-3 text-sm font-bold text-slate-900">
          Últimos movimientos de este secadero
        </h3>
        {historial.length === 0 ? (
          <p className="tarjeta px-4 py-8 text-center text-sm text-slate-500">
            Este secadero todavía no tiene movimientos.
          </p>
        ) : (
          <ul className="space-y-2">
            {historial.map((m) => (
              <li key={m.id} className="tarjeta p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`chip ${COLOR_MOVIMIENTO[m.tipo]}`}>
                    {ETIQUETA_MOVIMIENTO[m.tipo]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {ETIQUETA_ESTADO[m.estadoDesde]} →{" "}
                    {ETIQUETA_ESTADO[m.estadoHasta]}
                  </span>
                  {m.duracionMin != null && (
                    <span className="text-xs text-slate-400">
                      ({duracion(m.duracionMin)})
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-400">
                    {fechaHora(m.creadoEn)} · {m.usuarioNombre}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {m.lineas.map((l) => (
                    <li key={l.id} className="text-sm text-slate-600">
                      {l.productoNombre}
                      {l.cantidad > 0 && (
                        <span className="ml-2 tabular-nums">
                          {numero(l.cantidad)}
                        </span>
                      )}
                      {l.desperdicio > 0 && (
                        <span className="ml-2 font-semibold text-red-600 tabular-nums">
                          −{numero(l.desperdicio)}
                          {l.motivoNombre && ` (${l.motivoNombre})`}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {m.nota && (
                  <p className="mt-1.5 text-sm text-slate-500 italic">
                    {m.nota}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

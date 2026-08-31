"use client";

import { useState } from "react";
import {
  cambiarEstadoMotivoDesvio,
  guardarMotivoDesvio,
} from "@/lib/acciones/plan";
import {
  BloqueNuevo,
  BotonAccion,
  Campo,
  FilaAbm,
  FormularioAbm,
} from "@/components/admin/comunes";

type Fila = { id: number; nombre: string; activo: boolean };

export function ListaMotivosDesvio({ motivos }: { motivos: Fila[] }) {
  const [editando, setEditando] = useState<number | null>(null);

  return (
    <>
      <BloqueNuevo etiqueta="Agregar motivo de desvío">
        {(cerrar) => (
          <FormularioMotivo inicial={{ nombre: "" }} alGuardar={cerrar} />
        )}
      </BloqueNuevo>

      {motivos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          No hay motivos de desvío cargados. Sin al menos uno, los operarios no
          van a poder explicar por qué no se llegó al plan.
        </p>
      ) : (
        <ul className="space-y-2">
          {motivos.map((m) => (
            <FilaAbm key={m.id} atenuado={!m.activo}>
              {editando === m.id ? (
                <div className="w-full">
                  <FormularioMotivo
                    inicial={m}
                    alGuardar={() => setEditando(null)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="mt-2 text-sm font-medium text-slate-500"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {m.nombre}
                    </p>
                    {!m.activo && (
                      <span className="chip mt-1 bg-amber-100 text-amber-900">
                        DESACTIVADO
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditando(m.id)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <BotonAccion
                      accion={() =>
                        cambiarEstadoMotivoDesvio({ id: m.id, activo: !m.activo })
                      }
                    >
                      {m.activo ? "Desactivar" : "Reactivar"}
                    </BotonAccion>
                  </div>
                </>
              )}
            </FilaAbm>
          ))}
        </ul>
      )}
    </>
  );
}

function FormularioMotivo({
  inicial,
  alGuardar,
}: {
  inicial: { id?: number; nombre: string };
  alGuardar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() => guardarMotivoDesvio({ id: inicial.id, nombre })}
    >
      <Campo etiqueta="Motivo">
        <input
          className="campo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="ej: Corte de luz"
          required
          maxLength={60}
        />
      </Campo>
    </FormularioAbm>
  );
}

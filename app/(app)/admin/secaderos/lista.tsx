"use client";

import Link from "next/link";
import { useState } from "react";
import {
  cambiarEstadoSecadero,
  eliminarSecadero,
  guardarSecadero,
} from "@/lib/acciones/admin";
import type { Estado, Tamano } from "@/lib/db/schema";
import { ETIQUETA_TAMANO } from "@/lib/estados";
import { ChipEstado, ChipTamano } from "@/components/ui";
import {
  BloqueNuevo,
  BotonAccion,
  Campo,
  FilaAbm,
  FormularioAbm,
} from "@/components/admin/comunes";

type Fila = {
  id: number;
  numero: number;
  tamano: Tamano;
  estado: Estado;
  activo: boolean;
};

export function ListaSecaderos({
  secaderos,
  capacidades,
}: {
  secaderos: Fila[];
  capacidades: Record<Tamano, number>;
}) {
  const [editando, setEditando] = useState<number | null>(null);

  const siguienteNumero =
    secaderos.reduce((max, s) => Math.max(max, s.numero), 0) + 1;

  return (
    <>
      <BloqueNuevo etiqueta="Agregar secadero">
        {(cerrar) => (
          <FormularioSecadero
            inicial={{
              numero: siguienteNumero,
              tamano: "grande",
            }}
            capacidades={capacidades}
            alGuardar={cerrar}
          />
        )}
      </BloqueNuevo>

      {secaderos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          Todavía no hay secaderos. Agregá el primero con el botón de arriba.
        </p>
      ) : (
        <ul className="space-y-2">
          {secaderos.map((s) => (
            <FilaAbm key={s.id} atenuado={!s.activo}>
              {editando === s.id ? (
                <div className="w-full">
                  <FormularioSecadero
                    inicial={s}
                    capacidades={capacidades}
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
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-base font-bold tabular-nums text-white">
                    {s.numero}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ChipTamano tamano={s.tamano} />
                      <ChipEstado estado={s.estado} />
                      {!s.activo && (
                        <span className="chip bg-red-100 text-red-800">
                          DE BAJA
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Hasta {capacidades[s.tamano]} placas
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditando(s.id)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      Editar
                    </button>

                    <Link
                      href={`/admin/secaderos/${s.id}`}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50"
                    >
                      Corregir
                    </Link>

                    <BotonAccion
                      accion={() =>
                        cambiarEstadoSecadero({ id: s.id, activo: !s.activo })
                      }
                    >
                      {s.activo ? "Dar de baja" : "Reactivar"}
                    </BotonAccion>

                    <BotonAccion
                      variante="peligro"
                      confirmar={`¿Eliminar el secadero ${s.numero}? Solo se puede si nunca tuvo movimientos.`}
                      accion={() => eliminarSecadero({ id: s.id })}
                    >
                      Eliminar
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

function FormularioSecadero({
  inicial,
  capacidades,
  alGuardar,
}: {
  inicial: { id?: number; numero: number; tamano: Tamano };
  capacidades: Record<Tamano, number>;
  alGuardar: () => void;
}) {
  const [numero, setNumero] = useState(String(inicial.numero));
  const [tamano, setTamano] = useState<Tamano>(inicial.tamano);

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() =>
        guardarSecadero({ id: inicial.id, numero: Number(numero), tamano })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Número">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="campo"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            required
          />
        </Campo>

        <Campo etiqueta="Tipo de placa">
          <select
            className="campo"
            value={tamano}
            onChange={(e) => setTamano(e.target.value as Tamano)}
          >
            {(["grande", "chico"] as const).map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TAMANO[t]} — hasta {capacidades[t]} placas
              </option>
            ))}
          </select>
        </Campo>
      </div>
    </FormularioAbm>
  );
}

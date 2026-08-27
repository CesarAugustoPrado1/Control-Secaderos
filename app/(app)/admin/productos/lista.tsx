"use client";

import { useState } from "react";
import { cambiarEstadoProducto, guardarProducto } from "@/lib/acciones/admin";
import type { Tamano } from "@/lib/db/schema";
import { ETIQUETA_TAMANO } from "@/lib/estados";
import { ChipTamano } from "@/components/ui";
import {
  BloqueNuevo,
  BotonAccion,
  Campo,
  FilaAbm,
  FormularioAbm,
} from "@/components/admin/comunes";

type Fila = { id: number; nombre: string; tamano: Tamano; activo: boolean };

export function ListaProductos({ productos }: { productos: Fila[] }) {
  const [editando, setEditando] = useState<number | null>(null);

  return (
    <>
      <BloqueNuevo etiqueta="Agregar modelo">
        {(cerrar) => (
          <FormularioProducto
            inicial={{ nombre: "", tamano: "grande" }}
            alGuardar={cerrar}
          />
        )}
      </BloqueNuevo>

      {productos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          Todavía no hay modelos de placa cargados.
        </p>
      ) : (
        <ul className="space-y-2">
          {productos.map((p) => (
            <FilaAbm key={p.id} atenuado={!p.activo}>
              {editando === p.id ? (
                <div className="w-full">
                  <FormularioProducto
                    inicial={p}
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
                      {p.nombre}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <ChipTamano tamano={p.tamano} />
                      {!p.activo && (
                        <span className="chip bg-amber-100 text-amber-900">
                          SUSPENDIDO
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditando(p.id)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <BotonAccion
                      accion={() =>
                        cambiarEstadoProducto({ id: p.id, activo: !p.activo })
                      }
                    >
                      {p.activo ? "Suspender" : "Reactivar"}
                    </BotonAccion>
                  </div>
                </>
              )}
            </FilaAbm>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Los modelos no se eliminan: suspenderlos los saca de la pantalla de
        carrusel pero mantiene intacto el historial.
      </p>
    </>
  );
}

function FormularioProducto({
  inicial,
  alGuardar,
}: {
  inicial: { id?: number; nombre: string; tamano: Tamano };
  alGuardar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [tamano, setTamano] = useState<Tamano>(inicial.tamano);

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() => guardarProducto({ id: inicial.id, nombre, tamano })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre del modelo">
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej: Standard 12,5mm"
            required
            maxLength={80}
          />
        </Campo>

        <Campo etiqueta="Tamaño de placa">
          <select
            className="campo"
            value={tamano}
            onChange={(e) => setTamano(e.target.value as Tamano)}
          >
            {(["grande", "chico"] as const).map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TAMANO[t]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
    </FormularioAbm>
  );
}

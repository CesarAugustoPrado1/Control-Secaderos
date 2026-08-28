"use client";

import Link from "next/link";
import { useState } from "react";
import { cambiarEstadoProducto, guardarProducto } from "@/lib/acciones/admin";
import { ChipTipo } from "@/components/ui";
import {
  BloqueNuevo,
  BotonAccion,
  Campo,
  FilaAbm,
  FormularioAbm,
} from "@/components/admin/comunes";

type TipoOpcion = { id: number; nombre: string };

type Fila = {
  id: number;
  nombre: string;
  tipoId: number;
  tipoNombre: string;
  activo: boolean;
};

export function ListaProductos({
  productos,
  tipos,
}: {
  productos: Fila[];
  tipos: TipoOpcion[];
}) {
  const [editando, setEditando] = useState<number | null>(null);

  if (tipos.length === 0) {
    return (
      <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
        Primero cargá al menos un tipo de secadero en la pestaña{" "}
        <Link href="/admin/tipos" className="font-semibold underline">
          Tipos
        </Link>
        .
      </p>
    );
  }

  return (
    <>
      <BloqueNuevo etiqueta="Agregar producto">
        {(cerrar) => (
          <FormularioProducto
            inicial={{ nombre: "", tipoId: tipos[0].id }}
            tipos={tipos}
            alGuardar={cerrar}
          />
        )}
      </BloqueNuevo>

      {productos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          Todavía no hay productos cargados. Agregá el primero con el botón de
          arriba.
        </p>
      ) : (
        <ul className="space-y-2">
          {productos.map((p) => (
            <FilaAbm key={p.id} atenuado={!p.activo}>
              {editando === p.id ? (
                <div className="w-full">
                  <FormularioProducto
                    inicial={p}
                    tipos={tipos}
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
                      <ChipTipo nombre={p.tipoNombre} />
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
        Los productos no se eliminan: suspenderlos los saca de las pantallas de
        carga pero mantiene intacto el historial. El tipo determina en qué
        secaderos se puede cargar cada producto.
      </p>
    </>
  );
}

function FormularioProducto({
  inicial,
  tipos,
  alGuardar,
}: {
  inicial: { id?: number; nombre: string; tipoId: number };
  tipos: TipoOpcion[];
  alGuardar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [tipoId, setTipoId] = useState(inicial.tipoId);

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() => guardarProducto({ id: inicial.id, nombre, tipoId })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre del producto">
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej: Standard 12,5mm"
            required
            maxLength={80}
          />
        </Campo>

        <Campo etiqueta="Tipo de secadero">
          <select
            className="campo"
            value={tipoId}
            onChange={(e) => setTipoId(Number(e.target.value))}
          >
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Campo>
      </div>
    </FormularioAbm>
  );
}

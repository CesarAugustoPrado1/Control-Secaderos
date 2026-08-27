"use client";

import { useMemo } from "react";
import type { Rotura } from "@/lib/acciones/comun";

export type OpcionModelo = { productoId: number; nombre: string; tope: number };
export type Motivo = { id: number; nombre: string };

/** Estado del editor: como maximo una rotura por modelo, que es el caso real. */
export type MapaRoturas = Record<number, { cantidad: number; motivoId: number }>;

export function convertirRoturas(mapa: MapaRoturas): Rotura[] {
  return Object.entries(mapa)
    .filter(([, v]) => v.cantidad > 0)
    .map(([productoId, v]) => ({
      productoId: Number(productoId),
      cantidad: v.cantidad,
      motivoId: v.motivoId,
    }));
}

/** Devuelve el primer problema de validacion, o null si esta todo bien. */
export function validarRoturas(
  mapa: MapaRoturas,
  opciones: OpcionModelo[],
): string | null {
  for (const opcion of opciones) {
    const rotura = mapa[opcion.productoId];
    if (!rotura || rotura.cantidad <= 0) continue;
    if (rotura.cantidad > opcion.tope) {
      return `No podés marcar ${rotura.cantidad} rotas de "${opcion.nombre}": hay ${opcion.tope}.`;
    }
    if (!rotura.motivoId) {
      return `Elegí el motivo de las roturas de "${opcion.nombre}".`;
    }
  }
  return null;
}

export function EditorRoturas({
  opciones,
  motivos,
  valor,
  alCambiar,
  deshabilitado,
}: {
  opciones: OpcionModelo[];
  motivos: Motivo[];
  valor: MapaRoturas;
  alCambiar: (v: MapaRoturas) => void;
  deshabilitado?: boolean;
}) {
  const totalRotas = useMemo(
    () => Object.values(valor).reduce((a, r) => a + (r.cantidad || 0), 0),
    [valor],
  );

  function actualizar(
    productoId: number,
    cambios: Partial<{ cantidad: number; motivoId: number }>,
  ) {
    const actual = valor[productoId] ?? { cantidad: 0, motivoId: 0 };
    const siguiente = { ...actual, ...cambios };
    // Si vuelve a cero, la fila desaparece del payload.
    if (siguiente.cantidad <= 0) {
      const copia = { ...valor };
      delete copia[productoId];
      alCambiar(copia);
      return;
    }
    // Con un solo motivo cargado no tiene sentido hacer elegir.
    if (!siguiente.motivoId && motivos.length === 1) {
      siguiente.motivoId = motivos[0].id;
    }
    alCambiar({ ...valor, [productoId]: siguiente });
  }

  if (motivos.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        No hay motivos de desperdicio cargados. Pedile al administrador que
        agregue al menos uno para poder registrar roturas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="etiqueta mb-0">Placas rotas</span>
        {totalRotas > 0 && (
          <span className="text-sm font-bold text-red-600">
            {totalRotas} al desperdicio
          </span>
        )}
      </div>

      {opciones.map((opcion) => {
        const rotura = valor[opcion.productoId];
        const cantidad = rotura?.cantidad ?? 0;
        return (
          <div
            key={opcion.productoId}
            className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {opcion.nombre}
                </p>
                <p className="text-xs text-slate-500">{opcion.tope} placas</p>
              </div>
              <div className="flex items-center gap-1.5">
                <BotonPaso
                  onClick={() =>
                    actualizar(opcion.productoId, {
                      cantidad: Math.max(0, cantidad - 1),
                    })
                  }
                  disabled={deshabilitado || cantidad === 0}
                >
                  −
                </BotonPaso>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={opcion.tope}
                  value={cantidad === 0 ? "" : cantidad}
                  placeholder="0"
                  disabled={deshabilitado}
                  onChange={(e) =>
                    actualizar(opcion.productoId, {
                      cantidad: Math.min(
                        opcion.tope,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    })
                  }
                  className="h-11 w-16 rounded-lg border-0 bg-white text-center text-base font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  aria-label={`Placas rotas de ${opcion.nombre}`}
                />
                <BotonPaso
                  onClick={() =>
                    actualizar(opcion.productoId, {
                      cantidad: Math.min(opcion.tope, cantidad + 1),
                    })
                  }
                  disabled={deshabilitado || cantidad >= opcion.tope}
                >
                  +
                </BotonPaso>
              </div>
            </div>

            {cantidad > 0 && (
              <select
                className="campo mt-2.5 py-2.5"
                value={rotura?.motivoId || ""}
                disabled={deshabilitado}
                onChange={(e) =>
                  actualizar(opcion.productoId, {
                    motivoId: Number(e.target.value),
                  })
                }
                aria-label={`Motivo de las roturas de ${opcion.nombre}`}
              >
                <option value="">¿Por qué se rompieron?</option>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BotonPaso(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="h-11 w-11 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 transition active:scale-95 disabled:opacity-30"
    />
  );
}

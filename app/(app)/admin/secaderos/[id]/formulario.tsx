"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { corregirSecadero } from "@/lib/acciones/flujo";
import type { LineaContenido } from "@/lib/consultas";
import type { Estado } from "@/lib/db/schema";
import { ORDEN_ESTADOS, TITULO_ESTADO } from "@/lib/estados";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

type Modelo = { id: number; nombre: string; activo: boolean };

export function FormularioCorreccion({
  secaderoId,
  estadoActual,
  capacidad,
  contenidoActual,
  modelos,
}: {
  secaderoId: number;
  estadoActual: Estado;
  capacidad: number;
  contenidoActual: LineaContenido[];
  modelos: Modelo[];
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  const [estado, setEstado] = useState<Estado>(estadoActual);
  const [cantidades, setCantidades] = useState<Record<number, number>>(() =>
    Object.fromEntries(contenidoActual.map((c) => [c.productoId, c.cantidad])),
  );
  const [nota, setNota] = useState("");

  const total = useMemo(
    () => Object.values(cantidades).reduce((a, n) => a + (n || 0), 0),
    [cantidades],
  );

  const vaciando = estado === "vacio";

  async function confirmar() {
    if (nota.trim().length < 3) {
      return setError("Escribí por qué estás corrigiendo el secadero.");
    }
    if (!vaciando && total === 0) {
      return setError(
        `Un secadero ${TITULO_ESTADO[estado].toLowerCase()} necesita al menos un producto con cantidad.`,
      );
    }
    if (total > capacidad) {
      return setError(`El secadero admite ${capacidad} placas y pusiste ${total}.`);
    }

    await ejecutar(
      () =>
        corregirSecadero({
          secaderoId,
          estadoHasta: estado,
          items: vaciando
            ? []
            : Object.entries(cantidades)
                .filter(([, c]) => c > 0)
                .map(([productoId, cantidad]) => ({
                  productoId: Number(productoId),
                  cantidad,
                })),
          nota: nota.trim(),
        }),
      () => {
        setNota("");
        router.refresh();
      },
    );
  }

  return (
    <div className="tarjeta space-y-4 p-4">
      <div>
        <span className="etiqueta">Estado</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ORDEN_ESTADOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setEstado(e);
                setError(null);
              }}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                estado === e
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {TITULO_ESTADO[e]}
            </button>
          ))}
        </div>
      </div>

      {vaciando ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
          El secadero va a quedar vacío y sin placas. Las que figuraban adentro
          no se cuentan como producto terminado ni como desperdicio: usá esta
          opción solo para arreglar una carga equivocada.
        </p>
      ) : (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="etiqueta mb-0">Contenido</span>
            <span
              className={`text-sm font-bold tabular-nums ${
                total > capacidad ? "text-red-600" : "text-slate-600"
              }`}
            >
              {total} / {capacidad}
            </span>
          </div>

          <div className="space-y-2">
            {modelos.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-200"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {m.nombre}
                  {!m.activo && (
                    <span className="ml-2 text-xs text-slate-400">
                      (suspendido)
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="h-11 w-20 rounded-lg border-0 bg-white text-center text-base font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  value={cantidades[m.id] ? cantidades[m.id] : ""}
                  placeholder="0"
                  disabled={enviando}
                  onChange={(e) => {
                    setError(null);
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setCantidades((prev) => ({ ...prev, [m.id]: v }));
                  }}
                  aria-label={`Cantidad de ${m.nombre}`}
                />
              </div>
            ))}
            {modelos.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-400">
                No hay productos cargados para este tipo de secadero.
              </p>
            )}
          </div>
        </div>
      )}

      <label className="block">
        <span className="etiqueta">Motivo de la corrección (obligatorio)</span>
        <textarea
          className="campo min-h-20"
          value={nota}
          maxLength={500}
          disabled={enviando}
          onChange={(e) => {
            setNota(e.target.value);
            setError(null);
          }}
          placeholder="ej: carrusel cargó 204 en lugar de 102"
        />
      </label>

      {error && <Aviso>{error}</Aviso>}

      <button
        type="button"
        onClick={() => void confirmar()}
        disabled={enviando}
        className="boton w-full bg-amber-600 text-white hover:bg-amber-700"
      >
        {enviando ? "Guardando…" : "Aplicar corrección"}
      </button>
    </div>
  );
}

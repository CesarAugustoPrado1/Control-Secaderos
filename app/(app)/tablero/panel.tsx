"use client";

import { useMemo, useState } from "react";
import type { SecaderoVista } from "@/lib/consultas";
import type { Estado } from "@/lib/db/schema";
import { COLOR_ESTADO, ORDEN_ESTADOS, TITULO_ESTADO } from "@/lib/estados";
import { duracion, minutosDesde, numero } from "@/lib/formato";
import { ChipEstado, ChipTipo } from "@/components/ui";

/**
 * Tablero: contadores por estado y, al tocar uno, la lista de los secaderos que
 * lo componen. Con ~250 unidades no se listan todos de entrada -seria un muro
 * de scroll- pero el contador tiene que ser una puerta a su detalle, no un
 * numero muerto.
 */
export function PanelTablero({
  secaderos,
  capacidadHorno,
}: {
  secaderos: SecaderoVista[];
  capacidadHorno: number;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const { conteo, placas } = useMemo(() => {
    const conteo = { vacio: 0, humedo: 0, horno: 0, seco: 0 } as Record<Estado, number>;
    const placas = { vacio: 0, humedo: 0, horno: 0, seco: 0 } as Record<Estado, number>;
    for (const s of secaderos) {
      conteo[s.estado]++;
      placas[s.estado] += s.total;
    }
    return { conteo, placas };
  }, [secaderos]);

  const lista = useMemo(() => {
    const q = busqueda.trim();
    return secaderos
      .filter((s) => {
        if (estado && s.estado !== estado) return false;
        if (q && !String(s.numero).startsWith(q)) return false;
        return true;
      })
      .sort((a, b) =>
        // Dentro de un estado, lo mas viejo primero: es lo que espera hace mas.
        estado
          ? a.estadoDesde.getTime() - b.estadoDesde.getTime()
          : a.numero - b.numero,
      );
  }, [secaderos, estado, busqueda]);

  const hayFiltro = estado !== null || busqueda.trim() !== "";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ORDEN_ESTADOS.map((e) => {
          const color = COLOR_ESTADO[e];
          const activo = estado === e;
          return (
            <button
              key={e}
              type="button"
              onClick={() => setEstado(activo ? null : e)}
              aria-pressed={activo}
              className={`tarjeta p-4 text-left transition active:scale-[0.98] ${
                activo ? "ring-2 ring-slate-900" : color.borde
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${color.punto}`} />
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  {TITULO_ESTADO[e]}
                </span>
              </span>
              <span className="mt-2 block text-4xl font-bold tabular-nums text-slate-900">
                {conteo[e]}
                {e === "horno" && (
                  <span className="text-xl font-medium text-slate-400">
                    /{capacidadHorno}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {placas[e] > 0 ? `${numero(placas[e])} placas` : "sin placas"}
              </span>
              <span className="mt-1.5 block text-xs font-semibold text-slate-400">
                {activo ? "Tocá para cerrar" : "Ver cuáles"}
              </span>
            </button>
          );
        })}
      </div>

      <section className="tarjeta p-4">
        <input
          type="text"
          inputMode="numeric"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value.replace(/\D/g, ""))}
          placeholder="Buscar un secadero por número…"
          aria-label="Buscar secadero por número"
          className="campo py-3 tabular-nums"
        />

        {estado && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">
              {TITULO_ESTADO[estado]} · {lista.length}
            </p>
            <button
              type="button"
              onClick={() => setEstado(null)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300"
            >
              Quitar filtro
            </button>
          </div>
        )}

        {!hayFiltro ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Tocá un contador de arriba para ver qué secaderos lo componen, o
            escribí un número.
          </p>
        ) : lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Ningún secadero coincide con la búsqueda.
          </p>
        ) : (
          <>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {lista.slice(0, 90).map((s) => (
                <li
                  key={s.id}
                  className={`rounded-xl p-3 ring-1 ${COLOR_ESTADO[s.estado].fondo} ${COLOR_ESTADO[s.estado].borde}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base font-bold tabular-nums ${COLOR_ESTADO[s.estado].chip}`}
                    >
                      {s.numero}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!estado && <ChipEstado estado={s.estado} />}
                        <ChipTipo id={s.tipoId} nombre={s.tipoNombre} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {s.total > 0 ? `${numero(s.total)} placas` : "sin placas"} ·
                        hace {duracion(minutosDesde(s.estadoDesde))}
                      </p>
                      {s.contenido.length > 0 && (
                        <p className="truncate text-xs text-slate-500">
                          {s.contenido
                            .map((c) => `${c.nombre} (${numero(c.cantidad)})`)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {lista.length > 90 && (
              <p className="mt-3 text-center text-xs text-slate-400">
                Mostrando los primeros 90 de {lista.length}. Afiná con el buscador
                para ver el resto.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

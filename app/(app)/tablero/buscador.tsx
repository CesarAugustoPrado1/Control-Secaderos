"use client";

import { useMemo, useState } from "react";
import type { SecaderoVista } from "@/lib/consultas";
import type { Estado } from "@/lib/db/schema";
import { COLOR_ESTADO, ORDEN_ESTADOS, TITULO_ESTADO } from "@/lib/estados";
import { duracion, minutosDesde, numero } from "@/lib/formato";
import { ChipEstado, ChipTipo } from "@/components/ui";

/**
 * Consulta puntual de un secadero. Con 250 en planta, mostrarlos todos es
 * inútil: lo que se necesita es "¿dónde está el 187 y qué tiene adentro?".
 * Se puede buscar por numero o filtrar por estado.
 */
export function BuscadorTablero({ secaderos }: { secaderos: SecaderoVista[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState<Estado | "todos">("todos");

  const filtrados = useMemo(() => {
    const q = busqueda.trim();
    return secaderos.filter((s) => {
      if (estado !== "todos" && s.estado !== estado) return false;
      if (q && !String(s.numero).startsWith(q)) return false;
      return true;
    });
  }, [secaderos, busqueda, estado]);

  // Sin filtros activos no tiene sentido volcar los 250: se pide uno.
  const hayFiltro = busqueda.trim() !== "" || estado !== "todos";
  const visibles = hayFiltro ? filtrados : [];

  return (
    <section className="tarjeta p-4">
      <h2 className="mb-3 text-sm font-bold text-slate-900">
        Buscar un secadero
      </h2>

      <input
        type="text"
        inputMode="numeric"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value.replace(/\D/g, ""))}
        placeholder="Número de secadero…"
        aria-label="Buscar secadero por número"
        className="campo py-3 text-lg font-semibold tabular-nums"
      />

      <div className="mt-3 -mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-1.5">
          <Filtro activo={estado === "todos"} onClick={() => setEstado("todos")}>
            Todos
          </Filtro>
          {ORDEN_ESTADOS.map((e) => (
            <Filtro key={e} activo={estado === e} onClick={() => setEstado(e)}>
              {TITULO_ESTADO[e]}
            </Filtro>
          ))}
        </div>
      </div>

      {!hayFiltro ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Escribí un número o elegí un estado para ver los secaderos.
        </p>
      ) : visibles.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          Ningún secadero coincide con la búsqueda.
        </p>
      ) : (
        <>
          <p className="mt-3 mb-2 text-sm text-slate-500">
            {visibles.length}{" "}
            {visibles.length === 1 ? "secadero" : "secaderos"}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibles.slice(0, 60).map((s) => (
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
                      <ChipEstado estado={s.estado} />
                      <ChipTipo id={s.tipoId} nombre={s.tipoNombre} />
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {s.total > 0
                        ? `${numero(s.total)} placas`
                        : "sin placas"}{" "}
                      · hace {duracion(minutosDesde(s.estadoDesde))}
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
          {visibles.length > 60 && (
            <p className="mt-3 text-center text-xs text-slate-400">
              Mostrando los primeros 60 de {visibles.length}. Afiná la búsqueda
              para ver el resto.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Filtro({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
        activo
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

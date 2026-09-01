"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Estado } from "@/lib/db/schema";
import { COLOR_ESTADO, ETIQUETA_ESTADO } from "@/lib/estados";
import { duracion, minutosDesde, numero } from "@/lib/formato";
import { MarcasSecadero } from "@/components/marcas-secadero";
import { ChipTipo } from "@/components/ui";

export type SecaderoBuscable = {
  id: number;
  numero: number;
  tipoId: number;
  tipoNombre: string;
  capacidad: number;
  estado: Estado;
  estadoDesde: string;
  total: number;
  contenido: string;
  /** Cuantos productos distintos tiene adentro. */
  productos: number;
};

/**
 * Buscador por numero sobre TODOS los secaderos, no solo los disponibles.
 *
 * Es la diferencia importante: si buscara solo entre los disponibles, escribir
 * un numero ocupado no devolveria nada y el operario no sabria si el secadero
 * no existe o esta en uso. Buscando sobre todos, se le puede decir exactamente
 * por que no lo puede usar y desde hace cuanto.
 */
export function BuscadorAccion({
  secaderos,
  estadoObjetivo,
  hrefBase,
  verbo,
  etiquetaDisponibles,
}: {
  secaderos: SecaderoBuscable[];
  estadoObjetivo: Estado;
  hrefBase: string;
  verbo: string;
  etiquetaDisponibles: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campo.current?.focus();
  }, []);

  const disponibles = useMemo(
    () => secaderos.filter((s) => s.estado === estadoObjetivo).length,
    [secaderos, estadoObjetivo],
  );

  const resultados = useMemo(() => {
    const q = busqueda.trim();
    if (!q) return [];
    return secaderos
      .filter((s) => String(s.numero).startsWith(q))
      .sort((a, b) => {
        // Los que se pueden usar van primero.
        const dispA = a.estado === estadoObjetivo ? 0 : 1;
        const dispB = b.estado === estadoObjetivo ? 0 : 1;
        return dispA - dispB || a.numero - b.numero;
      })
      .slice(0, 30);
  }, [secaderos, busqueda, estadoObjetivo]);

  return (
    <section className="tarjeta p-4">
      <div className="relative">
        <input
          ref={campo}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value.replace(/\D/g, ""))}
          placeholder="Número de secadero…"
          aria-label="Buscar secadero por número"
          className="campo py-3.5 pr-24 text-lg font-semibold tabular-nums"
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              campo.current?.focus();
            }}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
          >
            Borrar
          </button>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-500">
        {numero(disponibles)} {etiquetaDisponibles}
      </p>

      {busqueda && (
        <div className="mt-3 space-y-2">
          {resultados.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No existe ningún secadero que empiece con{" "}
              <strong className="text-slate-700">{busqueda}</strong>.
            </p>
          ) : (
            resultados.map((s) => {
              const color = COLOR_ESTADO[s.estado];
              const disponible = s.estado === estadoObjetivo;

              const cuerpo = (
                <>
                  <span
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold tabular-nums ${color.chip}`}
                  >
                    {s.numero}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* El cuadrado del numero va con el color del ESTADO, que
                        en esta pantalla es siempre el mismo. Sin este chip,
                        grande y chico se veian identicos. */}
                    <span className="block text-sm font-semibold text-slate-800">
                      <ChipTipo id={s.tipoId} nombre={s.tipoNombre} />
                      {s.total > 0 && (
                        <span className="ml-1.5 tabular-nums">
                          · {numero(s.total)} placas
                        </span>
                      )}
                    </span>
                    {disponible ? (
                      <span className="block text-xs text-slate-500">
                        {ETIQUETA_ESTADO[s.estado]} hace{" "}
                        {duracion(minutosDesde(new Date(s.estadoDesde)))}
                      </span>
                    ) : (
                      // Lo importante del caso ocupado: por que no se puede usar.
                      <span className="block text-xs font-medium text-slate-600">
                        Está <strong>{ETIQUETA_ESTADO[s.estado]}</strong> hace{" "}
                        {duracion(minutosDesde(new Date(s.estadoDesde)))}
                      </span>
                    )}
                    {s.contenido && (
                      <span className="block truncate text-xs text-slate-400">
                        {s.contenido}
                      </span>
                    )}
                    <MarcasSecadero
                      total={s.total}
                      capacidad={s.capacidad}
                      productos={s.productos}
                    />
                  </span>
                  {disponible && (
                    <span className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">
                      {verbo}
                    </span>
                  )}
                </>
              );

              return disponible ? (
                <Link
                  key={s.id}
                  href={`${hrefBase}/${s.id}`}
                  className={`tarjeta flex items-center gap-3 p-3 transition hover:shadow-md active:scale-[0.99] ${color.borde}`}
                >
                  {cuerpo}
                </Link>
              ) : (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 opacity-75 ring-1 ring-slate-200"
                >
                  {cuerpo}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

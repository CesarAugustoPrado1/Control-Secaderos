"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guardarMeta } from "@/lib/acciones/plan";
import type { Sector } from "@/lib/db/schema";
import { numero } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

/**
 * La meta del dia de un sector, en secaderos: el numero redondo que se quiere
 * mover ese dia. Arriba de lo pedido por modelo, porque es lo primero que se
 * decide; se compara contra lo programado (alcanza o no) y contra lo hecho.
 */
export function MetaSector({
  fecha,
  sector,
  meta,
  sugerida,
  programados,
  hechos,
  esFuturo,
}: {
  fecha: string;
  sector: Sector;
  meta: number | null;
  /** La ultima usada antes de este dia, para proponerla. */
  sugerida: number | null;
  /** Secaderos pedidos en el plan de ese dia. */
  programados: number;
  /** Secaderos que el sector movio de verdad, en el plan o fuera de el. */
  hechos: number;
  esFuturo: boolean;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(meta ?? sugerida ?? ""));

  async function guardar(n: number | null) {
    const ok = await ejecutar(
      () => guardarMeta({ fecha, sector, meta: n }),
      () => router.refresh(),
    );
    if (ok) setEditando(false);
  }

  const verbo = sector === "carrusel" ? "cargar" : "descargar";

  if (editando || (meta === null && sugerida === null)) {
    const n = Number(valor);
    const valido = Number.isInteger(n) && n > 0;
    return (
      <div className="mb-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <label className="block">
          <span className="etiqueta">Meta del día: secaderos a {verbo}</span>
          <div className="flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ej. 20"
              disabled={enviando}
              className="campo w-28 text-center text-lg font-bold tabular-nums"
            />
            <button
              type="button"
              onClick={() => void guardar(n)}
              disabled={enviando || !valido}
              className="boton-primario min-h-11 px-4 text-sm"
            >
              {enviando ? "Guardando…" : "Guardar"}
            </button>
            {meta !== null && (
              <button
                type="button"
                onClick={() => void guardar(null)}
                disabled={enviando}
                className="rounded-lg px-3 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
              >
                Quitar
              </button>
            )}
            {editando && (
              <button
                type="button"
                onClick={() => setEditando(false)}
                disabled={enviando}
                className="text-xs font-semibold text-slate-500 underline"
              >
                Cancelar
              </button>
            )}
          </div>
        </label>
        {error && (
          <div className="mt-2">
            <Aviso>{error}</Aviso>
          </div>
        )}
      </div>
    );
  }

  // Sin meta propia pero con una anterior: se propone, con un toque para usarla.
  if (meta === null) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <span className="text-sm text-slate-600">
          Sin meta para este día. La última fue de{" "}
          <strong className="text-slate-900">{numero(sugerida!)} secaderos</strong>.
        </span>
        <button
          type="button"
          onClick={() => void guardar(sugerida)}
          disabled={enviando}
          className="boton-primario min-h-10 px-3 text-sm"
        >
          {enviando ? "Guardando…" : `Usar ${numero(sugerida!)}`}
        </button>
        <button
          type="button"
          onClick={() => setEditando(true)}
          disabled={enviando}
          className="text-xs font-semibold text-slate-600 underline"
        >
          Otra
        </button>
        {error && <Aviso>{error}</Aviso>}
      </div>
    );
  }

  const pctHecho = Math.round((hechos / meta) * 100);
  const llega = programados >= meta;
  return (
    <div className="mb-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Meta del día{" "}
          <strong className="text-2xl font-bold text-slate-900">{numero(meta)}</strong>{" "}
          secaderos a {verbo}
        </p>
        <button
          type="button"
          onClick={() => {
            setValor(String(meta));
            setEditando(true);
          }}
          className="text-xs font-semibold text-slate-600 underline"
        >
          Cambiar
        </button>
      </div>

      {/* Hecho contra la meta: barra que se llena, igual que los vasos. */}
      {!esFuturo && (
        <div className="mt-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-slate-600">
              Hechos <strong className="text-slate-900">{numero(hechos)}</strong> de{" "}
              {numero(meta)}
            </span>
            <strong className={pctHecho >= 100 ? "text-emerald-700" : "text-slate-900"}>
              {pctHecho} %
            </strong>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${pctHecho >= 100 ? "bg-emerald-500" : "bg-blue-600"}`}
              style={{ width: `${Math.min(pctHecho, 100)}%` }}
            />
          </div>
        </div>
      )}

      <p
        className={`mt-2 text-xs font-semibold ${
          programados === meta ? "text-emerald-700" : llega ? "text-amber-800" : "text-red-700"
        }`}
      >
        {programados === meta
          ? `Lo pedido por modelo llega justo a la meta (${numero(programados)}).`
          : llega
            ? `Lo pedido por modelo pasa la meta: ${numero(programados)} de ${numero(meta)}.`
            : `Lo pedido por modelo no llega a la meta: ${numero(programados)} de ${numero(meta)}, faltan ${numero(meta - programados)}.`}
      </p>
    </div>
  );
}

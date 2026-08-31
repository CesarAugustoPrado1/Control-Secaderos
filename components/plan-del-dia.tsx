"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { explicarDesvio } from "@/lib/acciones/plan";
import type { ComparacionPlan, LineaPlan } from "@/lib/plan";
import { numero, porcentaje } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

type Motivo = { id: number; nombre: string };

/**
 * La orden del dia en la pantalla del operario, con el avance en vivo.
 *
 * Va arriba de todo a proposito: si el plan vive solo en el panel del admin es
 * papeleo, y si lo ve mientras trabaja es una guia. El desvio no se carga, se
 * calcula; lo unico que se pide a mano es el motivo, y solo cuando falta algo.
 */
export function PlanDelDia({
  comparacion,
  motivos,
  entregadosPorHorno,
  puedeExplicar,
}: {
  comparacion: ComparacionPlan;
  motivos: Motivo[];
  /**
   * Solo para paletizado: cuantos secaderos entrego el horno ese dia. Sin este
   * numero, un cumplimiento bajo por falta de material se leeria como bajo
   * rendimiento del sector.
   */
  entregadosPorHorno?: number;
  puedeExplicar: boolean;
}) {
  if (!comparacion.hayPlan) {
    return (
      <section className="tarjeta border-l-4 border-slate-300 p-4">
        <h2 className="text-sm font-bold text-slate-700">Sin plan para hoy</h2>
        <p className="mt-1 text-sm text-slate-500">
          Todavía no se cargó la orden de producción del día. Podés trabajar
          igual: lo que hagas queda registrado.
        </p>
      </section>
    );
  }

  const { lineas, fueraDePlan, totalPedido, totalHecho } = comparacion;
  const cumplimiento = totalPedido > 0 ? totalHecho / totalPedido : 1;

  return (
    <section className="tarjeta p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Plan de hoy</h2>
        <span
          className={`text-sm font-bold tabular-nums ${
            cumplimiento >= 1
              ? "text-emerald-600"
              : cumplimiento >= 0.7
                ? "text-slate-700"
                : "text-amber-700"
          }`}
        >
          {numero(totalHecho)} de {numero(totalPedido)} secaderos ·{" "}
          {porcentaje(totalHecho, totalPedido)}
        </span>
      </div>

      {comparacion.nota && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 italic">
          {comparacion.nota}
        </p>
      )}

      {entregadosPorHorno !== undefined && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          El horno entregó <strong>{numero(entregadosPorHorno)}</strong>{" "}
          {entregadosPorHorno === 1 ? "secadero" : "secaderos"} en el día. Si te
          pidieron más de eso, el faltante no es del sector.
        </p>
      )}

      <ul className="space-y-2">
        {lineas.map((l) => (
          <FilaPlan
            key={l.lineaId}
            linea={l}
            motivos={motivos}
            puedeExplicar={puedeExplicar}
          />
        ))}
      </ul>

      {fueraDePlan.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-600">
            Además, fuera del plan:
          </p>
          <p className="text-xs text-slate-500">
            {fueraDePlan
              .map((f) => `${f.producto} (${numero(f.hechos)})`)
              .join(", ")}
          </p>
        </div>
      )}
    </section>
  );
}

function FilaPlan({
  linea,
  motivos,
  puedeExplicar,
}: {
  linea: LineaPlan;
  motivos: Motivo[];
  puedeExplicar: boolean;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [motivoId, setMotivoId] = useState(linea.motivoDesvioId ?? 0);
  const [nota, setNota] = useState(linea.notaDesvio ?? "");

  const completo = linea.hechos >= linea.pedidos;
  const falta = Math.max(0, linea.pedidos - linea.hechos);
  const avance = linea.pedidos > 0 ? Math.min(1, linea.hechos / linea.pedidos) : 1;
  const explicado = linea.motivoDesvioId != null;
  const nombreMotivo = motivos.find((m) => m.id === linea.motivoDesvioId)?.nombre;

  return (
    <li className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
          {linea.producto}
        </span>
        <span
          className={`shrink-0 text-sm font-bold tabular-nums ${
            completo ? "text-emerald-600" : "text-slate-700"
          }`}
        >
          {numero(linea.hechos)} / {numero(linea.pedidos)}
          {completo && " ✓"}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${completo ? "bg-emerald-500" : "bg-blue-500"}`}
          style={{ width: `${avance * 100}%` }}
        />
      </div>

      {/* El detalle en placas revela los secaderos que salieron incompletos:
          3 de 3 secaderos puede ser 500 de 612 placas. */}
      <p className="mt-1 text-xs tabular-nums text-slate-500">
        {numero(linea.placas)} de {numero(linea.placasEsperadas)} placas
      </p>

      {!completo && (
        <div className="mt-2">
          {explicado ? (
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-amber-800">
                Faltaron {numero(falta)}:
              </span>{" "}
              {nombreMotivo ?? "motivo no encontrado"}
              {linea.notaDesvio && ` — ${linea.notaDesvio}`}
              {linea.explicadoPorNombre && (
                <span className="text-slate-400">
                  {" "}
                  ({linea.explicadoPorNombre})
                </span>
              )}
              {puedeExplicar && (
                <button
                  type="button"
                  onClick={() => setAbierto((v) => !v)}
                  className="ml-2 font-semibold text-slate-500 underline"
                >
                  cambiar
                </button>
              )}
            </p>
          ) : puedeExplicar ? (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-300"
            >
              Faltaron {numero(falta)} · explicar por qué
            </button>
          ) : (
            <p className="text-xs font-semibold text-amber-800">
              Faltaron {numero(falta)}, sin explicar
            </p>
          )}
        </div>
      )}

      {abierto && puedeExplicar && (
        <div className="mt-2 space-y-2">
          <select
            className="campo py-2.5"
            value={motivoId || ""}
            disabled={enviando}
            onChange={(e) => setMotivoId(Number(e.target.value))}
            aria-label={`Motivo del desvío de ${linea.producto}`}
          >
            <option value="">¿Por qué no se llegó?</option>
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>

          <input
            className="campo py-2.5"
            placeholder="Detalle (opcional)"
            value={nota}
            maxLength={500}
            disabled={enviando}
            onChange={(e) => setNota(e.target.value)}
          />

          {error && <Aviso>{error}</Aviso>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enviando || !motivoId}
              onClick={async () => {
                const ok = await ejecutar(
                  () =>
                    explicarDesvio({
                      lineaId: linea.lineaId,
                      motivoId,
                      nota: nota.trim() || undefined,
                    }),
                  () => router.refresh(),
                );
                if (ok) setAbierto(false);
              }}
              className="boton-primario px-4 text-sm"
            >
              {enviando ? "Guardando…" : "Guardar"}
            </button>
            {explicado && (
              <button
                type="button"
                disabled={enviando}
                onClick={async () => {
                  const ok = await ejecutar(
                    () =>
                      explicarDesvio({ lineaId: linea.lineaId, motivoId: null }),
                    () => router.refresh(),
                  );
                  if (ok) {
                    setMotivoId(0);
                    setNota("");
                    setAbierto(false);
                  }
                }}
                className="boton-secundario px-4 text-sm"
              >
                Quitar
              </button>
            )}
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="boton-secundario px-4 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

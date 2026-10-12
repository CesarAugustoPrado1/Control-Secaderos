"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guardarRumbo } from "@/lib/acciones/admin";
import type { Rumbo } from "@/lib/rumbo";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

/**
 * Proposito, objetivos y glosario: se leen tal cual y, con "Editar", se
 * cambian en el lugar. Es del admin: el rumbo lo marca el dueño de la app.
 */
export function EditorRumbo({ inicial }: { inicial: Rumbo }) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [editando, setEditando] = useState(false);
  const [r, setR] = useState<Rumbo>(inicial);

  async function guardar() {
    const ok = await ejecutar(
      () => guardarRumbo(r),
      () => router.refresh(),
    );
    if (ok) setEditando(false);
  }

  function cancelar() {
    setR(inicial);
    setEditando(false);
  }

  if (!editando) {
    return (
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Rumbo</h2>
            <p className="text-sm text-slate-500">Para qué existe la app y hacia dónde va.</p>
          </div>
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="boton-secundario min-h-10 px-4 text-sm"
          >
            Editar
          </button>
        </div>

        {r.proposito && (
          <p className="tarjeta border-l-4 border-slate-900 p-4 text-base font-medium text-slate-800">
            {r.proposito}
          </p>
        )}

        {r.objetivos.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">
              Objetivos
            </h3>
            <ol className="grid gap-3 sm:grid-cols-2">
              {r.objetivos.map((o, i) => (
                <li key={i} className="tarjeta flex gap-3 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-bold text-slate-900">{o.titulo}</span>
                    {o.detalle && (
                      <span className="mt-0.5 block text-sm text-slate-600">{o.detalle}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {r.glosario.length > 0 && (
          <details className="tarjeta p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-800 select-none">
              Glosario · {r.glosario.length} términos
            </summary>
            <dl className="mt-3 divide-y divide-slate-100">
              {r.glosario.map((g, i) => (
                <div key={i} className="py-2.5 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-4">
                  <dt className="font-semibold text-slate-900">{g.termino}</dt>
                  <dd className="text-sm text-slate-600">{g.definicion}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </section>
    );
  }

  const quitar = <T,>(lista: T[], i: number) => lista.filter((_, j) => j !== i);

  return (
    <section className="tarjeta space-y-5 p-4">
      <h2 className="text-lg font-bold text-slate-900">Editar el rumbo</h2>

      <label className="block">
        <span className="etiqueta">Para qué existe la app</span>
        <textarea
          value={r.proposito}
          onChange={(e) => setR({ ...r, proposito: e.target.value })}
          rows={3}
          className="campo"
        />
      </label>

      <div>
        <span className="etiqueta">Objetivos</span>
        <div className="space-y-2">
          {r.objetivos.map((o, i) => (
            <div key={i} className="space-y-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="flex gap-2">
                <input
                  value={o.titulo}
                  onChange={(e) =>
                    setR({
                      ...r,
                      objetivos: r.objetivos.map((x, j) =>
                        j === i ? { ...x, titulo: e.target.value } : x,
                      ),
                    })
                  }
                  placeholder="Título"
                  className="campo font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setR({ ...r, objetivos: quitar(r.objetivos, i) })}
                  className="shrink-0 rounded-lg px-3 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                  aria-label={`Quitar el objetivo ${i + 1}`}
                >
                  Quitar
                </button>
              </div>
              <textarea
                value={o.detalle}
                onChange={(e) =>
                  setR({
                    ...r,
                    objetivos: r.objetivos.map((x, j) =>
                      j === i ? { ...x, detalle: e.target.value } : x,
                    ),
                  })
                }
                placeholder="Detalle (opcional)"
                rows={2}
                className="campo text-sm"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setR({ ...r, objetivos: [...r.objetivos, { titulo: "", detalle: "" }] })}
          className="mt-2 text-sm font-bold text-slate-700 underline underline-offset-4"
        >
          + Agregar objetivo
        </button>
      </div>

      <div>
        <span className="etiqueta">Glosario</span>
        <div className="space-y-2">
          {r.glosario.map((g, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:flex-row">
              <input
                value={g.termino}
                onChange={(e) =>
                  setR({
                    ...r,
                    glosario: r.glosario.map((x, j) =>
                      j === i ? { ...x, termino: e.target.value } : x,
                    ),
                  })
                }
                placeholder="Término"
                className="campo font-semibold sm:w-44"
              />
              <input
                value={g.definicion}
                onChange={(e) =>
                  setR({
                    ...r,
                    glosario: r.glosario.map((x, j) =>
                      j === i ? { ...x, definicion: e.target.value } : x,
                    ),
                  })
                }
                placeholder="Qué significa"
                className="campo"
              />
              <button
                type="button"
                onClick={() => setR({ ...r, glosario: quitar(r.glosario, i) })}
                className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
                aria-label={`Quitar ${g.termino || "el término"}`}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setR({ ...r, glosario: [...r.glosario, { termino: "", definicion: "" }] })}
          className="mt-2 text-sm font-bold text-slate-700 underline underline-offset-4"
        >
          + Agregar término
        </button>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={enviando}
          className="boton-primario"
        >
          {enviando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={cancelar}
          disabled={enviando}
          className="boton-secundario"
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guardarFondo } from "@/lib/acciones/admin";
import { FONDOS, type Fondo } from "@/lib/apariencia";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

/**
 * Elegir el fondo de la app. Cada opcion lleva una muestra con una tarjeta
 * blanca encima, que es como se ve en las pantallas de verdad. Se aplica de un
 * toque, para todos los usuarios.
 */
export function SelectorFondo({ actual }: { actual: Fondo }) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [elegido, setElegido] = useState<Fondo>(actual);

  async function elegir(fondo: Fondo) {
    if (fondo === elegido || enviando) return;
    const anterior = elegido;
    setElegido(fondo);
    const ok = await ejecutar(
      () => guardarFondo({ fondo }),
      () => router.refresh(),
    );
    if (!ok) setElegido(anterior);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="tarjeta p-4">
        <h2 className="text-base font-bold text-slate-900">Fondo de la app</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Se aplica al instante para todos: vos y los empleados. Solo cambia lo
          que se ve entre las tarjetas; los secaderos y los textos quedan
          iguales.
        </p>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <div className="grid gap-3 sm:grid-cols-2">
        {FONDOS.map((f) => {
          const activo = f.clave === elegido;
          return (
            <button
              key={f.clave}
              type="button"
              onClick={() => void elegir(f.clave)}
              disabled={enviando}
              aria-pressed={activo}
              className={`tarjeta overflow-hidden text-left transition hover:shadow-md ${
                activo ? "ring-2 ring-slate-900" : ""
              }`}
            >
              {/* La muestra: el fondo con una tarjeta encima. */}
              <div className={`fondo-${f.clave} h-28 p-4`}>
                <div className="h-full rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                  <div className="h-2.5 w-24 rounded bg-slate-300" />
                  <div className="mt-2 flex gap-1.5">
                    <span className="h-6 w-8 rounded-md bg-orange-500" />
                    <span className="h-6 w-8 rounded-md bg-blue-600" />
                    <span className="h-6 w-8 rounded-md bg-emerald-500" />
                  </div>
                </div>
              </div>
              <div className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-bold text-slate-900">{f.nombre}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{f.detalle}</p>
                </div>
                {activo && (
                  <span className="shrink-0 rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                    {enviando ? "Guardando…" : "En uso"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

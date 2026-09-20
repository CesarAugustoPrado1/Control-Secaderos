"use client";

import { useMemo, useState } from "react";
import type { MovimientoVista } from "@/lib/consultas";
import { hora, numero } from "@/lib/formato";
import { MarcasSecadero } from "@/components/marcas-secadero";
import { ChipTipo } from "@/components/ui";

/**
 * Lo hecho en el periodo, en la propia pantalla del operario.
 *
 * Reemplaza a la lista de secaderos disponibles, que con ~250 unidades no era
 * una cola de trabajo sino un muro de scroll. Esto en cambio le confirma al
 * operario lo que ya hizo -y lo que hizo el compañero de turno-, que es lo que
 * evita cargar dos veces el mismo secadero.
 *
 * El dia lo elige el selector de arriba de la pantalla, que es el mismo que
 * cambia el plan: tener dos selectores de fecha distintos en una pantalla era
 * invitar a mirar el plan de un dia y lo hecho de otro.
 *
 * Dos maneras de mirarlo, como en el tablero:
 *
 *  - Por numero: secadero por secadero, en el orden en que fueron saliendo. Es
 *    la que contesta "este, ¿ya lo hice?", que es la pregunta de todo el dia.
 *  - Por modelo: cuanto se lleva hecho de cada uno. Es la que contesta "¿cuanto
 *    me falta de Laja?", que es la pregunta contra el plan.
 *
 * Por tipo no hace falta: el tipo ya se ve en cada fila, y saber cuantos
 * grandes y cuantos chicos se cargaron no cambia nada de lo que el puesto
 * decide.
 */

type Vista = "numero" | "modelo";

const VISTAS: [Vista, string][] = [
  ["numero", "Por número"],
  ["modelo", "Por modelo"],
];

export function Actividad({
  titulo,
  dia,
  movimientos,
  vacio,
}: {
  titulo: string;
  /** "Hoy", "Ayer", "lun 14/09": el dia que se esta mirando. */
  dia: string;
  movimientos: MovimientoVista[];
  vacio: string;
}) {
  const [vista, setVista] = useState<Vista>("numero");

  const totalPlacas = movimientos.reduce(
    (a, m) => a + m.lineas.reduce((b, l) => b + l.cantidad, 0),
    0,
  );
  const totalRotas = movimientos.reduce(
    (a, m) => a + m.lineas.reduce((b, l) => b + l.desperdicio, 0),
    0,
  );

  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-slate-900">
        {titulo} · {dia}
      </h2>

      {movimientos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          {vacio}
        </p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-500">
              {movimientos.length}{" "}
              {movimientos.length === 1 ? "secadero" : "secaderos"} ·{" "}
              {numero(totalPlacas)} placas
              {totalRotas > 0 && (
                <span className="font-semibold text-red-600">
                  {" "}
                  · {numero(totalRotas)} rotas
                </span>
              )}
            </p>

            <div
              role="tablist"
              aria-label="Cómo ver lo hecho"
              className="flex gap-1 rounded-lg bg-slate-100 p-1"
            >
              {VISTAS.map(([clave, etiqueta]) => (
                <button
                  key={clave}
                  type="button"
                  role="tab"
                  aria-selected={vista === clave}
                  onClick={() => setVista(clave)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    vista === clave
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>

          {vista === "numero" ? (
            <PorNumero movimientos={movimientos} />
          ) : (
            <PorModelo movimientos={movimientos} />
          )}
        </>
      )}
    </section>
  );
}

/** Secadero por secadero, en el orden en que salieron. */
function PorNumero({ movimientos }: { movimientos: MovimientoVista[] }) {
  return (
    <ul className="space-y-2">
      {movimientos.map((m, i) => {
        const placas = m.lineas.reduce((a, l) => a + l.cantidad, 0);
        const rotas = m.lineas.reduce((a, l) => a + l.desperdicio, 0);
        // La lista viene del mas viejo al mas nuevo, en el mismo orden en que
        // fueron saliendo del carrusel.
        const orden = i + 1;
        return (
          <li key={m.id} className="tarjeta flex items-start gap-3 p-3">
            <span className="w-7 shrink-0 pt-2.5 text-right text-sm font-bold tabular-nums text-slate-400">
              {orden}
            </span>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base font-bold tabular-nums text-slate-700">
              {m.secaderoNumero}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                <span>
                  {numero(placas)} placas
                  {rotas > 0 && (
                    <span className="ml-2 text-xs font-bold text-red-600">
                      −{numero(rotas)}
                    </span>
                  )}
                </span>
                {/* Snapshot del tipo al momento del movimiento, no el actual:
                    si al secadero le cambiaron el tipo despues, el historial
                    tiene que seguir diciendo la verdad. */}
                <ChipTipo
                  id={m.secaderoTipoId ?? 0}
                  nombre={m.secaderoTipoNombre}
                />
              </p>
              <p className="truncate text-xs text-slate-500">
                {m.lineas
                  .filter((l) => l.cantidad > 0)
                  .map((l) => `${l.productoNombre} (${numero(l.cantidad)})`)
                  .join(", ")}
              </p>
              {m.capacidad != null && (
                <MarcasSecadero
                  total={placas}
                  capacidad={m.capacidad}
                  productos={m.lineas.filter((l) => l.cantidad > 0).length}
                />
              )}
              <p className="text-xs text-slate-400">{m.usuarioNombre}</p>
            </div>

            <span className="shrink-0 text-xs tabular-nums text-slate-400">
              {hora(m.creadoEn)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type GrupoModelo = {
  nombre: string;
  placas: number;
  rotas: number;
  /** Los numeros donde aparecio, para ir a buscar uno sin cambiar de vista. */
  secaderos: number[];
};

/**
 * Cuanto se lleva hecho de cada modelo.
 *
 * Un secadero mezclado suma en cada modelo que tenga adentro, igual que en el
 * tablero: el secadero estuvo ocupado por los dos a la vez y repartirlo -medio
 * para cada uno- seria inventar un numero. Por eso la suma de los secaderos de
 * cada fila puede pasarse del total de arriba, y se avisa cuando pasa.
 */
function PorModelo({ movimientos }: { movimientos: MovimientoVista[] }) {
  const grupos = useMemo(() => {
    const m = new Map<string, GrupoModelo>();
    for (const mov of movimientos) {
      for (const l of mov.lineas) {
        // Una linea en cero en las dos columnas no es un modelo que paso por
        // el puesto: es una fila que quedo del formulario y no dice nada.
        if (l.cantidad === 0 && l.desperdicio === 0) continue;
        let g = m.get(l.productoNombre);
        if (!g) {
          g = { nombre: l.productoNombre, placas: 0, rotas: 0, secaderos: [] };
          m.set(l.productoNombre, g);
        }
        g.placas += l.cantidad;
        g.rotas += l.desperdicio;
        if (!g.secaderos.includes(mov.secaderoNumero)) {
          g.secaderos.push(mov.secaderoNumero);
        }
      }
    }
    return [...m.values()].sort(
      (a, b) => b.placas - a.placas || a.nombre.localeCompare(b.nombre, "es"),
    );
  }, [movimientos]);

  const mezclados = useMemo(
    () =>
      movimientos.filter(
        (m) => m.lineas.filter((l) => l.cantidad > 0).length > 1,
      ).length,
    [movimientos],
  );

  return (
    <>
      <ul className="space-y-2">
        {grupos.map((g) => (
          <li key={g.nombre} className="tarjeta p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-bold text-slate-900">
                {g.nombre}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xl font-bold tabular-nums text-slate-900">
                  {numero(g.secaderos.length)}
                </span>
                <span className="block text-xs text-slate-500">
                  {g.secaderos.length === 1 ? "secadero" : "secaderos"}
                </span>
              </span>
            </div>

            <p className="mt-0.5 text-sm text-slate-600">
              {numero(g.placas)} placas
              {g.rotas > 0 && (
                <span className="font-semibold text-red-600">
                  {" "}
                  · {numero(g.rotas)} rotas
                </span>
              )}
            </p>

            <div className="mt-2 flex flex-wrap gap-1">
              {[...g.secaderos]
                .sort((a, b) => a - b)
                .map((n) => (
                  <span
                    key={n}
                    className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700"
                  >
                    {n}
                  </span>
                ))}
            </div>
          </li>
        ))}
      </ul>

      {mezclados > 0 && (
        <p className="mt-2 px-1 text-xs text-slate-500">
          {mezclados === 1
            ? "Hay 1 secadero con más de un modelo adentro y aparece en cada uno"
            : `Hay ${mezclados} secaderos con más de un modelo adentro y aparecen en cada uno`}
          , así que la suma de los secaderos de cada fila da más que el total.
        </p>
      )}
    </>
  );
}

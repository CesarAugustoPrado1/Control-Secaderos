"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { MovimientoVista } from "@/lib/consultas";
import type { TipoMovimiento } from "@/lib/db/schema";
import { COLOR_MOVIMIENTO, ETIQUETA_MOVIMIENTO_CORTA } from "@/lib/estados";
import { hora, numero } from "@/lib/formato";
import { MarcasSecadero } from "@/components/marcas-secadero";
import { ChipTipo, Modelos } from "@/components/ui";

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
 *
 * Es tambien donde se corrige: cada movimiento propio que todavia se puede
 * tocar lleva su boton, y lo ya corregido muestra lo que decia antes. La
 * regla de quien y hasta cuando vive en lib/correccion.ts; esta lista solo
 * recibe los ids que el servidor ya habilito.
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
  corregibles = [],
  volverA,
  mixta = false,
  sinTitulo = false,
}: {
  titulo: string;
  /** "Hoy", "Ayer", "lun 14/09": el dia que se esta mirando. */
  dia: string;
  movimientos: MovimientoVista[];
  vacio: string;
  /** Ids que este usuario puede corregir ahora. Ver `corregiblesPara`. */
  corregibles?: number[];
  /** A que pantalla vuelve el operario despues de corregir. */
  volverA?: string;
  /**
   * La lista junta movimientos de distinto tipo -el horno: entradas, salidas y
   * secados al sol-. Cada fila lleva su tipo, y el total no suma placas: sumar
   * lo que entro con lo que salio no es ningun numero. Tampoco hay vista por
   * modelo, por la misma razon.
   */
  mixta?: boolean;
  /** Para cuando la lista va adentro de algo que ya tiene titulo. */
  sinTitulo?: boolean;
}) {
  const [vista, setVista] = useState<Vista>("numero");
  const habilitados = useMemo(() => new Set(corregibles), [corregibles]);

  const totalPlacas = movimientos.reduce(
    (a, m) => a + m.lineas.reduce((b, l) => b + l.cantidad, 0),
    0,
  );
  const totalRotas = movimientos.reduce(
    (a, m) => a + m.lineas.reduce((b, l) => b + l.desperdicio, 0),
    0,
  );

  const porTipo = useMemo(() => {
    const m = new Map<TipoMovimiento, number>();
    for (const mov of movimientos) m.set(mov.tipo, (m.get(mov.tipo) ?? 0) + 1);
    return [...m.entries()];
  }, [movimientos]);

  return (
    <section>
      {!sinTitulo && (
        <h2 className="mb-3 text-base font-bold text-slate-900">
          {titulo} · {dia}
        </h2>
      )}

      {movimientos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          {vacio}
        </p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            {mixta ? (
              <p className="text-sm text-slate-500">
                {porTipo
                  .map(([tipo, n]) => `${n} ${ETIQUETA_MOVIMIENTO_CORTA[tipo].toLowerCase()}`)
                  .join(" · ")}
                {totalRotas > 0 && (
                  <span className="font-semibold text-red-600">
                    {" "}
                    · {numero(totalRotas)} rotas
                  </span>
                )}
              </p>
            ) : (
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
            )}

            {!mixta && (
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
            )}
          </div>

          {vista === "numero" || mixta ? (
            <PorNumero
              movimientos={movimientos}
              habilitados={habilitados}
              volverA={volverA}
              mixta={mixta}
            />
          ) : (
            <PorModelo movimientos={movimientos} />
          )}
        </>
      )}
    </section>
  );
}

/** Secadero por secadero, en el orden en que salieron. */
function PorNumero({
  movimientos,
  habilitados,
  volverA,
  mixta,
}: {
  movimientos: MovimientoVista[];
  habilitados: Set<number>;
  volverA?: string;
  mixta: boolean;
}) {
  return (
    <ul className="space-y-2">
      {movimientos.map((m, i) => {
        const placas = m.lineas.reduce((a, l) => a + l.cantidad, 0);
        const rotas = m.lineas.reduce((a, l) => a + l.desperdicio, 0);
        const cargados = m.lineas.filter((l) => l.cantidad > 0);
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
              {mixta && (
                <span className={`chip mb-1 ${COLOR_MOVIMIENTO[m.tipo]}`}>
                  {ETIQUETA_MOVIMIENTO_CORTA[m.tipo]}
                </span>
              )}
              <Modelos nombres={cargados.map((l) => l.productoNombre)} />

              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                <span className="tabular-nums">{numero(placas)} placas</span>
                {rotas > 0 && (
                  <span className="font-bold text-red-600">
                    · −{numero(rotas)} rotas
                  </span>
                )}
                {/* El desglose solo cuando hay mas de un modelo: con uno solo
                    repetiria el nombre de arriba y el total de al lado. */}
                {cargados.length > 1 && (
                  <span className="tabular-nums">
                    ·{" "}
                    {cargados
                      .map((l) => `${l.productoNombre} ${numero(l.cantidad)}`)
                      .join(", ")}
                  </span>
                )}
                {/* Snapshot del tipo al momento del movimiento, no el actual:
                    si al secadero le cambiaron el tipo despues, el historial
                    tiene que seguir diciendo la verdad. */}
                <ChipTipo
                  id={m.secaderoTipoId ?? 0}
                  nombre={m.secaderoTipoNombre}
                />
              </p>

              {m.capacidad != null && (
                <MarcasSecadero
                  total={placas}
                  capacidad={m.capacidad}
                  productos={cargados.length}
                />
              )}
              {m.corrige && <MarcaCorregido antes={m.corrige} placas={placas} rotas={rotas} />}
              <p className="text-[11px] text-slate-400">{m.usuarioNombre}</p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <span className="text-[11px] tabular-nums text-slate-400">
                {hora(m.creadoEn)}
              </span>
              {habilitados.has(m.id) && (
                <Link
                  href={`/corregir/${m.id}${volverA ? `?volver=${encodeURIComponent(volverA)}` : ""}`}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  Corregir
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Lo que decia el movimiento antes de corregirse: "antes 36 placas".
 *
 * Va a la vista en la lista del dia, y no solo en el historial del admin, para
 * que la correccion sea creible de un vistazo. Un numero que cambio sin dejar
 * rastro es lo que hace desconfiar de todos los demas.
 */
function MarcaCorregido({
  antes,
  placas,
  rotas,
}: {
  antes: NonNullable<MovimientoVista["corrige"]>;
  placas: number;
  rotas: number;
}) {
  const cambios: string[] = [];
  if (antes.placas !== placas) cambios.push(`${numero(antes.placas)} placas`);
  if (antes.rotas !== rotas) {
    cambios.push(
      antes.rotas === 0
        ? "sin rotas"
        : `${numero(antes.rotas)} ${antes.rotas === 1 ? "rota" : "rotas"}`,
    );
  }
  return (
    <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-900 ring-1 ring-amber-200">
      <strong className="font-bold">Corregido</strong>
      {cambios.length > 0 && <> · antes {cambios.join(" y ")}</>}
      {antes.motivo && <> · “{antes.motivo}”</>}
      {antes.por && <span className="text-amber-700"> ({antes.por})</span>}
    </p>
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

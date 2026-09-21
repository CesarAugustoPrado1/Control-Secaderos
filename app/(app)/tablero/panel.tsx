"use client";

import { useMemo, useState } from "react";
import type { SecaderoVista } from "@/lib/consultas";
import type { Estado } from "@/lib/db/schema";
import {
  COLOR_ESTADO,
  ORDEN_ESTADOS,
  TITULO_ESTADO,
  colorTipo,
} from "@/lib/estados";
import { duracion, minutosDesde, numero } from "@/lib/formato";
import { ChipEstado, ChipTipo, Modelos } from "@/components/ui";
import { MarcasSecadero } from "@/components/marcas-secadero";

/**
 * Tablero: la foto del piso de planta, agrupada de tres maneras.
 *
 * Con ~250 unidades no se listan todas de entrada -seria un muro de scroll-
 * pero cada contador tiene que ser una puerta a su detalle, no un numero
 * muerto: tocarlo abre la lista de los secaderos que lo componen.
 *
 * Las tres vistas responden preguntas distintas. "Por estado" es como viene el
 * dia. "Por tipo" es cuanta capacidad instalada hay de cada clase y donde esta
 * parada. "Por modelo" es que se esta produciendo ahora mismo.
 */

type Vista = "estado" | "tipo" | "modelo";

const VISTAS: { clave: Vista; etiqueta: string }[] = [
  { clave: "estado", etiqueta: "Por estado" },
  { clave: "tipo", etiqueta: "Por tipo" },
  { clave: "modelo", etiqueta: "Por modelo" },
];

/**
 * Un secadero vacio no tiene modelo adentro, asi que en la vista por modelo esa
 * columna no existe. No es un cero: es una pregunta que no se puede hacer.
 */
const ESTADOS_CON_CARGA: Estado[] = ORDEN_ESTADOS.filter((e) => e !== "vacio");

type Grupo = {
  id: number;
  nombre: string;
  /** Secaderos del grupo. En la vista por modelo, los que lo tienen adentro. */
  total: number;
  placas: number;
  porEstado: Record<Estado, number>;
};

const cero = (): Record<Estado, number> => ({
  vacio: 0,
  humedo: 0,
  horno: 0,
  seco: 0,
});

export function PanelTablero({
  secaderos,
  capacidadHorno,
}: {
  secaderos: SecaderoVista[];
  capacidadHorno: number;
}) {
  const [vista, setVista] = useState<Vista>("estado");
  const [estado, setEstado] = useState<Estado | null>(null);
  const [grupo, setGrupo] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const { conteo, placas } = useMemo(() => {
    const conteo = cero();
    const placas = cero();
    for (const s of secaderos) {
      conteo[s.estado]++;
      placas[s.estado] += s.total;
    }
    return { conteo, placas };
  }, [secaderos]);

  /** Los tipos van en orden de id: es estable y coincide con el color del chip. */
  const porTipo = useMemo(() => {
    const m = new Map<number, Grupo>();
    for (const s of secaderos) {
      let g = m.get(s.tipoId);
      if (!g) {
        g = {
          id: s.tipoId,
          nombre: s.tipoNombre,
          total: 0,
          placas: 0,
          porEstado: cero(),
        };
        m.set(s.tipoId, g);
      }
      g.total++;
      g.placas += s.total;
      g.porEstado[s.estado]++;
    }
    return [...m.values()].sort((a, b) => a.id - b.id);
  }, [secaderos]);

  /**
   * Un secadero mezclado suma en cada modelo que tenga adentro, asi que la suma
   * de los totales puede pasarse de la cantidad de secaderos. Es la unica
   * lectura honesta: el secadero esta ocupado por los dos modelos a la vez y
   * repartirlo -medio para cada uno- seria inventar un numero.
   */
  const porModelo = useMemo(() => {
    const m = new Map<number, Grupo>();
    for (const s of secaderos) {
      for (const c of s.contenido) {
        let g = m.get(c.productoId);
        if (!g) {
          g = {
            id: c.productoId,
            nombre: c.nombre,
            total: 0,
            placas: 0,
            porEstado: cero(),
          };
          m.set(c.productoId, g);
        }
        g.total++;
        g.placas += c.cantidad;
        g.porEstado[s.estado]++;
      }
    }
    return [...m.values()].sort(
      (a, b) => b.placas - a.placas || a.nombre.localeCompare(b.nombre, "es"),
    );
  }, [secaderos]);

  const mezclados = useMemo(
    () => secaderos.filter((s) => s.contenido.length > 1).length,
    [secaderos],
  );

  const lista = useMemo(() => {
    const q = busqueda.trim();
    return secaderos
      .filter((s) => {
        if (estado && s.estado !== estado) return false;
        if (grupo !== null) {
          if (vista === "tipo" && s.tipoId !== grupo) return false;
          if (
            vista === "modelo" &&
            !s.contenido.some((c) => c.productoId === grupo)
          ) {
            return false;
          }
        }
        if (q && !String(s.numero).startsWith(q)) return false;
        return true;
      })
      .sort((a, b) =>
        // Dentro de un estado, lo mas viejo primero: es lo que espera hace mas.
        estado
          ? a.estadoDesde.getTime() - b.estadoDesde.getTime()
          : a.numero - b.numero,
      );
  }, [secaderos, vista, estado, grupo, busqueda]);

  const hayFiltro = estado !== null || grupo !== null || busqueda.trim() !== "";

  const grupos = vista === "tipo" ? porTipo : porModelo;
  const nombreGrupo =
    grupo === null ? null : (grupos.find((g) => g.id === grupo)?.nombre ?? null);

  function cambiarVista(v: Vista) {
    setVista(v);
    setEstado(null);
    setGrupo(null);
  }

  /** Tocar dos veces lo mismo lo apaga: el contador es un interruptor. */
  function alternar(idGrupo: number | null, e: Estado | null) {
    const igual = grupo === idGrupo && estado === e;
    setGrupo(igual ? null : idGrupo);
    setEstado(igual ? null : e);
  }

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Cómo agrupar los secaderos"
        className="flex gap-1 rounded-xl bg-slate-100 p-1"
      >
        {VISTAS.map((v) => (
          <button
            key={v.clave}
            type="button"
            role="tab"
            aria-selected={vista === v.clave}
            onClick={() => cambiarVista(v.clave)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              vista === v.clave
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {v.etiqueta}
          </button>
        ))}
      </div>

      {vista === "estado" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ORDEN_ESTADOS.map((e) => {
            const color = COLOR_ESTADO[e];
            const activo = estado === e;
            return (
              <button
                key={e}
                type="button"
                onClick={() => alternar(null, activo ? null : e)}
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
      ) : (
        <div className="space-y-2.5">
          {grupos.map((g) => (
            <FilaGrupo
              key={g.id}
              grupo={g}
              vista={vista}
              seleccionado={grupo === g.id}
              estadoSeleccionado={grupo === g.id ? estado : null}
              alTocar={(e) => alternar(g.id, e)}
            />
          ))}

          {grupos.length === 0 && (
            <p className="tarjeta py-8 text-center text-sm text-slate-400">
              {vista === "modelo"
                ? "No hay ningún secadero cargado en este momento."
                : "Todavía no hay tipos de secadero con unidades activas."}
            </p>
          )}

          {vista === "modelo" && mezclados > 0 && (
            <p className="px-1 text-xs text-slate-500">
              {mezclados === 1
                ? "Hay 1 secadero con más de un modelo adentro y aparece en cada uno"
                : `Hay ${mezclados} secaderos con más de un modelo adentro y aparecen en cada uno`}
              , así que la suma de los totales da más que la cantidad de
              secaderos.
            </p>
          )}

          {vista === "modelo" && (
            <p className="px-1 text-xs text-slate-400">
              Los vacíos no figuran acá: un secadero vacío no tiene modelo.
              Están en <strong className="font-semibold">Por estado</strong>.
            </p>
          )}
        </div>
      )}

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

        {(estado || grupo !== null) && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-700">
              {[nombreGrupo, estado ? TITULO_ESTADO[estado] : null]
                .filter(Boolean)
                .join(" · ")}{" "}
              · {lista.length}
            </p>
            <button
              type="button"
              onClick={() => {
                setEstado(null);
                setGrupo(null);
              }}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300"
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
                      {/* Numero y modelo al mismo tamano; los chips, las
                          placas y el tiempo son contexto. Un vacio no tiene
                          modelo, asi que ahi el renglon grande dice eso. */}
                      <Modelos
                        nombres={s.contenido.map((c) => c.nombre)}
                        vacio={s.estado === "vacio" ? "Vacío" : "Sin placas"}
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {!estado && <ChipEstado estado={s.estado} />}
                        <ChipTipo id={s.tipoId} nombre={s.tipoNombre} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {s.total > 0
                          ? `${numero(s.total)} placas`
                          : "sin placas"}{" "}
                        · hace {duracion(minutosDesde(s.estadoDesde))}
                        {/* El desglose solo cuando hay mezcla: con un modelo
                            solo repetiria el nombre de arriba. */}
                        {s.contenido.length > 1 &&
                          ` · ${s.contenido
                            .map((c) => `${c.nombre} ${numero(c.cantidad)}`)
                            .join(", ")}`}
                      </p>
                      <MarcasSecadero
                        total={s.total}
                        capacidad={s.capacidad}
                        productos={s.contenido.length}
                      />
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

/**
 * Una fila por tipo o por modelo: el total a la izquierda y el desglose por
 * estado a la derecha, cada numero tocable para abrir su lista.
 */
function FilaGrupo({
  grupo,
  vista,
  seleccionado,
  estadoSeleccionado,
  alTocar,
}: {
  grupo: Grupo;
  vista: Vista;
  seleccionado: boolean;
  estadoSeleccionado: Estado | null;
  alTocar: (estado: Estado | null) => void;
}) {
  const estados = vista === "modelo" ? ESTADOS_CON_CARGA : ORDEN_ESTADOS;

  return (
    <div
      className={`tarjeta p-3 transition ${
        seleccionado ? "ring-2 ring-slate-900" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => alTocar(null)}
        aria-pressed={seleccionado && estadoSeleccionado === null}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          {vista === "tipo" ? (
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${colorTipo(grupo.id)}`}
            >
              {grupo.nombre}
            </span>
          ) : (
            <span className="truncate text-sm font-bold text-slate-900">
              {grupo.nombre}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-xl font-bold tabular-nums text-slate-900">
            {numero(grupo.total)}
          </span>
          <span className="block text-xs text-slate-500">
            {numero(grupo.placas)} placas
          </span>
        </span>
      </button>

      {/* Las clases van literales y no armadas con la cantidad: Tailwind las
          descubre leyendo el archivo, y una interpolada no llega al CSS. */}
      <div
        className={`mt-2 grid gap-1.5 ${
          vista === "modelo" ? "grid-cols-3" : "grid-cols-4"
        }`}
      >
        {estados.map((e) => {
          const n = grupo.porEstado[e];
          const activo = seleccionado && estadoSeleccionado === e;
          return (
            <button
              key={e}
              type="button"
              onClick={() => alTocar(e)}
              aria-pressed={activo}
              disabled={n === 0}
              className={`rounded-lg px-1.5 py-1.5 text-center transition active:scale-95 disabled:opacity-40 ${
                activo
                  ? "bg-slate-900 text-white"
                  : n > 0
                    ? COLOR_ESTADO[e].fondo
                    : "bg-slate-50"
              }`}
            >
              <span className="block text-base font-bold tabular-nums">
                {n}
              </span>
              <span
                className={`block text-[10px] leading-tight font-semibold ${
                  activo ? "text-slate-300" : "text-slate-500"
                }`}
              >
                {TITULO_ESTADO[e]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

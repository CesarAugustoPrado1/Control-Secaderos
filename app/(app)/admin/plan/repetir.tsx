"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { repetirDia, revisarDestinos } from "@/lib/acciones/plan";
import { esFecha, etiquetaDia, sumarDias } from "@/lib/rangos";
import { useAccion } from "@/components/usar-accion";
import { Plegable } from "@/components/plegable";
import { Aviso } from "@/components/ui";

/**
 * Repetir el dia que se esta mirando en otros dias: mañana, pasado, el resto
 * de la semana o una fecha suelta.
 *
 * Copia el dia completo -carrusel con sus moldes, notas del horno y
 * paletizado con sus palets-, que es lo que se quiere cuando "mañana es igual
 * que hoy" o cuando se vuelve a un objetivo de hace unas semanas: se navega
 * hasta ese dia y se lo repite.
 *
 * Si algun dia elegido ya tiene algo cargado, se pregunta antes de pisarlo,
 * dia por dia.
 */
export function RepetirDia({
  origen,
  hoy,
  contenido,
}: {
  origen: string;
  hoy: string;
  /** Lo que tiene el dia de origen, en renglones cortos. Vacio = nada. */
  contenido: string[];
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  const inicio = origen >= hoy ? sumarDias(origen, 1) : hoy;
  const proximos = Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));

  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [otra, setOtra] = useState("");
  /** Dias elegidos que ya tienen algo: null hasta que se revisa. */
  const [ocupados, setOcupados] = useState<string[] | null>(null);
  const [pisar, setPisar] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);

  const lista = [...elegidos].sort();
  const aCopiar = ocupados ? lista.filter((f) => !ocupados.includes(f) || pisar.has(f)) : lista;

  function alternar(f: string) {
    setError(null);
    setAviso(null);
    setOcupados(null);
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(f)) s.delete(f);
      else s.add(f);
      return s;
    });
  }

  async function revisar() {
    let conAlgo = null as string[] | null;
    const ok = await ejecutar(
      () => revisarDestinos(lista),
      (d) => {
        conAlgo = d;
      },
    );
    if (!ok || !conAlgo) return;
    setPisar(new Set());
    // Si ninguno tiene nada no hay nada que preguntar: se copia directo.
    if ((conAlgo as string[]).length === 0) await copiar([], lista);
    else setOcupados(conAlgo);
  }

  async function copiar(pisarDias: string[], destinos: string[]) {
    if (destinos.length === 0) {
      setError("No quedó ningún día para copiar.");
      return;
    }
    await ejecutar(
      () => repetirDia({ origen, destinos, pisar: pisarDias }),
      ({ dias, omitidos }) => {
        setAviso(
          `Copiado a ${dias} ${dias === 1 ? "día" : "días"}.` +
            (omitidos.length
              ? ` No se copiaron modelos suspendidos: ${omitidos.join(", ")}.`
              : ""),
        );
        setElegidos(new Set());
        setOcupados(null);
        router.refresh();
      },
    );
  }

  if (contenido.length === 0) return null;

  return (
    <Plegable
      id="plan-repetir"
      titulo={`Repetir ${etiquetaDia(origen)} en otros días`}
      resumen={
        <span className="text-xs text-slate-500">
          Copia el día completo: {contenido.join(" · ")}
        </span>
      }
    >
      <p className="text-xs text-slate-500">
        Cada día elegido queda igual a este. Las explicaciones de desvío no se
        copian.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {proximos.map((f) => (
          <button
            key={f}
            type="button"
            disabled={enviando}
            onClick={() => alternar(f)}
            className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
              elegidos.has(f)
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
            }`}
          >
            {elegidos.has(f) ? "✓ " : ""}
            {etiquetaDia(f)}
            {f === hoy && " (hoy)"}
          </button>
        ))}
        <button
          type="button"
          disabled={enviando}
          onClick={() => {
            setOcupados(null);
            setAviso(null);
            setElegidos((prev) => {
              const todos = proximos.every((f) => prev.has(f));
              const s = new Set(prev);
              for (const f of proximos) {
                if (todos) s.delete(f);
                else s.add(f);
              }
              return s;
            });
          }}
          className="rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-700 underline"
        >
          {proximos.every((f) => elegidos.has(f)) ? "Ninguno" : "Los 7"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="etiqueta">Otra fecha</span>
          <input
            type="date"
            className="campo py-2"
            min={hoy}
            value={otra}
            disabled={enviando}
            onChange={(e) => setOtra(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={enviando || !esFecha(otra) || otra < hoy || otra === origen}
          onClick={() => {
            if (!elegidos.has(otra)) alternar(otra);
            setOtra("");
          }}
          className="boton-secundario text-sm"
        >
          Agregar
        </button>
      </div>

      {lista.some((f) => !proximos.includes(f)) && (
        <p className="mt-2 text-xs text-slate-600">
          También:{" "}
          {lista
            .filter((f) => !proximos.includes(f))
            .map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => alternar(f)}
                className="mr-1.5 font-semibold underline"
                title="Quitar"
              >
                {etiquetaDia(f)} ✕
              </button>
            ))}
        </p>
      )}

      {ocupados && ocupados.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-300">
          <p className="text-xs font-bold text-amber-900">
            Estos días ya tienen algo cargado. Tildá los que querés pisar; los
            demás se dejan como están.
          </p>
          {ocupados.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={pisar.has(f)}
                disabled={enviando}
                onChange={() =>
                  setPisar((prev) => {
                    const s = new Set(prev);
                    if (s.has(f)) s.delete(f);
                    else s.add(f);
                    return s;
                  })
                }
              />
              Pisar {etiquetaDia(f)}
            </label>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {aviso && !error && (
        <div className="mt-3">
          <Aviso tono="exito">{aviso}</Aviso>
        </div>
      )}

      <button
        type="button"
        disabled={enviando || lista.length === 0}
        onClick={() =>
          void (ocupados ? copiar([...pisar], aCopiar) : revisar())
        }
        className="boton-primario mt-3 w-full"
      >
        {enviando
          ? "Copiando…"
          : lista.length === 0
            ? "Elegí los días"
            : ocupados
              ? `Copiar a ${aCopiar.length} ${aCopiar.length === 1 ? "día" : "días"}`
              : `Repetir en ${lista.length} ${lista.length === 1 ? "día" : "días"}`}
      </button>
    </Plegable>
  );
}

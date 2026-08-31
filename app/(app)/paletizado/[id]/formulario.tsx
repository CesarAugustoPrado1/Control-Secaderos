"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { descargarSecadero, devolverAlHorno } from "@/lib/acciones/flujo";
import type { LineaContenido } from "@/lib/consultas";
import { numero } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import {
  EditorRoturas,
  convertirRoturas,
  validarRoturas,
  type MapaRoturas,
  type Motivo,
} from "@/components/editor-roturas";

export function FormularioDescarga({
  secaderoId,
  secaderoNumero,
  contenido,
  motivos,
}: {
  secaderoId: number;
  secaderoNumero: number;
  contenido: LineaContenido[];
  motivos: Motivo[];
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  const [roturas, setRoturas] = useState<MapaRoturas>({});
  const [nota, setNota] = useState("");
  const [verDevolucion, setVerDevolucion] = useState(false);
  const [notaDevolucion, setNotaDevolucion] = useState("");

  const opciones = useMemo(
    () =>
      contenido.map((c) => ({
        productoId: c.productoId,
        nombre: c.nombre,
        tope: c.cantidad,
      })),
    [contenido],
  );

  const totalEnSecadero = contenido.reduce((a, c) => a + c.cantidad, 0);
  const totalRotas = Object.values(roturas).reduce(
    (a, r) => a + (r.cantidad || 0),
    0,
  );
  const aProductoTerminado = totalEnSecadero - totalRotas;

  async function confirmar() {
    const problema = validarRoturas(roturas, opciones);
    if (problema) return setError(problema);

    await ejecutar(
      () =>
        descargarSecadero({
          secaderoId,
          roturas: convertirRoturas(roturas),
          nota: nota.trim() || undefined,
        }),
      () => {
        router.push("/paletizado");
        router.refresh();
      },
    );
  }

  async function devolver() {
    const problema = validarRoturas(roturas, opciones);
    if (problema) return setError(problema);

    await ejecutar(
      () =>
        devolverAlHorno({
          secaderoId,
          roturas: convertirRoturas(roturas),
          nota: notaDevolucion.trim() || undefined,
        }),
      () => {
        router.push("/paletizado");
        router.refresh();
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="tarjeta p-4">
        <span className="etiqueta">Contenido del secadero</span>
        <ul className="divide-y divide-slate-100">
          {contenido.map((c) => {
            const rotas = roturas[c.productoId]?.cantidad ?? 0;
            return (
              <li
                key={c.productoId}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                  {c.nombre}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  <span className="font-bold text-slate-900">
                    {numero(c.cantidad - rotas)}
                  </span>
                  {rotas > 0 && (
                    <span className="ml-1.5 font-semibold text-red-600">
                      −{rotas}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="tarjeta p-4">
        <EditorRoturas
          opciones={opciones}
          motivos={motivos}
          valor={roturas}
          alCambiar={setRoturas}
          deshabilitado={enviando}
        />
      </div>

      <div className="tarjeta p-4">
        <label htmlFor="nota" className="etiqueta">
          Nota (opcional)
        </label>
        <textarea
          id="nota"
          className="campo min-h-20"
          value={nota}
          maxLength={500}
          disabled={enviando}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Algo para dejar asentado…"
        />
      </div>

      {/* Resumen explicito de a donde va cada placa, antes de confirmar. */}
      <div className="tarjeta divide-y divide-slate-100 p-4">
        <div className="flex items-baseline justify-between pb-2">
          <span className="text-sm font-medium text-slate-600">
            A producto terminado
          </span>
          <span className="text-xl font-bold tabular-nums text-emerald-600">
            {numero(aProductoTerminado)}
          </span>
        </div>
        <div className="flex items-baseline justify-between pt-2">
          <span className="text-sm font-medium text-slate-600">
            A desperdicio
          </span>
          <span
            className={`text-xl font-bold tabular-nums ${
              totalRotas > 0 ? "text-red-600" : "text-slate-300"
            }`}
          >
            {numero(totalRotas)}
          </span>
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}

      <button
        type="button"
        onClick={() => void confirmar()}
        disabled={enviando}
        className="boton w-full bg-violet-600 text-white hover:bg-violet-700"
      >
        {enviando
          ? "Guardando…"
          : `Descargar secadero ${secaderoNumero} y vaciarlo`}
      </button>

      {/* Salida alternativa: el secadero no seco bien y vuelve a la cola del
          horno. Va separada y en tono de advertencia para que no se toque por
          error en lugar de descargar, que es la accion habitual. */}
      <div className="tarjeta border-t-4 border-red-200 p-4">
        {!verDevolucion ? (
          <button
            type="button"
            onClick={() => setVerDevolucion(true)}
            disabled={enviando}
            className="text-sm font-semibold text-red-700 underline underline-offset-4"
          >
            El secadero no secó bien
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Vuelve a la cola del horno con sus{" "}
              <strong>{numero(aProductoTerminado)} placas</strong> y queda
              primero para la próxima hornada. Si marcaste roturas arriba, se
              descuentan igual.
            </p>

            <label className="block">
              <span className="etiqueta">¿Por qué? (opcional)</span>
              <input
                className="campo"
                value={notaDevolucion}
                maxLength={500}
                disabled={enviando}
                onChange={(e) => setNotaDevolucion(e.target.value)}
                placeholder="ej: húmedo en el centro"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void devolver()}
                disabled={enviando}
                className="boton bg-red-600 text-white hover:bg-red-700"
              >
                {enviando ? "Guardando…" : "Devolver al horno"}
              </button>
              <button
                type="button"
                onClick={() => setVerDevolucion(false)}
                disabled={enviando}
                className="boton-secundario"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { guardarPlan } from "@/lib/acciones/plan";
import type { Sector } from "@/lib/db/schema";
import type { ComparacionPlan } from "@/lib/plan";
import { numero } from "@/lib/formato";
import { etiquetaDia } from "@/lib/rangos";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

type Producto = { id: number; nombre: string };

const ETIQUETA_SECTOR: Record<Sector, string> = {
  carrusel: "Carrusel",
  paletizado: "Paletizado",
};

export function EditorPlan({
  fecha,
  sector,
  esPasado,
  productos,
  comparacion,
  semana,
  lineasSemana,
}: {
  fecha: string;
  sector: Sector;
  esPasado: boolean;
  productos: Producto[];
  comparacion: ComparacionPlan;
  semana: string[];
  /** Lo pedido en cada dia de la semana, para poder copiar de un toque. */
  lineasSemana: Record<string, Record<number, number>>;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  const [cantidades, setCantidades] = useState<Record<number, number>>(() =>
    Object.fromEntries(comparacion.lineas.map((l) => [l.productoId, l.pedidos])),
  );
  const [nota, setNota] = useState(comparacion.nota ?? "");
  const [aviso, setAviso] = useState<string | null>(null);

  const total = useMemo(
    () => Object.values(cantidades).reduce((a, n) => a + (n || 0), 0),
    [cantidades],
  );

  /** Lo hecho por producto, para mostrarlo al lado de lo pedido. */
  const hechoPorProducto = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of comparacion.lineas) m.set(l.productoId, l.hechos);
    return m;
  }, [comparacion.lineas]);

  function set(productoId: number, valor: number) {
    setError(null);
    setAviso(null);
    const limpio = Math.max(0, Math.floor(valor) || 0);
    setCantidades((prev) => {
      const sig = { ...prev, [productoId]: limpio };
      if (limpio === 0) delete sig[productoId];
      return sig;
    });
  }

  async function guardar() {
    await ejecutar(
      () =>
        guardarPlan({
          fecha,
          sector,
          lineas: Object.entries(cantidades).map(([productoId, secaderos]) => ({
            productoId: Number(productoId),
            secaderos,
          })),
          nota: nota.trim() || undefined,
        }),
      () => {
        setAviso(
          total === 0
            ? "Se borró el plan de ese día."
            : "Plan guardado.",
        );
        router.refresh();
      },
    );
  }

  return (
    <section className="tarjeta p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">
          {ETIQUETA_SECTOR[sector]} · {etiquetaDia(fecha)}
        </h2>
        <span className="text-sm font-bold tabular-nums text-slate-700">
          {numero(total)} secaderos
        </span>
      </div>

      {esPasado && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Es un día pasado. Si cambiás lo pedido, se borran las explicaciones de
          desvío que ya se hayan cargado, porque dejan de corresponder.
        </p>
      )}

      {/* Copiar de otro dia: cargar siete dias desde cero no lo hace nadie. */}
      <CopiarDeOtroDia
        fecha={fecha}
        semana={semana}
        lineasSemana={lineasSemana}
        alCopiar={(valores, origen) => {
          setCantidades(valores);
          setAviso(`Copiado de ${etiquetaDia(origen)}. Revisá y guardá.`);
        }}
      />

      <div className="mt-3 space-y-2">
        {productos.map((p) => {
          const pedido = cantidades[p.id] ?? 0;
          const hecho = hechoPorProducto.get(p.id) ?? 0;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-xl p-2.5 ring-1 ${
                pedido > 0 ? "bg-blue-50 ring-blue-200" : "bg-slate-50 ring-slate-200"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {p.nombre}
                </span>
                {hecho > 0 && (
                  <span className="block text-xs text-slate-500">
                    hechos: {numero(hecho)}
                  </span>
                )}
              </span>
              <button
                type="button"
                disabled={enviando || pedido === 0}
                onClick={() => set(p.id, pedido - 1)}
                className="h-11 w-11 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-30"
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={pedido === 0 ? "" : pedido}
                placeholder="0"
                disabled={enviando}
                onChange={(e) => set(p.id, Number(e.target.value))}
                className="h-11 w-16 rounded-lg border-0 bg-white text-center text-base font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                aria-label={`Secaderos de ${p.nombre}`}
              />
              <button
                type="button"
                disabled={enviando}
                onClick={() => set(p.id, pedido + 1)}
                className="h-11 w-11 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300"
              >
                +
              </button>
            </div>
          );
        })}
        {productos.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">
            No hay productos activos para pedir.
          </p>
        )}
      </div>

      <label className="mt-3 block">
        <span className="etiqueta">Nota para el sector (opcional)</span>
        <input
          className="campo"
          value={nota}
          maxLength={500}
          disabled={enviando}
          onChange={(e) => setNota(e.target.value)}
          placeholder="ej: priorizar Ekos para el pedido del viernes"
        />
      </label>

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
        onClick={() => void guardar()}
        disabled={enviando}
        className="boton-primario mt-3 w-full"
      >
        {enviando
          ? "Guardando…"
          : total === 0
            ? "Guardar (deja el día sin plan)"
            : `Guardar plan de ${numero(total)} secaderos`}
      </button>
    </section>
  );
}

/**
 * Copia lo pedido en otro dia del mismo sector, de un toque.
 *
 * Solo se ofrecen los dias que tienen algo cargado: un boton que copia un plan
 * vacio no sirve para nada y ensucia la lista.
 */
function CopiarDeOtroDia({
  fecha,
  semana,
  lineasSemana,
  alCopiar,
}: {
  fecha: string;
  semana: string[];
  lineasSemana: Record<string, Record<number, number>>;
  alCopiar: (valores: Record<number, number>, origen: string) => void;
}) {
  const conPlan = semana.filter(
    (f) => f !== fecha && Object.keys(lineasSemana[f] ?? {}).length > 0,
  );
  if (conPlan.length === 0) return null;

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
      <p className="text-xs font-semibold text-slate-600">Copiar de otro día</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {conPlan.map((f) => {
          const total = Object.values(lineasSemana[f]).reduce((a, n) => a + n, 0);
          return (
            <button
              key={f}
              type="button"
              onClick={() => alCopiar({ ...lineasSemana[f] }, f)}
              className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
            >
              {etiquetaDia(f)}
              <span className="ml-1 text-slate-400">({total})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cargarSecadero } from "@/lib/acciones/flujo";
import { numero } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

type Producto = { id: number; nombre: string };

export function FormularioCarga({
  secaderoId,
  secaderoNumero,
  capacidad,
  modelos,
}: {
  secaderoId: number;
  secaderoNumero: number;
  capacidad: number;
  modelos: Producto[];
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  /**
   * El caso normal es secadero completo con un solo producto, asi que arranca
   * tildado: el operario toca el producto y ya queda la capacidad entera.
   * El producto NO viene preseleccionado a proposito: elegirlo siempre a mano
   * es lo que evita cargar la tanda equivocada.
   */
  const [completo, setCompleto] = useState(true);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [nota, setNota] = useState("");
  const [filtro, setFiltro] = useState("");

  const total = useMemo(
    () => Object.values(cantidades).reduce((a, n) => a + (n || 0), 0),
    [cantidades],
  );
  const restante = capacidad - total;

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return modelos;
    return modelos.filter((m) => m.nombre.toLowerCase().includes(q));
  }, [modelos, filtro]);

  /** En modo completo, tocar un producto le asigna toda la capacidad. */
  function elegirUnico(id: number) {
    setError(null);
    setCantidades(cantidades[id] === capacidad ? {} : { [id]: capacidad });
  }

  function setCantidad(id: number, valor: number) {
    setError(null);
    const limpio = Math.max(0, Math.floor(valor) || 0);
    setCantidades((prev) => {
      const siguiente = { ...prev, [id]: limpio };
      if (limpio === 0) delete siguiente[id];
      return siguiente;
    });
  }

  function alternarCompleto() {
    setError(null);
    setCompleto((antes) => {
      const ahora = !antes;
      if (ahora) {
        // Al volver a completo, si habia un solo producto se lleva la capacidad
        // entera; si habia varios, se limpia para que elija de nuevo.
        const conCarga = Object.keys(cantidades).filter(
          (k) => cantidades[Number(k)] > 0,
        );
        setCantidades(
          conCarga.length === 1 ? { [Number(conCarga[0])]: capacidad } : {},
        );
      }
      return ahora;
    });
  }

  async function confirmar() {
    if (total === 0) {
      return setError(
        completo
          ? "Elegí el producto que va en el secadero."
          : "Cargá al menos un producto con cantidad.",
      );
    }
    if (total > capacidad) {
      return setError(
        `El secadero admite ${capacidad} placas y estás cargando ${total}.`,
      );
    }
    await ejecutar(
      () =>
        cargarSecadero({
          secaderoId,
          items: Object.entries(cantidades).map(([productoId, cantidad]) => ({
            productoId: Number(productoId),
            cantidad,
          })),
          nota: nota.trim() || undefined,
        }),
      () => {
        router.push("/carrusel");
        router.refresh();
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="tarjeta p-4">
        {/* Interruptor entre el caso tipico -uno solo, completo- y la carga
            mezclada con cantidades a mano. */}
        <button
          type="button"
          onClick={alternarCompleto}
          disabled={enviando}
          className={`flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 transition ${
            completo
              ? "bg-blue-50 ring-blue-300"
              : "bg-slate-50 ring-slate-200"
          }`}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold ring-2 transition ${
              completo
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-transparent ring-slate-300"
            }`}
            aria-hidden
          >
            ✓
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-slate-900">
              Secadero completo · {numero(capacidad)} placas
            </span>
            <span className="block text-xs text-slate-500">
              {completo
                ? "Tocá el producto y se carga la capacidad entera"
                : "Cargá a mano la cantidad de cada producto"}
            </span>
          </span>
        </button>

        <div className="mt-4 mb-2 flex items-baseline justify-between">
          <span className="etiqueta mb-0">
            {completo ? "¿Qué producto lleva?" : "Productos"}
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${
              total > capacidad ? "text-red-600" : "text-slate-700"
            }`}
          >
            {numero(total)} / {numero(capacidad)}
          </span>
        </div>

        <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all ${
              total > capacidad ? "bg-red-500" : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(100, (total / capacidad) * 100)}%` }}
          />
        </div>

        {modelos.length > 8 && (
          <input
            className="campo mb-3 py-2.5"
            placeholder="Buscar producto…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        )}

        <div className="space-y-2">
          {visibles.map((producto) => {
            const cantidad = cantidades[producto.id] ?? 0;
            const elegido = cantidad > 0;

            if (completo) {
              return (
                <button
                  key={producto.id}
                  type="button"
                  onClick={() => elegirUnico(producto.id)}
                  disabled={enviando}
                  className={`flex w-full items-center gap-3 rounded-xl p-3.5 text-left ring-1 transition active:scale-[0.99] ${
                    elegido
                      ? "bg-blue-50 ring-blue-300"
                      : "bg-slate-50 ring-slate-200"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ${
                      elegido
                        ? "bg-slate-900 text-white ring-slate-900"
                        : "bg-white text-transparent ring-slate-300"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-slate-800">
                    {producto.nombre}
                  </span>
                  {elegido && (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-blue-700">
                      {numero(capacidad)}
                    </span>
                  )}
                </button>
              );
            }

            return (
              <div
                key={producto.id}
                className={`flex items-center gap-2 rounded-xl p-2.5 ring-1 transition ${
                  elegido ? "bg-blue-50 ring-blue-200" : "bg-slate-50 ring-slate-200"
                }`}
              >
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                  {producto.nombre}
                </p>

                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={cantidad === 0 ? "" : cantidad}
                  placeholder="0"
                  disabled={enviando}
                  onChange={(e) => setCantidad(producto.id, Number(e.target.value))}
                  className="h-11 w-20 rounded-lg border-0 bg-white text-center text-base font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  aria-label={`Cantidad de ${producto.nombre}`}
                />

                {/* Completa lo que falta para llenar el secadero. */}
                <button
                  type="button"
                  disabled={enviando || restante <= 0}
                  onClick={() => setCantidad(producto.id, cantidad + restante)}
                  className="h-11 shrink-0 rounded-lg bg-white px-3 text-xs font-bold text-slate-600 ring-1 ring-slate-300 transition active:scale-95 disabled:opacity-30"
                  title="Completar la capacidad del secadero con este producto"
                >
                  +{restante > 0 ? restante : 0}
                </button>
              </div>
            );
          })}
          {visibles.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">
              Ningún producto coincide con “{filtro}”.
            </p>
          )}
        </div>
      </div>

      {/* Las roturas del carrusel no se cargan aca. El secadero siempre sale
          completo, asi que la placa rota nunca entro: se registra una sola vez,
          suelta, en la pantalla de Cargar. */}
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500 ring-1 ring-slate-200">
        Las placas rotas van en{" "}
        <strong className="text-slate-700">Roturas antes del secadero</strong>,
        en la pantalla anterior. Acá se carga sólo lo que entra al secadero.
      </p>

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

      {error && <Aviso>{error}</Aviso>}

      <button
        type="button"
        onClick={() => void confirmar()}
        disabled={enviando || total === 0}
        className="boton-primario w-full"
      >
        {enviando
          ? "Guardando…"
          : total === 0
            ? `Elegí el producto del secadero ${secaderoNumero}`
            : `Cargar ${numero(total)} placas y pasar a húmedo`}
      </button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { corregirMovimiento } from "@/lib/acciones/correcciones";
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
  volverA,
  correccion,
}: {
  secaderoId: number;
  secaderoNumero: number;
  /** null = el tipo no tiene tope fijo: se carga a mano y sin controles. */
  capacidad: number | null;
  modelos: Producto[];
  /**
   * La pantalla desde la que se entro. El mismo formulario lo usan el carrusel
   * y el llenado manual, y cada operario tiene que volver a la suya.
   */
  volverA: string;
  /**
   * Corregir una carga ya hecha, en vez de cargar. Es el mismo formulario a
   * proposito: el operario corrige con la misma pantalla con la que cargo, y
   * lo que se valida es exactamente lo mismo. Cambia que arranca con lo que se
   * habia cargado y que la nota pasa a ser el motivo, obligatorio.
   */
  correccion?: { movimientoId: number; inicial: Record<number, number> };
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();
  const corrigiendo = correccion !== undefined;

  /**
   * El caso normal es secadero completo con un solo producto, asi que arranca
   * tildado: el operario toca el producto y ya queda la capacidad entera.
   * El producto NO viene preseleccionado a proposito: elegirlo siempre a mano
   * es lo que evita cargar la tanda equivocada.
   *
   * Sin tope fijo no existe "completo", asi que el atajo no aplica y el
   * formulario arranca -y se queda- en carga a mano.
   */
  const [completo, setCompleto] = useState(() => {
    if (capacidad === null) return false;
    if (!correccion) return true;
    // Al corregir, arranca en completo solo si lo que se cargo ya era eso: un
    // producto con la capacidad entera. Si no, en modo a mano, que es donde
    // se ven las cantidades que hay que arreglar.
    const cargado = Object.values(correccion.inicial);
    return cargado.length === 1 && cargado[0] === capacidad;
  });
  const [cantidades, setCantidades] = useState<Record<number, number>>(
    () => correccion?.inicial ?? {},
  );
  const [nota, setNota] = useState("");
  const [filtro, setFiltro] = useState("");
  /**
   * Segundo paso antes de guardar una carga incompleta. Ver `confirmar`.
   * Cualquier cambio en las cantidades lo apaga: lo que se confirma tiene que
   * ser lo que se ve.
   */
  const [confirmando, setConfirmando] = useState(false);

  const total = useMemo(
    () => Object.values(cantidades).reduce((a, n) => a + (n || 0), 0),
    [cantidades],
  );
  const restante = capacidad === null ? 0 : capacidad - total;
  const incompleta = capacidad !== null && total > 0 && total < capacidad;

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return modelos;
    return modelos.filter((m) => m.nombre.toLowerCase().includes(q));
  }, [modelos, filtro]);

  /** En modo completo, tocar un producto le asigna toda la capacidad. */
  function elegirUnico(id: number) {
    if (capacidad === null) return;
    setError(null);
    setConfirmando(false);
    setCantidades(cantidades[id] === capacidad ? {} : { [id]: capacidad });
  }

  function setCantidad(id: number, valor: number) {
    setError(null);
    setConfirmando(false);
    const limpio = Math.max(0, Math.floor(valor) || 0);
    setCantidades((prev) => {
      const siguiente = { ...prev, [id]: limpio };
      if (limpio === 0) delete siguiente[id];
      return siguiente;
    });
  }

  function alternarCompleto() {
    if (capacidad === null) return;
    setError(null);
    setConfirmando(false);
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
    if (capacidad !== null && total > capacidad) {
      return setError(
        `El secadero admite ${capacidad} placas y estás cargando ${total}.`,
      );
    }
    if (corrigiendo && nota.trim().length < 3) {
      return setError("Escribí en pocas palabras qué pasó.");
    }

    /**
     * Una carga incompleta pide confirmacion antes de guardarse.
     *
     * Es donde vive el error de tipeo: 36 en vez de 136 es una carga valida
     * -entra en el secadero- y sin esta pregunta pasaba de largo. La completa,
     * que es casi todo el dia, no pregunta nada: una confirmacion en cada
     * movimiento se termina tocando sin leer, y entonces ya no frena nada.
     * Sin tope fijo no hay "incompleto"; ahi el numero va en el boton mismo.
     */
    if (incompleta && !confirmando) {
      setConfirmando(true);
      return;
    }

    const items = Object.entries(cantidades).map(([productoId, cantidad]) => ({
      productoId: Number(productoId),
      cantidad,
    }));

    await ejecutar(
      () =>
        correccion
          ? corregirMovimiento({
              movimientoId: correccion.movimientoId,
              motivo: nota.trim(),
              items,
            })
          : cargarSecadero({
              secaderoId,
              items,
              nota: nota.trim() || undefined,
            }),
      () => {
        router.push(volverA);
        router.refresh();
      },
    );
    setConfirmando(false);
  }

  return (
    <div className="space-y-4">
      <div className="tarjeta p-4">
        {/* Interruptor entre el caso tipico -uno solo, completo- y la carga
            mezclada con cantidades a mano. Sin tope fijo no hay atajo posible:
            el interruptor, el contador contra la capacidad y la barra de avance
            necesitan los tres un numero que en estos tipos no existe. */}
        {capacidad !== null && (
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
        )}

        <div className="mt-4 mb-2 flex items-baseline justify-between">
          <span className="etiqueta mb-0">
            {completo ? "¿Qué producto lleva?" : "Productos"}
          </span>
          {capacidad === null ? (
            <span className="text-sm font-bold tabular-nums text-slate-700">
              {numero(total)} placas
            </span>
          ) : (
            <span
              className={`text-sm font-bold tabular-nums ${
                total > capacidad ? "text-red-600" : "text-slate-700"
              }`}
            >
              {numero(total)} / {numero(capacidad)}
            </span>
          )}
        </div>

        {capacidad !== null && (
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-all ${
                total > capacidad ? "bg-red-500" : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(100, (total / capacidad) * 100)}%` }}
            />
          </div>
        )}

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
                  {/* En modo completo la cantidad ES la capacidad entera. */}
                  {elegido && (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-blue-700">
                      {numero(cantidad)}
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

                {/* Completa lo que falta para llenar el secadero. Sin tope no
                    hay "lo que falta", asi que el boton ni aparece. */}
                {capacidad !== null && (
                  <button
                    type="button"
                    disabled={enviando || restante <= 0}
                    onClick={() => setCantidad(producto.id, cantidad + restante)}
                    className="h-11 shrink-0 rounded-lg bg-white px-3 text-xs font-bold text-slate-600 ring-1 ring-slate-300 transition active:scale-95 disabled:opacity-30"
                    title="Completar la capacidad del secadero con este producto"
                  >
                    +{restante > 0 ? restante : 0}
                  </button>
                )}
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
          {corrigiendo ? "¿Qué pasó?" : "Nota (opcional)"}
        </label>
        <textarea
          id="nota"
          className="campo min-h-20"
          value={nota}
          maxLength={corrigiendo ? 300 : 500}
          disabled={enviando}
          onChange={(e) => {
            setError(null);
            setNota(e.target.value);
          }}
          placeholder={
            corrigiendo
              ? "Por ejemplo: puse 36 y eran 136"
              : "Algo para dejar asentado…"
          }
        />
      </div>

      {error && <Aviso>{error}</Aviso>}

      {confirmando && capacidad !== null ? (
        <Confirmacion
          total={total}
          capacidad={capacidad}
          secaderoNumero={secaderoNumero}
          corrigiendo={corrigiendo}
          enviando={enviando}
          alConfirmar={() => void confirmar()}
          alVolver={() => setConfirmando(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={enviando || total === 0}
          className="boton-primario w-full"
        >
          {/* El total y el numero de secadero van en el boton siempre: es lo
              ultimo que se lee antes de tocar, y ahi se ve el 36 que tenia que
              ser 136, o el 45 que tenia que ser el 54. */}
          {enviando
            ? "Guardando…"
            : total === 0
              ? `Elegí el producto del secadero ${secaderoNumero}`
              : corrigiendo
                ? `Guardar corrección: ${numero(total)} placas en el ${secaderoNumero}`
                : `Cargar ${numero(total)} placas en el ${secaderoNumero}`}
        </button>
      )}
    </div>
  );
}

/**
 * La pregunta antes de guardar una carga incompleta, con el numero grande.
 *
 * Va en el lugar del boton y no en un `window.confirm`: el cartel nativo no
 * deja agrandar el numero, y el numero grande es justamente lo que tiene que
 * saltar a la vista. "Si" es el boton ancho porque una incompleta tambien
 * puede ser correcta -fin de tanda, la ultima del turno-: la pregunta es para
 * que se lea, no para complicar el caso legitimo.
 */
function Confirmacion({
  total,
  capacidad,
  secaderoNumero,
  corrigiendo,
  enviando,
  alConfirmar,
  alVolver,
}: {
  total: number;
  capacidad: number;
  secaderoNumero: number;
  corrigiendo: boolean;
  enviando: boolean;
  alConfirmar: () => void;
  alVolver: () => void;
}) {
  // Aparece en el lugar del boton, al pie de la pantalla, y es mas alto que
  // el: en el celular quedaba cortada abajo y el operario no veia la pregunta.
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    caja.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  return (
    <div
      ref={caja}
      role="alertdialog"
      aria-labelledby="confirmar-carga"
      className="tarjeta space-y-3 p-4 ring-2 ring-amber-400"
    >
      <p
        id="confirmar-carga"
        className="text-center text-sm font-semibold text-slate-600"
      >
        {corrigiendo ? "Vas a dejar la carga en" : "Vas a cargar"}
      </p>
      <p className="text-center leading-none">
        <span className="text-5xl font-bold tabular-nums text-slate-900">
          {numero(total)}
        </span>
        <span className="text-2xl font-semibold tabular-nums text-slate-400">
          {" "}
          de {numero(capacidad)}
        </span>
      </p>
      <p className="text-center text-sm text-slate-600">
        en el secadero{" "}
        <strong className="text-base text-slate-900">{secaderoNumero}</strong>.
        Queda incompleto. <strong className="text-slate-900">¿Es correcto?</strong>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={alVolver}
          disabled={enviando}
          className="boton-secundario"
        >
          No, corregir
        </button>
        <button
          type="button"
          onClick={alConfirmar}
          disabled={enviando}
          className="boton-primario flex-1"
        >
          {enviando ? "Guardando…" : `Sí, son ${numero(total)}`}
        </button>
      </div>
    </div>
  );
}

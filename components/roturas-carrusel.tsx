"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  eliminarRoturaCarrusel,
  registrarRoturaCarrusel,
} from "@/lib/acciones/roturas";
import { fechaHora, hora, numero } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

type Opcion = { id: number; nombre: string };

export type RoturaVista = {
  id: number;
  productoNombre: string;
  cantidad: number;
  motivoNombre: string | null;
  usuarioNombre: string;
  nota: string | null;
  creadoEn: string;
};

/**
 * Roturas que pasan ANTES del secadero.
 *
 * El carrusel siempre trata de sacar secaderos completos, asi que estas placas
 * nunca llegan a entrar en uno: no se descuentan de ninguna carga, se reportan
 * sueltas. Por eso el formulario pide modelo, cantidad y motivo, y nada mas: no
 * hay secadero al que atarlas.
 */
export function RoturasCarrusel({
  productos,
  motivos,
  roturas,
  puedeCargar,
  puedeBorrar,
  etiquetaRango,
}: {
  productos: Opcion[];
  motivos: Opcion[];
  roturas: RoturaVista[];
  puedeCargar: boolean;
  puedeBorrar: boolean;
  etiquetaRango: string;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  const [abierto, setAbierto] = useState(false);
  const [productoId, setProductoId] = useState(0);
  const [cantidad, setCantidad] = useState("");
  const [motivoId, setMotivoId] = useState(motivos.length === 1 ? motivos[0].id : 0);
  const [nota, setNota] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const total = useMemo(
    () => roturas.reduce((a, r) => a + r.cantidad, 0),
    [roturas],
  );

  /** Cuanto se rompio de cada modelo en el período, que es la lectura util. */
  const porModelo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of roturas) {
      m.set(r.productoNombre, (m.get(r.productoNombre) ?? 0) + r.cantidad);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [roturas]);

  function limpiar() {
    setProductoId(0);
    setCantidad("");
    setMotivoId(motivos.length === 1 ? motivos[0].id : 0);
    setNota("");
  }

  async function guardar() {
    setAviso(null);
    const n = Number(cantidad);
    if (!productoId) return setError("Elegí el producto que se rompió.");
    if (!n || n < 1) return setError("Escribí cuántas placas se rompieron.");
    if (!motivoId) return setError("Elegí el motivo de la rotura.");

    await ejecutar(
      () =>
        registrarRoturaCarrusel({
          productoId,
          cantidad: n,
          motivoId,
          nota: nota.trim() || undefined,
        }),
      () => {
        const nombre = productos.find((p) => p.id === productoId)?.nombre ?? "";
        setAviso(`Registradas ${numero(n)} placas rotas de ${nombre}.`);
        limpiar();
        setAbierto(false);
      },
    );
  }

  return (
    <section className="tarjeta p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">
          Roturas antes del secadero
        </h2>
        <span
          className={`text-sm font-bold tabular-nums ${
            total > 0 ? "text-red-600" : "text-slate-400"
          }`}
        >
          {numero(total)} placas · {etiquetaRango}
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-500">
        Lo que se rompe en la línea, antes de entrar al secadero. No descuenta
        de ninguna carga: el secadero se llena igual.
      </p>

      {porModelo.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {porModelo.map(([nombre, n]) => (
            <span
              key={nombre}
              className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800 ring-1 ring-red-200"
            >
              {nombre} · {numero(n)}
            </span>
          ))}
        </div>
      )}

      {aviso && !abierto && (
        <div className="mt-3">
          <Aviso tono="exito">{aviso}</Aviso>
        </div>
      )}

      {puedeCargar &&
        (abierto ? (
          <div className="mt-3 space-y-2.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <label className="block">
              <span className="etiqueta">Producto</span>
              <select
                className="campo py-3"
                value={productoId || ""}
                disabled={enviando}
                onChange={(e) => {
                  setError(null);
                  setProductoId(Number(e.target.value));
                }}
              >
                <option value="">¿Qué se rompió?</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block">
                <span className="etiqueta">Placas rotas</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  className="campo py-3 text-center text-lg font-bold tabular-nums"
                  value={cantidad}
                  placeholder="0"
                  disabled={enviando}
                  onChange={(e) => {
                    setError(null);
                    setCantidad(e.target.value);
                  }}
                />
              </label>

              <label className="block">
                <span className="etiqueta">Motivo</span>
                <select
                  className="campo py-3"
                  value={motivoId || ""}
                  disabled={enviando}
                  onChange={(e) => {
                    setError(null);
                    setMotivoId(Number(e.target.value));
                  }}
                >
                  <option value="">¿Por qué se rompió?</option>
                  {motivos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <input
              className="campo py-2.5"
              value={nota}
              maxLength={500}
              disabled={enviando}
              placeholder="Detalle (opcional)"
              onChange={(e) => setNota(e.target.value)}
            />

            {error && <Aviso>{error}</Aviso>}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void guardar()}
                disabled={enviando}
                className="boton-primario flex-1"
              >
                {enviando ? "Guardando…" : "Registrar rotura"}
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => {
                  limpiar();
                  setError(null);
                  setAbierto(false);
                }}
                className="boton-secundario"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAviso(null);
              setAbierto(true);
            }}
            className="boton mt-3 w-full bg-red-600 text-white hover:bg-red-700"
          >
            + Registrar rotura
          </button>
        ))}

      {roturas.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {roturas.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-2 py-1.5 text-sm odd:bg-slate-50"
            >
              <span className="font-bold tabular-nums text-red-700">
                {numero(r.cantidad)}
              </span>
              <span className="font-semibold text-slate-800">
                {r.productoNombre}
              </span>
              {r.motivoNombre && (
                <span className="text-slate-500">{r.motivoNombre}</span>
              )}
              {r.nota && (
                <span className="text-xs text-slate-400">— {r.nota}</span>
              )}
              <span
                className="ml-auto text-xs text-slate-400"
                title={fechaHora(new Date(r.creadoEn))}
              >
                {hora(new Date(r.creadoEn))} · {r.usuarioNombre}
              </span>
              {puedeBorrar && (
                <BotonBorrar id={r.id} cantidad={r.cantidad} nombre={r.productoNombre} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Borrar una rotura mal cargada es cosa del admin, como corregir un secadero. */
function BotonBorrar({
  id,
  cantidad,
  nombre,
}: {
  id: number;
  cantidad: number;
  nombre: string;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();

  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={async () => {
          if (
            !window.confirm(
              `¿Borrar el registro de ${cantidad} placas rotas de ${nombre}?`,
            )
          )
            return;
          await ejecutar(() => eliminarRoturaCarrusel({ id }), () =>
            router.refresh(),
          );
        }}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40"
      >
        {enviando ? "…" : "Borrar"}
      </button>
      {error && (
        <span className="basis-full text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </>
  );
}

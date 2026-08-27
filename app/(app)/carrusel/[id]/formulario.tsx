"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cargarSecadero } from "@/lib/acciones/flujo";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import {
  EditorRoturas,
  convertirRoturas,
  validarRoturas,
  type MapaRoturas,
  type Motivo,
} from "@/components/editor-roturas";

type Modelo = { id: number; nombre: string };

export function FormularioCarga({
  secaderoId,
  secaderoNumero,
  capacidad,
  modelos,
  motivos,
}: {
  secaderoId: number;
  secaderoNumero: number;
  capacidad: number;
  modelos: Modelo[];
  motivos: Motivo[];
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [roturas, setRoturas] = useState<MapaRoturas>({});
  const [verRoturas, setVerRoturas] = useState(false);
  const [nota, setNota] = useState("");
  const [filtro, setFiltro] = useState("");

  const total = useMemo(
    () => Object.values(cantidades).reduce((a, n) => a + (n || 0), 0),
    [cantidades],
  );
  const restante = capacidad - total;

  const cargados = useMemo(
    () =>
      modelos
        .filter((m) => (cantidades[m.id] ?? 0) > 0)
        .map((m) => ({ productoId: m.id, nombre: m.nombre, tope: capacidad })),
    [modelos, cantidades, capacidad],
  );

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return modelos;
    return modelos.filter((m) => m.nombre.toLowerCase().includes(q));
  }, [modelos, filtro]);

  function setCantidad(id: number, valor: number) {
    setError(null);
    const limpio = Math.max(0, Math.floor(valor) || 0);
    setCantidades((prev) => {
      const siguiente = { ...prev, [id]: limpio };
      if (limpio === 0) delete siguiente[id];
      return siguiente;
    });
    if (limpio === 0) {
      setRoturas((prev) => {
        const copia = { ...prev };
        delete copia[id];
        return copia;
      });
    }
  }

  async function confirmar() {
    if (total === 0) return setError("Cargá al menos un modelo con cantidad.");
    if (total > capacidad) {
      return setError(
        `El secadero admite ${capacidad} placas y estás cargando ${total}.`,
      );
    }
    const problema = validarRoturas(roturas, cargados);
    if (problema) return setError(problema);

    await ejecutar(
      () =>
        cargarSecadero({
          secaderoId,
          items: Object.entries(cantidades).map(([productoId, cantidad]) => ({
            productoId: Number(productoId),
            cantidad,
          })),
          roturas: convertirRoturas(roturas),
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
        <div className="mb-3 flex items-baseline justify-between">
          <span className="etiqueta mb-0">Modelos</span>
          <span
            className={`text-sm font-bold tabular-nums ${
              total > capacidad ? "text-red-600" : "text-slate-700"
            }`}
          >
            {total} / {capacidad}
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
            placeholder="Buscar modelo…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        )}

        <div className="space-y-2">
          {visibles.map((modelo) => {
            const cantidad = cantidades[modelo.id] ?? 0;
            const activo = cantidad > 0;
            return (
              <div
                key={modelo.id}
                className={`flex items-center gap-2 rounded-xl p-2.5 ring-1 transition ${
                  activo
                    ? "bg-blue-50 ring-blue-200"
                    : "bg-slate-50 ring-slate-200"
                }`}
              >
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                  {modelo.nombre}
                </p>

                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={cantidad === 0 ? "" : cantidad}
                  placeholder="0"
                  disabled={enviando}
                  onChange={(e) => setCantidad(modelo.id, Number(e.target.value))}
                  className="h-11 w-20 rounded-lg border-0 bg-white text-center text-base font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  aria-label={`Cantidad de ${modelo.nombre}`}
                />

                {/* Un toque para llenar el resto del secadero: es lo que se hace
                    casi siempre cuando va un solo modelo. */}
                <button
                  type="button"
                  disabled={enviando || restante <= 0}
                  onClick={() => setCantidad(modelo.id, cantidad + restante)}
                  className="h-11 shrink-0 rounded-lg bg-white px-3 text-xs font-bold text-slate-600 ring-1 ring-slate-300 transition active:scale-95 disabled:opacity-30"
                  title="Completar la capacidad del secadero con este modelo"
                >
                  +{restante > 0 ? restante : 0}
                </button>
              </div>
            );
          })}
          {visibles.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">
              Ningún modelo coincide con “{filtro}”.
            </p>
          )}
        </div>
      </div>

      <div className="tarjeta p-4">
        {!verRoturas ? (
          <button
            type="button"
            onClick={() => setVerRoturas(true)}
            disabled={cargados.length === 0}
            className="text-sm font-semibold text-slate-600 underline underline-offset-4 disabled:text-slate-300 disabled:no-underline"
          >
            + Registrar placas rotas al cargar
          </button>
        ) : (
          <EditorRoturas
            opciones={cargados}
            motivos={motivos}
            valor={roturas}
            alCambiar={setRoturas}
            deshabilitado={enviando}
          />
        )}
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

      {error && <Aviso>{error}</Aviso>}

      <button
        type="button"
        onClick={() => void confirmar()}
        disabled={enviando || total === 0}
        className="boton-primario w-full"
      >
        {enviando
          ? "Guardando…"
          : `Cargar secadero ${secaderoNumero} · ${total} placas`}
      </button>
    </div>
  );
}

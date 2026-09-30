"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guardarInventarioMoldes } from "@/lib/acciones/moldes";
import { numero } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

type Fila = {
  id: number;
  nombre: string;
  moldes: number;
  activo: boolean;
  montados: number;
};

/**
 * La lista de modelos con cuantos moldes hay de cada uno, editable de una vez.
 * Se guarda todo junto: cargar el inventario inicial fila por fila seria
 * tocar Guardar treinta veces.
 */
export function Inventario({ productos }: { productos: Fila[] }) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(productos.map((p) => [p.id, String(p.moldes)])),
  );
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiados = productos.filter(
    (p) => Number(valores[p.id] || 0) !== p.moldes,
  );

  return (
    <div className="tarjeta p-4">
      <ul className="divide-y divide-slate-100">
        {productos.map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span
                className={`block truncate text-sm font-semibold ${
                  p.activo ? "text-slate-800" : "text-slate-400"
                }`}
              >
                {p.nombre}
                {!p.activo && " (suspendido)"}
              </span>
              <span className="block text-xs text-slate-500">
                montados ahora: {numero(p.montados)}
              </span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="campo w-24 py-2 text-center font-bold tabular-nums"
              value={valores[p.id] ?? ""}
              disabled={enviando}
              onChange={(e) => {
                setAviso(null);
                setValores((v) => ({ ...v, [p.id]: e.target.value }));
              }}
              aria-label={`Moldes de ${p.nombre}`}
            />
          </li>
        ))}
      </ul>
      {productos.length === 0 && (
        <p className="py-4 text-center text-sm text-slate-400">
          No hay modelos del carrusel.
        </p>
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
        disabled={enviando || cambiados.length === 0}
        onClick={() =>
          void ejecutar(
            () =>
              guardarInventarioMoldes({
                items: cambiados.map((p) => ({
                  productoId: p.id,
                  moldes: Number(valores[p.id] || 0),
                })),
              }),
            () => {
              setAviso("Inventario guardado.");
              router.refresh();
            },
          )
        }
        className="boton-primario mt-3 w-full"
      >
        {enviando
          ? "Guardando…"
          : cambiados.length === 0
            ? "Sin cambios"
            : `Guardar ${cambiados.length} ${cambiados.length === 1 ? "modelo" : "modelos"}`}
      </button>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guardarInventarioMoldes } from "@/lib/acciones/moldes";
import type { MotivoInventarioMoldes } from "@/lib/db/schema";
import {
  ETIQUETA_MOTIVO_INVENTARIO,
  MOTIVOS_INVENTARIO_MOLDES,
} from "@/lib/moldes-comun";
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
 * Lo que se guarda junto lleva un mismo motivo y queda en el historial.
 * Se guarda todo junto: cargar el inventario inicial fila por fila seria
 * tocar Guardar treinta veces.
 */
export function Inventario({
  productos,
  sinHistorial,
}: {
  productos: Fila[];
  /** Todavia no se cargo nunca: el motivo arranca en "Carga inicial". */
  sinHistorial: boolean;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();
  const [valores, setValores] = useState<Record<number, string>>(() =>
    Object.fromEntries(productos.map((p) => [p.id, String(p.moldes)])),
  );
  const [aviso, setAviso] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<MotivoInventarioMoldes | null>(
    sinHistorial ? "carga_inicial" : null,
  );
  const [nota, setNota] = useState("");

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
                setError(null);
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

      {cambiados.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-xs font-bold text-slate-700">
            ¿Por qué cambia?{" "}
            <span className="font-normal text-slate-500">
              {cambiados
                .map((p) => `${p.nombre}: ${p.moldes} → ${Number(valores[p.id] || 0)}`)
                .join(" · ")}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_INVENTARIO_MOLDES.map((m) => (
              <button
                key={m}
                type="button"
                disabled={enviando}
                onClick={() => {
                  setError(null);
                  setMotivo(m);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                  motivo === m
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-300"
                }`}
              >
                {ETIQUETA_MOTIVO_INVENTARIO[m]}
              </button>
            ))}
          </div>
          <input
            className="campo py-2"
            value={nota}
            maxLength={500}
            disabled={enviando}
            onChange={(e) => setNota(e.target.value)}
            placeholder={
              motivo === "otro" ? "¿Qué pasó? (obligatorio)" : "Nota (opcional)"
            }
          />
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
        disabled={enviando || cambiados.length === 0 || !motivo}
        onClick={() =>
          void ejecutar(
            () =>
              guardarInventarioMoldes({
                items: cambiados.map((p) => ({
                  productoId: p.id,
                  moldes: Number(valores[p.id] || 0),
                })),
                motivo: motivo!,
                nota: nota.trim() || undefined,
              }),
            () => {
              setAviso("Inventario guardado.");
              setMotivo(null);
              setNota("");
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
            : !motivo
              ? "Elegí el motivo"
              : `Guardar ${cambiados.length} ${cambiados.length === 1 ? "modelo" : "modelos"}`}
      </button>
    </div>
  );
}

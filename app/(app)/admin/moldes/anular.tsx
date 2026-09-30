"use client";

import { useState } from "react";
import { anularCambioMoldes } from "@/lib/acciones/moldes";
import { BotonAccion } from "@/components/admin/comunes";

/** Anular el ultimo cambio: vuelve a quedar montado el set anterior. */
export function AnularCambio({ id }: { id: number }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1 text-xs font-semibold text-red-700 underline"
      >
        Anular
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input
        className="campo flex-1 py-2"
        placeholder="¿Por qué se anula?"
        value={motivo}
        maxLength={300}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <BotonAccion
        variante="peligro"
        confirmar="Se anula el cambio y vuelve a quedar montado el set anterior. ¿Seguro?"
        accion={() => anularCambioMoldes({ id, motivo })}
      >
        Anular
      </BotonAccion>
    </div>
  );
}

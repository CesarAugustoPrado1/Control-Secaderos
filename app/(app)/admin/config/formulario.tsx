"use client";

import { useState } from "react";
import { guardarConfig } from "@/lib/acciones/admin";
import {
  ETIQUETA_CONFIG,
  type ClaveConfig,
  type Configuracion,
} from "@/lib/configuracion";
import { Campo, FormularioAbm } from "@/components/admin/comunes";

const AYUDA: Record<ClaveConfig, string> = {
  capacidad_grande: "Máximo de placas que entran en un secadero de placa grande.",
  capacidad_chico: "Máximo de placas que entran en un secadero de placa chica.",
  capacidad_horno:
    "Cuántos secaderos entran en el horno. El sistema no deja meter de más.",
};

const ORDEN: ClaveConfig[] = [
  "capacidad_grande",
  "capacidad_chico",
  "capacidad_horno",
];

export function FormularioConfig({ inicial }: { inicial: Configuracion }) {
  const [valores, setValores] = useState<Record<ClaveConfig, string>>(() => ({
    capacidad_grande: String(inicial.capacidad_grande),
    capacidad_chico: String(inicial.capacidad_chico),
    capacidad_horno: String(inicial.capacidad_horno),
  }));

  return (
    <div className="tarjeta max-w-xl p-4">
      <FormularioAbm
        accion={() =>
          guardarConfig({
            capacidad_grande: Number(valores.capacidad_grande),
            capacidad_chico: Number(valores.capacidad_chico),
            capacidad_horno: Number(valores.capacidad_horno),
          })
        }
      >
        {ORDEN.map((clave) => (
          <div key={clave}>
            <Campo etiqueta={ETIQUETA_CONFIG[clave]}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="campo"
                value={valores[clave]}
                onChange={(e) =>
                  setValores((prev) => ({ ...prev, [clave]: e.target.value }))
                }
                required
              />
            </Campo>
            <p className="mt-1 text-xs text-slate-500">{AYUDA[clave]}</p>
          </div>
        ))}

        <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-200">
          Cambiar las capacidades no afecta a los secaderos que ya están
          cargados: solo se aplica a las cargas nuevas.
        </p>
      </FormularioAbm>
    </div>
  );
}

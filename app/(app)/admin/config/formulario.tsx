"use client";

import Link from "next/link";
import { useState } from "react";
import { guardarConfig } from "@/lib/acciones/admin";
import { ETIQUETA_CONFIG, type Configuracion } from "@/lib/configuracion";
import { Campo, FormularioAbm } from "@/components/admin/comunes";

export function FormularioConfig({ inicial }: { inicial: Configuracion }) {
  const [capacidadHorno, setCapacidadHorno] = useState(
    String(inicial.capacidad_horno),
  );

  return (
    <div className="max-w-xl space-y-4">
      <div className="tarjeta p-4">
        <FormularioAbm
          accion={() =>
            guardarConfig({ capacidad_horno: Number(capacidadHorno) })
          }
        >
          <div>
            <Campo etiqueta={ETIQUETA_CONFIG.capacidad_horno}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="campo"
                value={capacidadHorno}
                onChange={(e) => setCapacidadHorno(e.target.value)}
                required
              />
            </Campo>
            <p className="mt-1 text-xs text-slate-500">
              Cuántos secaderos entran en el horno. El sistema no deja meter de
              más.
            </p>
          </div>
        </FormularioAbm>
      </div>

      <div className="tarjeta p-4">
        <h2 className="text-sm font-bold text-slate-900">
          Capacidad de los secaderos
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          El máximo de placas de cada secadero ya no se configura acá: es propio
          de cada tipo, porque un grande y una guarda no llevan lo mismo. Lo
          editás en{" "}
          <Link
            href="/admin/tipos"
            className="font-semibold text-slate-900 underline"
          >
            Tipos
          </Link>
          , junto con el nombre de cada uno.
        </p>
      </div>
    </div>
  );
}

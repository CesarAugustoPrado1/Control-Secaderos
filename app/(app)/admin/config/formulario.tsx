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
  const [objetivo, setObjetivo] = useState(
    String(inicial.minutos_horno_objetivo),
  );
  const [kgBolson, setKgBolson] = useState(String(inicial.kg_por_bolson));
  const [kgBalde, setKgBalde] = useState(String(inicial.kg_por_balde_yeso));

  return (
    <div className="max-w-xl space-y-4">
      <div className="tarjeta p-4">
        <FormularioAbm
          accion={() =>
            guardarConfig({
              capacidad_horno: Number(capacidadHorno),
              minutos_horno_objetivo: Number(objetivo),
              kg_por_bolson: Number(kgBolson),
              kg_por_balde_yeso: Number(kgBalde),
            })
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
              Cuántos secaderos entran en el horno, contando sólo los tipos que
              comparten los lugares generales. Los que tienen{" "}
              <Link
                href="/admin/tipos"
                className="font-semibold text-slate-900 underline"
              >
                cupo propio
              </Link>{" "}
              —las guardas— van aparte y no descuentan de acá. El sistema no
              deja meter de más en ninguno de los dos.
            </p>
          </div>

          <div>
            <Campo etiqueta={ETIQUETA_CONFIG.minutos_horno_objetivo}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="campo"
                value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
                required
              />
            </Campo>
            <p className="mt-1 text-xs text-slate-500">
              Cuánto debería durar un ciclo. Por ejemplo, 300 son 5 horas. No se
              hace cumplir: sirve para detectar los ciclos que se quedaron
              cortos, que son los que después vuelven sin secar.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta={ETIQUETA_CONFIG.kg_por_bolson}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="campo"
                value={kgBolson}
                onChange={(e) => setKgBolson(e.target.value)}
                required
              />
            </Campo>

            <Campo etiqueta={ETIQUETA_CONFIG.kg_por_balde_yeso}>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                className="campo"
                value={kgBalde}
                onChange={(e) => setKgBalde(e.target.value)}
                required
              />
            </Campo>
          </div>

          <p className="-mt-1 text-xs text-slate-500">
            El carrusel registra bolsones y baldes por unidad; esto es lo que se
            usa para pasarlos a kilos. Cambiarlos afecta a lo que se cargue de
            acá en adelante: cada registro se queda con el peso que regía ese
            día, así que el histórico no se recalcula.
          </p>
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

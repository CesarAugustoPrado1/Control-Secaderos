"use client";

import { useState } from "react";
import {
  cambiarEstadoTipo,
  eliminarTipo,
  guardarTipo,
} from "@/lib/acciones/admin";
import { colorTipo } from "@/lib/estados";
import { numero } from "@/lib/formato";
import {
  BloqueNuevo,
  BotonAccion,
  Campo,
  FilaAbm,
  FormularioAbm,
} from "@/components/admin/comunes";

type Fila = {
  id: number;
  nombre: string;
  /** null = sin tope fijo. */
  capacidad: number | null;
  /** null = comparte el cupo general del horno. */
  cupoHorno: number | null;
  /** Sale del circuito del carrusel y paletizado. */
  llenadoManual: boolean;
  orden: number;
  activo: boolean;
  secaderos: number;
  productos: number;
};

export function ListaTipos({ tipos }: { tipos: Fila[] }) {
  const [editando, setEditando] = useState<number | null>(null);

  const siguienteOrden =
    tipos.reduce((max, t) => Math.max(max, t.orden), 0) + 10;

  return (
    <>
      <BloqueNuevo etiqueta="Agregar tipo">
        {(cerrar) => (
          <FormularioTipo
            inicial={{
              nombre: "",
              capacidad: 100,
              cupoHorno: null,
              llenadoManual: false,
              orden: siguienteOrden,
            }}
            alGuardar={cerrar}
          />
        )}
      </BloqueNuevo>

      {tipos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          No hay tipos cargados. Sin al menos uno no vas a poder dar de alta
          secaderos ni productos.
        </p>
      ) : (
        <ul className="space-y-2">
          {tipos.map((t) => (
            <FilaAbm key={t.id} atenuado={!t.activo}>
              {editando === t.id ? (
                <div className="w-full">
                  <FormularioTipo
                    inicial={t}
                    alGuardar={() => setEditando(null)}
                  />
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="mt-2 text-sm font-medium text-slate-500"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`chip ${colorTipo(t.id)}`}>
                        {t.nombre}
                      </span>
                      {t.capacidad === null ? (
                        <span className="text-sm font-bold text-slate-500">
                          sin tope fijo
                        </span>
                      ) : (
                        <span className="text-sm font-bold tabular-nums text-slate-700">
                          {numero(t.capacidad)} placas
                        </span>
                      )}
                      {t.cupoHorno !== null && (
                        <span className="chip bg-orange-100 text-orange-800">
                          {t.cupoHorno} en el horno, aparte
                        </span>
                      )}
                      {t.llenadoManual && (
                        <span className="chip bg-violet-100 text-violet-900">
                          Llenado manual
                        </span>
                      )}
                      {!t.activo && (
                        <span className="chip bg-amber-100 text-amber-900">
                          DESACTIVADO
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {t.secaderos} secaderos · {t.productos} productos
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditando(t.id)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <BotonAccion
                      accion={() =>
                        cambiarEstadoTipo({ id: t.id, activo: !t.activo })
                      }
                    >
                      {t.activo ? "Desactivar" : "Reactivar"}
                    </BotonAccion>
                    {t.secaderos === 0 && t.productos === 0 && (
                      <BotonAccion
                        variante="peligro"
                        confirmar={`¿Eliminar el tipo "${t.nombre}"?`}
                        accion={() => eliminarTipo({ id: t.id })}
                      >
                        Eliminar
                      </BotonAccion>
                    )}
                  </div>
                </>
              )}
            </FilaAbm>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-500">
        La capacidad es el máximo de placas que entra en un secadero de ese tipo,
        y es lo que el sistema controla al cargar. Cambiarla no afecta a los
        secaderos que ya están cargados, sólo a las cargas nuevas.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Dejala <strong className="text-slate-700">vacía</strong> si en ese tipo
        no hay un secadero “lleno” y entra lo que ese día haya. El sistema no
        controla la cantidad: no rechaza cargas por pasarse, no las marca como
        incompletas y no las cuenta en el flujo óptimo de estadísticas.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        El <strong className="text-slate-700">cupo de horno</strong> es para los
        tipos que tienen su propia estructura adentro, como las guardas: entran
        esos lugares y no ocupan ninguno de los del cupo general. Dejalo vacío
        si el tipo comparte los lugares con los demás, que es lo normal.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        <strong className="text-slate-700">Llenado manual</strong> saca al tipo
        del circuito del carrusel: deja de aparecer en Cargar y en Descargar, y
        pasa a la pantalla de Llenado manual, donde el mismo operario lo llena y
        lo descarga. El horno no cambia: sigue metiéndolos y sacándolos el
        hornero. En el resumen de producción esos secaderos se cuentan en sus
        propios sectores y no en carrusel ni en paletizado.
      </p>
    </>
  );
}

function FormularioTipo({
  inicial,
  alGuardar,
}: {
  inicial: {
    id?: number;
    nombre: string;
    capacidad: number | null;
    cupoHorno: number | null;
    llenadoManual: boolean;
    orden: number;
  };
  alGuardar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [capacidad, setCapacidad] = useState(
    inicial.capacidad === null ? "" : String(inicial.capacidad),
  );
  const [cupoHorno, setCupoHorno] = useState(
    inicial.cupoHorno === null ? "" : String(inicial.cupoHorno),
  );
  const [llenadoManual, setLlenadoManual] = useState(inicial.llenadoManual);
  const [orden, setOrden] = useState(String(inicial.orden));

  // El campo vacio es "sin tope fijo". Se distingue del cero a proposito: no se
  // usa Number(""), que daria 0 y significaria un secadero donde no entra nada.
  const sinTope = capacidad.trim() === "";
  // Mismo criterio: vacio es "comparte el cupo general", no "no entra ninguno".
  const sinCupoPropio = cupoHorno.trim() === "";

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() =>
        guardarTipo({
          id: inicial.id,
          nombre,
          capacidad: sinTope ? null : Number(capacidad),
          cupoHorno: sinCupoPropio ? null : Number(cupoHorno),
          llenadoManual,
          orden: Number(orden),
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Nombre">
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej: Guarda"
            required
            maxLength={40}
          />
        </Campo>

        <Campo etiqueta="Capacidad (placas)">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="campo"
            value={capacidad}
            placeholder="Sin tope fijo"
            onChange={(e) => setCapacidad(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            {sinTope ? "Sin tope: entra lo que haya" : "Vacío = sin tope fijo"}
          </p>
        </Campo>

        <Campo etiqueta="Cupo propio en el horno">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="campo"
            value={cupoHorno}
            placeholder="Comparte el general"
            onChange={(e) => setCupoHorno(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            {sinCupoPropio
              ? "Vacío = compite por los lugares generales"
              : "Lugares aparte, no ocupan los del resto"}
          </p>
        </Campo>

        <Campo etiqueta="Orden en las listas">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="campo"
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
          />
        </Campo>
      </div>

      <label className="mt-3 flex items-start gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={llenadoManual}
          onChange={(e) => setLlenadoManual(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300"
        />
        <span>
          <strong className="font-semibold text-slate-900">
            Se llena y se descarga a mano
          </strong>
          <span className="block text-xs text-slate-500">
            Fuera del carrusel y de paletizado. Va a la pantalla de Llenado
            manual. El horno no cambia.
          </span>
        </span>
      </label>
    </FormularioAbm>
  );
}

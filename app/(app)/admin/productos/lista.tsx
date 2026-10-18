"use client";

import Link from "next/link";
import { useState } from "react";
import {
  cambiarEstadoProducto,
  eliminarProducto,
  guardarProducto,
} from "@/lib/acciones/admin";
import {
  analizarProductos,
  importarProductos,
} from "@/lib/acciones/planillas";
import { ChipTipo } from "@/components/ui";
import { PlanillaExcel } from "@/components/admin/planilla-excel";
import {
  BloqueNuevo,
  BotonAccion,
  Campo,
  FilaAbm,
  FormularioAbm,
} from "@/components/admin/comunes";

type TipoOpcion = { id: number; nombre: string };

type Fila = {
  id: number;
  nombre: string;
  tipoId: number;
  tipoNombre: string;
  activo: boolean;
  m2PorPlaca: number | null;
};

/** "2,88" con coma, como se escribe en la planta. */
const m2Texto = (n: number) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: 4 });

export function ListaProductos({
  productos,
  tipos,
}: {
  productos: Fila[];
  tipos: TipoOpcion[];
}) {
  const [editando, setEditando] = useState<number | null>(null);

  if (tipos.length === 0) {
    return (
      <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
        Primero cargá al menos un tipo de secadero en la pestaña{" "}
        <Link href="/admin/tipos" className="font-semibold underline">
          Tipos
        </Link>
        .
      </p>
    );
  }

  return (
    <>
      <BloqueNuevo etiqueta="Agregar producto">
        {(cerrar) => (
          <FormularioProducto
            inicial={{ nombre: "", tipoId: tipos[0].id, m2PorPlaca: null }}
            tipos={tipos}
            alGuardar={cerrar}
          />
        )}
      </BloqueNuevo>

      <PlanillaExcel
        titulo="Productos en Excel"
        hrefExportar="/admin/productos/exportar"
        analizar={analizarProductos}
        importar={importarProductos}
        columnas="Nombre, Tipo de secadero, Activo, m² por placa"
        ayuda={
          <>
            Los productos se identifican por <strong>nombre</strong>: los que ya
            existen se actualizan y los que no, se dan de alta. Lo que no
            aparezca en la planilla queda intacto —{" "}
            <strong>la importación nunca borra</strong>; para sacar un producto
            de circulación poné NO en Activo. La comparación de nombres ignora
            mayúsculas y acentos, así que “Laja 12,5” y “laja 12,5” son el mismo
            producto: si los escribís distinto, se corrige el nombre en lugar de
            duplicarlo. En <strong>Tipo de secadero</strong> va el nombre tal
            como está en la pestaña Tipos — es en qué secadero entra el
            producto, o sea si es de placa grande o chica. La columna “Placas
            que entran” que trae la descarga es informativa y se ignora al
            subir. En <strong>m² por placa</strong> va el área de una placa,
            como 2,88: si la celda queda vacía, ese dato no se toca.
          </>
        }
      />

      {productos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          Todavía no hay productos cargados. Agregá el primero con el botón de
          arriba.
        </p>
      ) : (
        <ul className="space-y-2">
          {productos.map((p) => (
            <FilaAbm key={p.id} atenuado={!p.activo}>
              {editando === p.id ? (
                <div className="w-full">
                  <FormularioProducto
                    inicial={p}
                    tipos={tipos}
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
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {p.nombre}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <ChipTipo id={p.tipoId} nombre={p.tipoNombre} />
                      {p.m2PorPlaca !== null ? (
                        <span className="chip bg-slate-100 text-slate-700">
                          {m2Texto(p.m2PorPlaca)} m²/placa
                        </span>
                      ) : (
                        <span className="chip bg-amber-100 text-amber-900">
                          Falta m²/placa
                        </span>
                      )}
                      {!p.activo && (
                        <span className="chip bg-amber-100 text-amber-900">
                          SUSPENDIDO
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditando(p.id)}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <BotonAccion
                      accion={() =>
                        cambiarEstadoProducto({ id: p.id, activo: !p.activo })
                      }
                    >
                      {p.activo ? "Suspender" : "Reactivar"}
                    </BotonAccion>
                    <BotonAccion
                      variante="peligro"
                      confirmar={`¿Eliminar "${p.nombre}"? Solo se puede si nunca se usó.`}
                      accion={() => eliminarProducto({ id: p.id })}
                    >
                      Eliminar
                    </BotonAccion>
                  </div>
                </>
              )}
            </FilaAbm>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-slate-500">
        <strong>Suspender</strong> saca al producto de las pantallas de carga
        pero conserva el historial: es lo que conviene para un producto que ya
        se fabricó y hoy no se hace más. <strong>Eliminar</strong> sólo funciona
        si el producto nunca se usó, por ejemplo si lo cargaste con un error;
        una vez que tiene movimientos, borrarlo dejaría el historial
        inconsistente. El tipo determina en qué secaderos se puede cargar cada
        producto. Los <strong>m² por placa</strong> convierten las placas a
        metros cuadrados en Estadísticas: por ejemplo 2,88 para una placa de
        1,20 × 2,40.
      </p>
    </>
  );
}

function FormularioProducto({
  inicial,
  tipos,
  alGuardar,
}: {
  inicial: { id?: number; nombre: string; tipoId: number; m2PorPlaca: number | null };
  tipos: TipoOpcion[];
  alGuardar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [tipoId, setTipoId] = useState(inicial.tipoId);
  const [m2, setM2] = useState(
    inicial.m2PorPlaca === null ? "" : m2Texto(inicial.m2PorPlaca),
  );

  // Se acepta coma o punto decimal; vacio es "todavia sin cargar".
  const m2Numero = m2.trim() === "" ? null : Number(m2.replace(",", "."));

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() =>
        guardarProducto({
          id: inicial.id,
          nombre,
          tipoId,
          m2PorPlaca: m2Numero !== null && Number.isNaN(m2Numero) ? -1 : m2Numero,
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Nombre del producto">
          <input
            className="campo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="ej: Standard 12,5mm"
            required
            maxLength={80}
          />
        </Campo>

        <Campo etiqueta="Tipo de secadero">
          <select
            className="campo"
            value={tipoId}
            onChange={(e) => setTipoId(Number(e.target.value))}
          >
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </Campo>

        <Campo etiqueta="m² por placa">
          <input
            className="campo"
            value={m2}
            onChange={(e) => setM2(e.target.value.replace(/[^\d.,]/g, ""))}
            inputMode="decimal"
            placeholder="ej: 2,88"
            aria-describedby="ayuda-m2"
          />
          <span id="ayuda-m2" className="mt-1 block text-xs text-slate-500">
            Ancho × largo de una placa, en metros.
          </span>
        </Campo>
      </div>
    </FormularioAbm>
  );
}

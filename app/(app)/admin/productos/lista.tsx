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
};

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
            inicial={{ nombre: "", tipoId: tipos[0].id }}
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
        columnas="Nombre, Tipo, Activo"
        ayuda={
          <>
            Los productos se identifican por <strong>nombre</strong>: los que ya
            existen se actualizan y los que no, se dan de alta. Lo que no
            aparezca en la planilla queda intacto —{" "}
            <strong>la importación nunca borra</strong>; para sacar un producto
            de circulación poné NO en Activo. La comparación de nombres ignora
            mayúsculas y acentos, así que “Laja 12,5” y “laja 12,5” son el mismo
            producto: si los escribís distinto, se corrige el nombre en lugar de
            duplicarlo. En <strong>Tipo</strong> va el nombre tal como está en la
            pestaña Tipos.
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
        producto.
      </p>
    </>
  );
}

function FormularioProducto({
  inicial,
  tipos,
  alGuardar,
}: {
  inicial: { id?: number; nombre: string; tipoId: number };
  tipos: TipoOpcion[];
  alGuardar: () => void;
}) {
  const [nombre, setNombre] = useState(inicial.nombre);
  const [tipoId, setTipoId] = useState(inicial.tipoId);

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() => guardarProducto({ id: inicial.id, nombre, tipoId })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
    </FormularioAbm>
  );
}

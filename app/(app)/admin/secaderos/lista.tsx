"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cambiarEstadoSecadero,
  crearSecaderosPorRango,
  eliminarSecadero,
  guardarSecadero,
} from "@/lib/acciones/admin";
import type { Estado } from "@/lib/db/schema";
import { numero } from "@/lib/formato";
import {
  analizarSecaderos,
  importarSecaderos,
} from "@/lib/acciones/planillas";
import { useAccion } from "@/components/usar-accion";
import { Aviso, ChipEstado, ChipTipo } from "@/components/ui";
import { PlanillaExcel } from "@/components/admin/planilla-excel";
import {
  BloqueNuevo,
  BotonAccion,
  Campo,
  FilaAbm,
  FormularioAbm,
} from "@/components/admin/comunes";

type TipoOpcion = { id: number; nombre: string; capacidad: number };

type Fila = {
  id: number;
  numero: number;
  tipoId: number;
  tipoNombre: string;
  capacidad: number;
  estado: Estado;
  activo: boolean;
};

/** Con ~250 secaderos, la lista se pagina para no volcar todo el DOM de una. */
const POR_PAGINA = 60;

export function ListaSecaderosAdmin({
  secaderos,
  tipos,
}: {
  secaderos: Fila[];
  tipos: TipoOpcion[];
}) {
  const [editando, setEditando] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<number | "todos">("todos");
  const [mostrar, setMostrar] = useState(POR_PAGINA);

  const filtrados = useMemo(() => {
    const q = busqueda.trim();
    return secaderos.filter((s) => {
      if (tipoFiltro !== "todos" && s.tipoId !== tipoFiltro) return false;
      if (q && !String(s.numero).startsWith(q)) return false;
      return true;
    });
  }, [secaderos, busqueda, tipoFiltro]);

  const siguienteNumero =
    secaderos.reduce((max, s) => Math.max(max, s.numero), 0) + 1;

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
      <div className="mb-4 flex flex-wrap gap-2">
        <BloqueNuevo etiqueta="Agregar uno">
          {(cerrar) => (
            <FormularioSecadero
              inicial={{ numero: siguienteNumero, tipoId: tipos[0].id }}
              tipos={tipos}
              alGuardar={cerrar}
            />
          )}
        </BloqueNuevo>
      </div>

      <AltaPorRango tipos={tipos} desdeSugerido={siguienteNumero} />

      <PlanillaExcel
        titulo="Secaderos en Excel"
        hrefExportar="/admin/secaderos/exportar"
        analizar={analizarSecaderos}
        importar={importarSecaderos}
        columnas="Numero, Tipo, Activo"
        ayuda={
          <>
            Los secaderos se identifican por <strong>número</strong>: los que ya
            existen se actualizan y los que no, se dan de alta. Lo que no
            aparezca en la planilla queda intacto —{" "}
            <strong>la importación nunca borra</strong>. En{" "}
            <strong>Tipo</strong> va el nombre tal como está en la pestaña
            Tipos; si el tipo no existe, la fila se marca como problema en lugar
            de crearlo solo. En <strong>Activo</strong> poné SÍ o NO. Las
            columnas Estado y Capacidad que trae la descarga son informativas y
            se ignoran al subir.
          </>
        }
      />

      <div className="tarjeta mb-4 space-y-3 p-4">
        <input
          type="text"
          inputMode="numeric"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value.replace(/\D/g, ""));
            setMostrar(POR_PAGINA);
          }}
          placeholder="Buscar por número…"
          aria-label="Buscar secadero por número"
          className="campo py-3 tabular-nums"
        />
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex min-w-max gap-1.5">
            <Filtro
              activo={tipoFiltro === "todos"}
              onClick={() => setTipoFiltro("todos")}
            >
              Todos
            </Filtro>
            {tipos.map((t) => (
              <Filtro
                key={t.id}
                activo={tipoFiltro === t.id}
                onClick={() => setTipoFiltro(t.id)}
              >
                {t.nombre}
              </Filtro>
            ))}
          </div>
        </div>
        <p className="text-sm text-slate-500">
          {filtrados.length} de {secaderos.length} secaderos
        </p>
      </div>

      {filtrados.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          Ningún secadero coincide con la búsqueda.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {filtrados.slice(0, mostrar).map((s) => (
              <FilaAbm key={s.id} atenuado={!s.activo}>
                {editando === s.id ? (
                  <div className="w-full">
                    <FormularioSecadero
                      inicial={s}
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
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-base font-bold tabular-nums text-white">
                      {s.numero}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ChipTipo id={s.tipoId} nombre={s.tipoNombre} />
                        <ChipEstado estado={s.estado} />
                        {!s.activo && (
                          <span className="chip bg-red-100 text-red-800">
                            DE BAJA
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Hasta {numero(s.capacidad)} placas
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditando(s.id)}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                      >
                        Editar
                      </button>
                      <Link
                        href={`/admin/secaderos/${s.id}`}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50"
                      >
                        Corregir
                      </Link>
                      <BotonAccion
                        accion={() =>
                          cambiarEstadoSecadero({ id: s.id, activo: !s.activo })
                        }
                      >
                        {s.activo ? "Dar de baja" : "Reactivar"}
                      </BotonAccion>
                      <BotonAccion
                        variante="peligro"
                        confirmar={`¿Eliminar el secadero ${s.numero}? Solo se puede si nunca tuvo movimientos.`}
                        accion={() => eliminarSecadero({ id: s.id })}
                      >
                        Eliminar
                      </BotonAccion>
                    </div>
                  </>
                )}
              </FilaAbm>
            ))}
          </ul>

          {filtrados.length > mostrar && (
            <button
              type="button"
              onClick={() => setMostrar((m) => m + POR_PAGINA)}
              className="boton-secundario mt-3 w-full"
            >
              Ver {Math.min(POR_PAGINA, filtrados.length - mostrar)} más
            </button>
          )}
        </>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Los secaderos con movimientos no se eliminan: se dan de baja, así el
        historial se conserva. Un secadero de baja no aparece en ninguna pantalla
        de operario.
      </p>
    </>
  );
}

/**
 * Alta por rango. Dar de alta 250 secaderos de a uno son 250 formularios; esto
 * lo resuelve en una operacion y saltea los numeros que ya existen, asi se
 * puede usar tambien para completar huecos.
 */
function AltaPorRango({
  tipos,
  desdeSugerido,
}: {
  tipos: TipoOpcion[];
  desdeSugerido: number;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(String(desdeSugerido));
  const [hasta, setHasta] = useState(String(desdeSugerido + 49));
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? 0);
  const [resultado, setResultado] = useState<string | null>(null);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="boton-secundario mb-4 w-full sm:w-auto"
      >
        + Agregar muchos por rango
      </button>
    );
  }

  return (
    <div className="tarjeta mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">
          Agregar secaderos por rango
        </h2>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-sm font-medium text-slate-500"
        >
          Cerrar
        </button>
      </div>

      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setResultado(null);
          await ejecutar(
            () =>
              crearSecaderosPorRango({
                desde: Number(desde),
                hasta: Number(hasta),
                tipoId,
              }),
            (datos) => {
              setResultado(
                datos.salteados.length === 0
                  ? `Se crearon ${datos.creados} secaderos.`
                  : `Se crearon ${datos.creados}. Ya existían ${datos.salteados.length}: ${datos.salteados.slice(0, 20).join(", ")}${datos.salteados.length > 20 ? "…" : ""}`,
              );
              router.refresh();
            },
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Desde el número">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              className="campo"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              required
            />
          </Campo>
          <Campo etiqueta="Hasta el número">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              className="campo"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              required
            />
          </Campo>
          <Campo etiqueta="Tipo">
            <select
              className="campo"
              value={tipoId}
              onChange={(e) => setTipoId(Number(e.target.value))}
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre} — {t.capacidad} placas
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <p className="text-xs text-slate-500">
          Los números que ya existan se saltean, así que podés correrlo de nuevo
          para completar huecos sin tocar lo que ya cargaste. Después ajustás a
          mano los que sean de otro tipo.
        </p>

        {error && <Aviso>{error}</Aviso>}
        {resultado && <Aviso tono="exito">{resultado}</Aviso>}

        <button type="submit" disabled={enviando} className="boton-primario">
          {enviando ? "Creando…" : "Crear secaderos"}
        </button>
      </form>
    </div>
  );
}

function Filtro({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
        activo
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function FormularioSecadero({
  inicial,
  tipos,
  alGuardar,
}: {
  inicial: { id?: number; numero: number; tipoId: number };
  tipos: TipoOpcion[];
  alGuardar: () => void;
}) {
  const [numeroSecadero, setNumeroSecadero] = useState(String(inicial.numero));
  const [tipoId, setTipoId] = useState(inicial.tipoId);

  return (
    <FormularioAbm
      alGuardar={alGuardar}
      accion={() =>
        guardarSecadero({
          id: inicial.id,
          numero: Number(numeroSecadero),
          tipoId,
        })
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Número">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="campo"
            value={numeroSecadero}
            onChange={(e) => setNumeroSecadero(e.target.value)}
            required
          />
        </Campo>

        <Campo etiqueta="Tipo">
          <select
            className="campo"
            value={tipoId}
            onChange={(e) => setTipoId(Number(e.target.value))}
          >
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} — hasta {t.capacidad} placas
              </option>
            ))}
          </select>
        </Campo>
      </div>
    </FormularioAbm>
  );
}

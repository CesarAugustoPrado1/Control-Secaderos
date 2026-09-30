"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { guardarPlan } from "@/lib/acciones/plan";
import type { Destino, Sector } from "@/lib/db/schema";
import type { ComparacionPlan, PedidoDeDia } from "@/lib/plan";
import { COLOR_DESTINO, ETIQUETA_DESTINO } from "@/lib/estados";
import { numero } from "@/lib/formato";
import { etiquetaDia } from "@/lib/rangos";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import { Plegable } from "@/components/plegable";
import { SalenEntran } from "@/components/moldes-carrusel";
import {
  diferenciaMoldes,
  listaMoldes,
  mismosMoldes,
  ordenarSet,
  totalMoldes,
  type LineaMoldes,
} from "@/lib/moldes-comun";

type Producto = { id: number; nombre: string };

/** Lo que el editor necesita para pedir moldes. Solo en carrusel. */
export type DatosMoldesPlan = {
  /** El set pedido para el dia, o null si va sin cambios. */
  pedido: LineaMoldes[] | null;
  /** "Lo de ayer": contra que se compara y lo que sigue si no se pide nada. */
  referencia: LineaMoldes[] | null;
  inventario: { id: number; nombre: string; moldes: number }[];
  lugares: number;
};

const ETIQUETA_SECTOR: Record<Sector, string> = {
  carrusel: "Carrusel",
  paletizado: "Paletizado",
};

/** Lo cargado en el editor para un producto. */
type Pedido = {
  secaderos: number;
  /** Solo para planes viejos: los nuevos piden palets por cantidad. */
  destino: Destino | null;
  cliente: string;
  paletsEstandar: number;
  paletsOptimizados: number;
};

const PEDIDO_VACIO: Pedido = {
  secaderos: 0,
  destino: null,
  cliente: "",
  paletsEstandar: 0,
  paletsOptimizados: 0,
};

const pedidoActivo = (p: Pedido) =>
  p.secaderos > 0 || p.paletsEstandar > 0 || p.paletsOptimizados > 0;

function aPedido(p: PedidoDeDia): Pedido {
  return {
    secaderos: p.secaderos,
    destino: p.destino,
    cliente: p.cliente ?? "",
    paletsEstandar: p.paletsEstandar ?? 0,
    paletsOptimizados: p.paletsOptimizados ?? 0,
  };
}

export function EditorPlan({
  fecha,
  sector,
  esPasado,
  productos,
  comparacion,
  semana,
  lineasSemana,
  moldes: datosMoldes,
}: {
  fecha: string;
  sector: Sector;
  esPasado: boolean;
  productos: Producto[];
  comparacion: ComparacionPlan;
  moldes?: DatosMoldesPlan;
  semana: string[];
  /** Lo pedido en cada dia de la semana, para poder copiar de un toque. */
  lineasSemana: Record<string, Record<number, PedidoDeDia>>;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  // Paletizado ademas de cuanto recibe que hacer con eso y para quien; el
  // carrusel solo carga secaderos, no rotula nada.
  const conDestino = sector === "paletizado";

  const [pedidos, setPedidos] = useState<Record<number, Pedido>>(() =>
    Object.fromEntries(
      comparacion.lineas.map((l) => [
        l.productoId,
        {
          secaderos: l.pedidos,
          destino: l.destino,
          cliente: l.cliente ?? "",
          paletsEstandar: l.palets.estandar.pedidos,
          paletsOptimizados: l.palets.optimizado.pedidos,
        },
      ]),
    ),
  );
  const [nota, setNota] = useState(comparacion.nota ?? "");
  /** null = sin cambios de moldes ese dia. */
  const [moldes, setMoldes] = useState<Record<number, number> | null>(() =>
    datosMoldes?.pedido
      ? Object.fromEntries(datosMoldes.pedido.map((l) => [l.productoId, l.cantidad]))
      : null,
  );
  const [aviso, setAviso] = useState<string | null>(null);
  /** Filas abiertas para pedir palets sin secaderos. */
  const [soloPalets, setSoloPalets] = useState<Set<number>>(new Set());

  const total = useMemo(
    () => Object.values(pedidos).reduce((a, p) => a + (p.secaderos || 0), 0),
    [pedidos],
  );
  const totalPalets = useMemo(
    () =>
      Object.values(pedidos).reduce(
        (a, p) => a + p.paletsEstandar + p.paletsOptimizados,
        0,
      ),
    [pedidos],
  );
  const hayLineas = total > 0 || totalPalets > 0;

  /** Lo hecho por producto, para mostrarlo al lado de lo pedido. */
  const hechoPorProducto = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of comparacion.lineas) m.set(l.productoId, l.hechos);
    return m;
  }, [comparacion.lineas]);

  function actualizar(productoId: number, cambios: Partial<Pedido>) {
    setError(null);
    setAviso(null);
    setPedidos((prev) => {
      const actual = prev[productoId] ?? PEDIDO_VACIO;
      const siguiente = { ...actual, ...cambios };
      const entero = (n: number) => Math.max(0, Math.floor(n) || 0);
      siguiente.secaderos = entero(siguiente.secaderos);
      siguiente.paletsEstandar = entero(siguiente.paletsEstandar);
      siguiente.paletsOptimizados = entero(siguiente.paletsOptimizados);

      const sig = { ...prev, [productoId]: siguiente };
      // Sin secaderos ni palets la linea sale del plan, cliente incluido.
      if (!pedidoActivo(siguiente)) delete sig[productoId];
      return sig;
    });
  }

  async function guardar() {
    await ejecutar(
      () =>
        guardarPlan({
          fecha,
          sector,
          lineas: Object.entries(pedidos).map(([productoId, p]) => ({
            productoId: Number(productoId),
            secaderos: p.secaderos,
            destino: conDestino ? p.destino : null,
            cliente: conDestino ? p.cliente.trim() || null : null,
            paletsEstandar: conDestino ? p.paletsEstandar : null,
            paletsOptimizados: conDestino ? p.paletsOptimizados : null,
          })),
          nota: nota.trim() || undefined,
          moldes: datosMoldes
            ? moldes &&
              Object.entries(moldes).map(([productoId, n]) => ({
                productoId: Number(productoId),
                moldes: n,
              }))
            : undefined,
        }),
      () => {
        setAviso(
          !hayLineas && !moldes ? "Se borró el plan de ese día." : "Plan guardado.",
        );
        router.refresh();
      },
    );
  }

  return (
    <section className="tarjeta p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">
          {ETIQUETA_SECTOR[sector]} · {etiquetaDia(fecha)}
        </h2>
        <span className="text-sm font-bold tabular-nums text-slate-700">
          {numero(total)} secaderos
          {conDestino && totalPalets > 0 && ` · ${numero(totalPalets)} palets`}
        </span>
      </div>

      {esPasado && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          Es un día pasado. Si cambiás lo pedido, se borran las explicaciones de
          desvío que ya se hayan cargado, porque dejan de corresponder.
        </p>
      )}

      {/* Copiar de otro dia: cargar siete dias desde cero no lo hace nadie. */}
      <CopiarDeOtroDia
        fecha={fecha}
        semana={semana}
        lineasSemana={lineasSemana}
        alCopiar={(valores, origen) => {
          setPedidos(valores);
          setAviso(`Copiado de ${etiquetaDia(origen)}. Revisá y guardá.`);
        }}
      />

      <div className="mt-3 space-y-2">
        {productos.map((p) => {
          const pedido = pedidos[p.id];
          const cantidad = pedido?.secaderos ?? 0;
          const hecho = hechoPorProducto.get(p.id) ?? 0;
          const activo = !!pedido && pedidoActivo(pedido);
          const verInstruccion = conDestino && (activo || soloPalets.has(p.id));
          return (
            <div
              key={p.id}
              className={`rounded-xl p-2.5 ring-1 ${
                activo
                  ? "bg-blue-50 ring-blue-200"
                  : "bg-slate-50 ring-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">
                    {p.nombre}
                  </span>
                  {hecho > 0 && (
                    <span className="block text-xs text-slate-500">
                      hechos: {numero(hecho)}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={enviando || cantidad === 0}
                  onClick={() => actualizar(p.id, { secaderos: cantidad - 1 })}
                  className="h-11 w-11 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-30"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={cantidad === 0 ? "" : cantidad}
                  placeholder="0"
                  disabled={enviando}
                  onChange={(e) =>
                    actualizar(p.id, { secaderos: Number(e.target.value) })
                  }
                  className="h-11 w-16 rounded-lg border-0 bg-white text-center text-base font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                  aria-label={`Secaderos de ${p.nombre}`}
                />
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => actualizar(p.id, { secaderos: cantidad + 1 })}
                  className="h-11 w-11 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300"
                >
                  +
                </button>
              </div>

              {verInstruccion ? (
                <Instruccion
                  producto={p.nombre}
                  pedido={pedido ?? PEDIDO_VACIO}
                  deshabilitado={enviando}
                  alCambiar={(cambios) => actualizar(p.id, cambios)}
                />
              ) : (
                conDestino && (
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => setSoloPalets((s) => new Set(s).add(p.id))}
                    className="mt-1.5 text-xs font-semibold text-slate-500 underline"
                  >
                    Pedir palets sin bajar secaderos
                  </button>
                )
              )}
            </div>
          );
        })}
        {productos.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">
            No hay productos activos para pedir.
          </p>
        )}
      </div>

      {datosMoldes && (
        <div className="mt-3">
          <SeccionMoldes
            datos={datosMoldes}
            moldes={moldes}
            deshabilitado={enviando}
            alCambiar={(m) => {
              setError(null);
              setAviso(null);
              setMoldes(m);
            }}
          />
        </div>
      )}

      <label className="mt-3 block">
        <span className="etiqueta">Nota para el sector (opcional)</span>
        <input
          className="campo"
          value={nota}
          maxLength={500}
          disabled={enviando}
          onChange={(e) => setNota(e.target.value)}
          placeholder="ej: priorizar Ekos para el pedido del viernes"
        />
      </label>

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
        onClick={() => void guardar()}
        disabled={enviando}
        className="boton-primario mt-3 w-full"
      >
        {enviando
          ? "Guardando…"
          : !hayLineas && !moldes
            ? "Guardar (deja el día sin plan)"
            : !hayLineas
              ? "Guardar moldes (sin secaderos)"
              : total === 0
                ? `Guardar plan de ${numero(totalPalets)} palets`
                : `Guardar plan de ${numero(total)} secaderos`}
      </button>
    </section>
  );
}

/**
 * Que armar con ese modelo y para que cliente.
 *
 * Se piden palets por cantidad y por tipo, porque es algo que paletizado
 * puede confirmar y se puede medir: "1 palet estandar" se cumple o no, "va a
 * palet estandar" no. Lo que sobra de armar los palets va a placas sueltas,
 * que es una regla fija del oficio.
 */
function Instruccion({
  producto,
  pedido,
  deshabilitado,
  alCambiar,
}: {
  producto: string;
  pedido: Pedido;
  deshabilitado: boolean;
  alCambiar: (cambios: Partial<Pedido>) => void;
}) {
  return (
    <div className="mt-2.5 space-y-2 border-t border-blue-200 pt-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <ContadorPalets
          etiqueta="Palets estándar"
          valor={pedido.paletsEstandar}
          deshabilitado={deshabilitado}
          alCambiar={(n) => alCambiar({ paletsEstandar: n })}
        />
        <ContadorPalets
          etiqueta="Palets optimizados"
          valor={pedido.paletsOptimizados}
          deshabilitado={deshabilitado}
          alCambiar={(n) => alCambiar({ paletsOptimizados: n })}
        />
      </div>

      <p className="text-xs text-slate-500">
        {pedido.paletsEstandar + pedido.paletsOptimizados > 0
          ? "Lo que sobre después de armar los palets va a placas sueltas."
          : "Sin palets pedidos: todo va a placas sueltas."}
      </p>

      {/* Planes de antes de pedir palets por cantidad: se muestra para que no
          se pierda al editar, y se puede sacar. */}
      {pedido.destino && (
        <p className="flex items-center gap-2 text-xs text-slate-600">
          <span className={`chip ${COLOR_DESTINO[pedido.destino]}`}>
            {ETIQUETA_DESTINO[pedido.destino]}
          </span>
          destino del plan anterior
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => alCambiar({ destino: null })}
            className="font-semibold text-slate-500 underline"
          >
            quitar
          </button>
        </p>
      )}

      <input
        className="campo py-2.5"
        value={pedido.cliente}
        maxLength={80}
        disabled={deshabilitado}
        onChange={(e) => alCambiar({ cliente: e.target.value })}
        placeholder="Cliente para rotular (opcional)"
        aria-label={`Cliente de ${producto}`}
      />
    </div>
  );
}

function ContadorPalets({
  etiqueta,
  valor,
  deshabilitado,
  alCambiar,
}: {
  etiqueta: string;
  valor: number;
  deshabilitado: boolean;
  alCambiar: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-white p-1.5 ring-1 ring-slate-200">
      <span className="min-w-0 flex-1 text-xs font-semibold text-slate-700">
        {etiqueta}
      </span>
      <button
        type="button"
        disabled={deshabilitado || valor === 0}
        onClick={() => alCambiar(valor - 1)}
        className="h-9 w-9 shrink-0 rounded-lg bg-slate-50 text-lg font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-30"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={valor === 0 ? "" : valor}
        placeholder="0"
        disabled={deshabilitado}
        onChange={(e) => alCambiar(Number(e.target.value))}
        className="h-9 w-12 rounded-lg border-0 bg-white text-center text-sm font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
        aria-label={etiqueta}
      />
      <button
        type="button"
        disabled={deshabilitado}
        onClick={() => alCambiar(valor + 1)}
        className="h-9 w-9 shrink-0 rounded-lg bg-slate-50 text-lg font-bold text-slate-700 ring-1 ring-slate-300"
      >
        +
      </button>
    </div>
  );
}

/**
 * Copia lo pedido en otro dia del mismo sector, de un toque.
 *
 * Solo se ofrecen los dias que tienen algo cargado: un boton que copia un plan
 * vacio no sirve para nada y ensucia la lista.
 */
function CopiarDeOtroDia({
  fecha,
  semana,
  lineasSemana,
  alCopiar,
}: {
  fecha: string;
  semana: string[];
  lineasSemana: Record<string, Record<number, PedidoDeDia>>;
  alCopiar: (valores: Record<number, Pedido>, origen: string) => void;
}) {
  const conPlan = semana.filter(
    (f) => f !== fecha && Object.keys(lineasSemana[f] ?? {}).length > 0,
  );
  if (conPlan.length === 0) return null;

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
      <p className="text-xs font-semibold text-slate-600">Copiar de otro día</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {conPlan.map((f) => {
          const dia = lineasSemana[f];
          const total = Object.values(dia).reduce((a, p) => a + p.secaderos, 0);
          return (
            <button
              key={f}
              type="button"
              onClick={() =>
                alCopiar(
                  Object.fromEntries(
                    Object.entries(dia).map(([id, p]) => [
                      Number(id),
                      aPedido(p),
                    ]),
                  ),
                  f,
                )
              }
              className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
            >
              {etiquetaDia(f)}
              <span className="ml-1 text-slate-400">({total})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * El set de moldes del dia, plegado: se mira una vez al dia.
 *
 * Sin pedido el dia va "sin cambios" y se muestra lo que sigue montado. Con
 * pedido se muestra que sale y que entra respecto de lo de ayer. Nunca deja
 * pedir mas moldes de los que hay de un modelo ni mas que los lugares.
 */
function SeccionMoldes({
  datos,
  moldes,
  deshabilitado,
  alCambiar,
}: {
  datos: DatosMoldesPlan;
  moldes: Record<number, number> | null;
  deshabilitado: boolean;
  alCambiar: (m: Record<number, number> | null) => void;
}) {
  const { referencia, inventario, lugares } = datos;
  const nombres = new Map(inventario.map((p) => [p.id, p.nombre]));
  for (const l of [...(referencia ?? []), ...(datos.pedido ?? [])]) {
    if (!nombres.has(l.productoId)) nombres.set(l.productoId, l.nombre);
  }

  const pedido: LineaMoldes[] | null = moldes
    ? ordenarSet(
        Object.entries(moldes).map(([id, n]) => ({
          productoId: Number(id),
          nombre: nombres.get(Number(id)) ?? "",
          cantidad: n,
        })),
      )
    : null;
  const total = pedido ? totalMoldes(pedido) : 0;
  const sinCambios =
    !pedido || (referencia !== null && mismosMoldes(referencia, pedido));
  const cambio =
    pedido && referencia && !sinCambios ? diferenciaMoldes(referencia, pedido) : null;

  function poner(id: number, valor: number, tope: number) {
    const n = Math.min(tope, Math.max(0, Math.floor(valor) || 0));
    alCambiar({ ...(moldes ?? {}), [id]: n });
  }

  const resumen = (
    <>
      <span
        className={`text-sm font-bold ${cambio ? "text-blue-700" : "text-slate-600"}`}
      >
        {cambio
          ? "Cambio de moldes pedido"
          : pedido && !referencia
            ? "Set pedido"
            : "Sin cambios"}
        {pedido && ` · ${numero(total)} / ${numero(lugares)}`}
      </span>
      <span className="mt-0.5 block truncate text-xs text-slate-500">
        {listaMoldes(pedido ?? referencia ?? []) || "Todavía no se cargaron moldes montados"}
      </span>
    </>
  );

  return (
    <Plegable id="plan-moldes" titulo="Set de moldes" resumen={resumen}>
      {!pedido ? (
        <>
          <p className="text-sm text-slate-600">
            Sin cambios: siguen los mismos moldes que ayer.
          </p>
          {referencia && referencia.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">{listaMoldes(referencia)}</p>
          )}
          <button
            type="button"
            disabled={deshabilitado}
            onClick={() =>
              alCambiar(
                Object.fromEntries(
                  (referencia ?? []).map((l) => [l.productoId, l.cantidad]),
                ),
              )
            }
            className="boton-secundario mt-3 w-full"
          >
            Pedir otro set de moldes
          </button>
        </>
      ) : (
        <>
          {cambio ? (
            <div className="mb-2 rounded-lg bg-blue-50 p-2.5 ring-1 ring-blue-200">
              <SalenEntran salen={cambio.salen} entran={cambio.entran} />
            </div>
          ) : referencia ? (
            <p className="mb-2 text-xs text-slate-500">
              Igual que ayer: sin cambios.
            </p>
          ) : (
            <p className="mb-2 text-xs text-slate-500">
              Todavía no se cargaron los moldes montados: no hay con qué
              comparar.
            </p>
          )}

          <ul className="space-y-1.5">
            {inventario.map((p) => {
              const n = moldes?.[p.id] ?? 0;
              return (
                <li
                  key={p.id}
                  className={`flex items-center gap-2 rounded-lg p-2 ring-1 ${
                    n > 0 ? "bg-blue-50 ring-blue-200" : "bg-slate-50 ring-slate-200"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {p.nombre}
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      hay {numero(p.moldes)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={deshabilitado || n === 0}
                    onClick={() => poner(p.id, n - 1, p.moldes)}
                    className="h-10 w-10 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-30"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={p.moldes}
                    value={n === 0 ? "" : n}
                    placeholder="0"
                    disabled={deshabilitado || p.moldes === 0}
                    onChange={(e) => poner(p.id, Number(e.target.value), p.moldes)}
                    className="h-10 w-14 rounded-lg border-0 bg-white text-center text-base font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900 disabled:opacity-40"
                    aria-label={`Moldes de ${p.nombre}`}
                  />
                  <button
                    type="button"
                    disabled={deshabilitado || n >= p.moldes}
                    onClick={() => poner(p.id, n + 1, p.moldes)}
                    className="h-10 w-10 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-30"
                  >
                    +
                  </button>
                </li>
              );
            })}
          </ul>

          <p
            className={`mt-2 text-center text-sm font-extrabold tabular-nums ${
              total > lugares
                ? "text-red-700"
                : total === lugares
                  ? "text-emerald-700"
                  : "text-amber-700"
            }`}
          >
            {numero(total)} / {numero(lugares)} moldes
            {total < lugares && ` · quedarían ${numero(lugares - total)} lugares vacíos`}
            {total > lugares && ` · sobran ${numero(total - lugares)}`}
          </p>
          {inventario.every((p) => p.moldes === 0) && (
            <p className="mt-1 text-xs text-amber-800">
              No hay inventario de moldes cargado. Cargalo en Administración → Moldes.
            </p>
          )}

          <button
            type="button"
            disabled={deshabilitado}
            onClick={() => alCambiar(null)}
            className="boton-secundario mt-2 w-full text-sm"
          >
            Sin cambios (quitar el pedido de moldes)
          </button>
        </>
      )}
    </Plegable>
  );
}

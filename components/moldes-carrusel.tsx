"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  anularCambioMoldes,
  registrarCambioMoldes,
} from "@/lib/acciones/moldes";
import type { MotivoMoldesIncompletos } from "@/lib/db/schema";
import {
  diferenciaMoldes,
  ETIQUETA_MOTIVO_MOLDES,
  listaMoldes,
  mismosMoldes,
  MOTIVOS_MOLDES_INCOMPLETOS,
  ordenarSet,
  totalMoldes,
  type LineaMoldes,
} from "@/lib/moldes-comun";
import { fechaHora, hora, numero } from "@/lib/formato";
import { etiquetaRelativa } from "@/lib/rangos";
import { useAccion } from "@/components/usar-accion";
import { Plegable } from "@/components/plegable";
import { Aviso } from "@/components/ui";

export type MontadoVista = {
  id: number;
  set: LineaMoldes[];
  total: number;
  motivoIncompleto: MotivoMoldesIncompletos | null;
  nota: string | null;
  usuarioNombre: string;
  creadoEn: string;
};

export type CambioMoldesVista = {
  id: number;
  creadoEn: string;
  usuarioNombre: string;
  total: number;
  lugares: number;
  motivoIncompleto: MotivoMoldesIncompletos | null;
  nota: string | null;
  anulado: boolean;
  anuladoPorNombre: string | null;
  motivoAnulacion: string | null;
  salen: LineaMoldes[];
  entran: LineaMoldes[];
  inicial: boolean;
  set: LineaMoldes[];
  /** Si quien mira puede anularlo ahora. */
  anulable: boolean;
};

type Modelo = { id: number; nombre: string; moldes: number };

/**
 * Los moldes del carrusel en la pantalla del operario.
 *
 * Lo que tiene que hacer se muestra afuera, en carteles que no se pliegan: un
 * cambio pedido todavia pendiente y un carrusel con lugares vacios. Todo lo
 * demas -el set montado, lo que se cambio en el dia, el editor- va en una
 * seccion plegable, porque se usa una vez al dia y el resto del tiempo empuja
 * la lista de secaderos hacia abajo.
 *
 * El operario tiene la ultima palabra: puede hacer el cambio pedido de un
 * toque, hacerlo por partes o montar otra cosa si no se puede. La app registra
 * lo que quedo montado, no lo que se pidio.
 */
export function MoldesCarrusel({
  fecha,
  hoy,
  lugares,
  montado,
  pedido,
  referencia,
  inventario,
  cambios,
  puedeRegistrar,
}: {
  fecha: string;
  hoy: string;
  lugares: number;
  /** Hoy: lo montado ahora. Un dia pasado: lo que quedo al terminar el dia. */
  montado: MontadoVista | null;
  /** El set pedido en el plan de ese dia, o null si va sin cambios. */
  pedido: LineaMoldes[] | null;
  /** Para un dia futuro: contra que se compara lo pedido. */
  referencia: LineaMoldes[] | null;
  inventario: Modelo[];
  cambios: CambioMoldesVista[];
  puedeRegistrar: boolean;
}) {
  const esHoy = fecha === hoy;
  const esFuturo = fecha > hoy;
  const dia = etiquetaRelativa(fecha, hoy);
  /** Desde donde arranca el editor: lo montado, o lo pedido si se toco "Hecho". */
  const [editando, setEditando] = useState<null | "montado" | "pedido">(null);

  if (esFuturo) {
    return (
      <PlanFuturo dia={dia} pedido={pedido} referencia={referencia} lugares={lugares} />
    );
  }

  const pendiente =
    esHoy && pedido && montado && !mismosMoldes(montado.set, pedido)
      ? diferenciaMoldes(montado.set, pedido)
      : null;
  const incompleto = montado && montado.total < lugares;

  const editor = editando && puedeRegistrar && esHoy && (
    <EditorMoldes
      key={editando}
      lugares={lugares}
      montado={montado}
      pedido={pedido}
      desdePedido={editando === "pedido"}
      inventario={inventario}
      alCerrar={() => setEditando(null)}
    />
  );

  return (
    <div className="space-y-3">
      {esHoy && !montado && (
        <section className="tarjeta border-l-4 border-amber-500 p-4">
          <h2 className="text-base font-bold text-amber-900">
            Falta cargar los moldes montados
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {puedeRegistrar
              ? "Cargá una sola vez qué moldes hay puestos en el carrusel. Después se actualiza con cada cambio."
              : "El operario del carrusel todavía no cargó qué moldes hay puestos."}
          </p>
          {puedeRegistrar && !editando && (
            <button
              type="button"
              onClick={() => setEditando("montado")}
              className="boton-primario mt-3 w-full"
            >
              Cargar moldes montados
            </button>
          )}
          {!montado && editor}
        </section>
      )}

      {pendiente && (
        <CartelCambio
          pedido={pedido!}
          montado={montado!}
          lugares={lugares}
          salen={pendiente.salen}
          entran={pendiente.entran}
          puedeRegistrar={puedeRegistrar}
          editando={editando !== null}
          alEditar={(desde) => setEditando(desde)}
          yaHuboCambios={cambios.some((c) => !c.anulado && !c.inicial)}
        />
      )}
      {/* Con un pedido pendiente el editor se abre debajo del cartel, que es
          donde se toco el boton. */}
      {montado && pendiente && editor}

      {incompleto && (
        <section className="rounded-2xl bg-amber-100 p-4 ring-2 ring-amber-400">
          <p className="text-lg font-extrabold text-amber-950">
            ⚠ Carrusel con {numero(montado.total)} de {numero(lugares)} moldes
          </p>
          <p className="mt-1 text-sm font-semibold text-amber-900">
            {montado.motivoIncompleto
              ? ETIQUETA_MOTIVO_MOLDES[montado.motivoIncompleto]
              : "Sin motivo"}
            {montado.nota && ` — ${montado.nota}`}
          </p>
          <p className="mt-0.5 text-xs text-amber-800">
            {numero(lugares - montado.total)} lugares sin molde
            {!esHoy && " al terminar el día"}.
          </p>
        </section>
      )}

      {montado && (
        <Plegable
          id="moldes-carrusel"
          titulo={esHoy ? "Moldes montados" : `Moldes · ${dia}`}
          resumen={
            <>
              <span
                className={`text-sm font-bold tabular-nums ${
                  montado.total === lugares ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {numero(montado.total)} / {numero(lugares)} moldes
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">
                {listaMoldes(montado.set)}
              </span>
            </>
          }
        >
          <ChipsSet set={montado.set} />
          <p className="mt-2 text-xs text-slate-400">
            {esHoy ? "Último cambio" : "Último cambio hasta ese día"}:{" "}
            {fechaHora(new Date(montado.creadoEn))} · {montado.usuarioNombre}
          </p>

          {!esHoy && pedido && (
            <p className="mt-2 text-xs text-slate-600">
              Pedido para ese día: {listaMoldes(pedido)}
              {mismosMoldes(pedido, montado.set)
                ? " · se cumplió"
                : " · no coincide con lo que quedó montado"}
            </p>
          )}

          {cambios.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Cambios {esHoy ? "de hoy" : "del día"}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {cambios.map((c) => (
                  <FilaCambio key={c.id} cambio={c} />
                ))}
              </ul>
            </div>
          )}

          {puedeRegistrar && esHoy && (
            <div className="mt-3">
              {editando && !pendiente ? (
                editor
              ) : !editando ? (
                <button
                  type="button"
                  onClick={() => setEditando("montado")}
                  className="boton-secundario w-full"
                >
                  Registrar cambio de moldes
                </button>
              ) : null}
            </div>
          )}
        </Plegable>
      )}
    </div>
  );
}

function ChipsSet({ set }: { set: LineaMoldes[] }) {
  if (set.length === 0) {
    return <p className="text-sm text-slate-400">Sin moldes.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {set.map((l) => (
        <span
          key={l.productoId}
          className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200"
        >
          <span className="tabular-nums">{numero(l.cantidad)}</span> {l.nombre}
        </span>
      ))}
    </div>
  );
}

/** "Salen 10 Ekos · Entran 10 Dividida", en dos renglones de colores. */
export function SalenEntran({
  salen,
  entran,
  grande = false,
}: {
  salen: LineaMoldes[];
  entran: LineaMoldes[];
  grande?: boolean;
}) {
  const tam = grande ? "text-base" : "text-xs";
  return (
    <div className={`space-y-0.5 ${tam}`}>
      {salen.length > 0 && (
        <p className="font-semibold text-red-700">
          Salen: <span className="text-slate-900">{listaMoldes(salen)}</span>
        </p>
      )}
      {entran.length > 0 && (
        <p className="font-semibold text-emerald-700">
          Entran: <span className="text-slate-900">{listaMoldes(entran)}</span>
        </p>
      )}
    </div>
  );
}

function CartelCambio({
  pedido,
  montado,
  lugares,
  salen,
  entran,
  puedeRegistrar,
  editando,
  alEditar,
  yaHuboCambios,
}: {
  pedido: LineaMoldes[];
  montado: MontadoVista;
  lugares: number;
  salen: LineaMoldes[];
  entran: LineaMoldes[];
  puedeRegistrar: boolean;
  editando: boolean;
  alEditar: (desde: "montado" | "pedido") => void;
  yaHuboCambios: boolean;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const totalPedido = totalMoldes(pedido);
  // Si lo pedido deja lugares vacios hace falta el motivo: eso lo pide el
  // editor, asi que "Hecho" lleva ahi en vez de guardar directo.
  const pideMotivo = totalPedido < lugares;

  return (
    <section className="rounded-2xl bg-blue-50 p-4 ring-2 ring-blue-400">
      <p className="text-lg font-extrabold text-blue-950">Cambio de moldes</p>
      {yaHuboCambios && (
        <p className="text-xs font-semibold text-blue-800">
          Lo que falta para llegar a lo pedido:
        </p>
      )}
      <div className="mt-1.5">
        <SalenEntran salen={salen} entran={entran} grande />
      </div>
      <p className="mt-1.5 text-xs text-blue-900">
        Pedido: {listaMoldes(pedido)} ({numero(totalPedido)} de{" "}
        {numero(lugares)})
      </p>

      {error && (
        <div className="mt-2">
          <Aviso>{error}</Aviso>
        </div>
      )}

      {puedeRegistrar && !editando && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={async () => {
              if (pideMotivo) return alEditar("pedido");
              if (!window.confirm("¿Quedaron montados los moldes pedidos?")) return;
              await ejecutar(
                () =>
                  registrarCambioMoldes({
                    lineas: pedido.map((l) => ({
                      productoId: l.productoId,
                      cantidad: l.cantidad,
                    })),
                    basadoEn: montado.id,
                  }),
                () => router.refresh(),
              );
            }}
            className="boton flex-1 bg-blue-600 text-white hover:bg-blue-700"
          >
            {enviando ? "Guardando…" : "✓ Hecho"}
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => alEditar("montado")}
            className="boton-secundario flex-1"
          >
            Hice una parte u otro cambio
          </button>
        </div>
      )}
    </section>
  );
}

function FilaCambio({ cambio: c }: { cambio: CambioMoldesVista }) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");

  return (
    <li
      className={`rounded-lg px-2.5 py-2 ring-1 ${
        c.anulado ? "bg-slate-50 ring-slate-200 opacity-70" : "bg-white ring-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span
          className="text-xs font-bold tabular-nums text-slate-700"
          title={fechaHora(new Date(c.creadoEn))}
        >
          {hora(new Date(c.creadoEn))}
        </span>
        <span className="text-xs text-slate-500">{c.usuarioNombre}</span>
        <span className="ml-auto text-xs font-semibold tabular-nums text-slate-600">
          quedaron {numero(c.total)}/{numero(c.lugares)}
        </span>
      </div>
      <div className={c.anulado ? "line-through" : ""}>
        {c.inicial ? (
          <p className="text-xs text-slate-700">
            Set inicial: {listaMoldes(c.set)}
          </p>
        ) : c.salen.length || c.entran.length ? (
          <SalenEntran salen={c.salen} entran={c.entran} />
        ) : (
          <p className="text-xs text-slate-600">Mismos moldes, cambió el motivo.</p>
        )}
      </div>
      {c.motivoIncompleto && (
        <p className="text-xs text-amber-800">
          {ETIQUETA_MOTIVO_MOLDES[c.motivoIncompleto]}
          {c.nota && ` — ${c.nota}`}
        </p>
      )}
      {!c.motivoIncompleto && c.nota && (
        <p className="text-xs text-slate-500">{c.nota}</p>
      )}
      {c.anulado && (
        <p className="text-xs font-semibold text-red-700">
          Anulado{c.anuladoPorNombre && ` por ${c.anuladoPorNombre}`}
          {c.motivoAnulacion && `: ${c.motivoAnulacion}`}
        </p>
      )}

      {c.anulable &&
        (anulando ? (
          <div className="mt-2 space-y-2">
            <input
              className="campo py-2"
              placeholder="¿Por qué se anula?"
              value={motivo}
              maxLength={300}
              disabled={enviando}
              onChange={(e) => setMotivo(e.target.value)}
            />
            {error && <Aviso>{error}</Aviso>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={enviando || motivo.trim().length < 3}
                onClick={() =>
                  void ejecutar(
                    () => anularCambioMoldes({ id: c.id, motivo }),
                    () => router.refresh(),
                  )
                }
                className="boton flex-1 bg-red-600 text-sm text-white hover:bg-red-700"
              >
                {enviando ? "Anulando…" : "Anular: vuelve el set anterior"}
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => setAnulando(false)}
                className="boton-secundario text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAnulando(true)}
            className="mt-1 text-xs font-semibold text-red-700 underline"
          >
            Anular (se cargó mal)
          </button>
        ))}
    </li>
  );
}

/**
 * Carga del set que quedo montado. Arranca desde lo montado ahora, con lo
 * pedido al costado de cada modelo: asi un cambio por partes es mover los
 * numeros hacia lo pedido hasta donde se llego.
 */
function EditorMoldes({
  lugares,
  montado,
  pedido,
  desdePedido,
  inventario,
  alCerrar,
}: {
  lugares: number;
  montado: MontadoVista | null;
  pedido: LineaMoldes[] | null;
  /** Arrancar con lo pedido ya cargado: es el "Hecho" que pide motivo. */
  desdePedido: boolean;
  inventario: Modelo[];
  alCerrar: () => void;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();

  const [cantidades, setCantidades] = useState<Record<number, number>>(() =>
    Object.fromEntries(
      ((desdePedido ? pedido : montado?.set) ?? []).map((l) => [
        l.productoId,
        l.cantidad,
      ]),
    ),
  );
  const [motivo, setMotivo] = useState<MotivoMoldesIncompletos | null>(
    montado?.motivoIncompleto ?? null,
  );
  const [nota, setNota] = useState(montado?.nota ?? "");

  const pedidoPor = new Map((pedido ?? []).map((l) => [l.productoId, l.cantidad]));

  /** Los modelos que se ofrecen: los del inventario y cualquiera montado o pedido. */
  const modelos = useMemo(() => {
    const m = new Map<number, Modelo>();
    for (const p of inventario) m.set(p.id, p);
    for (const l of [...(montado?.set ?? []), ...(pedido ?? [])]) {
      if (!m.has(l.productoId)) {
        m.set(l.productoId, { id: l.productoId, nombre: l.nombre, moldes: 0 });
      }
    }
    const enJuego = new Set([
      ...(montado?.set ?? []).map((l) => l.productoId),
      ...(pedido ?? []).map((l) => l.productoId),
    ]);
    // Primero los que estan montados o pedidos, que son los que se tocan.
    return [...m.values()].sort(
      (a, b) =>
        Number(enJuego.has(b.id)) - Number(enJuego.has(a.id)) ||
        a.nombre.localeCompare(b.nombre),
    );
  }, [inventario, montado, pedido]);

  const nuevoSet: LineaMoldes[] = ordenarSet(
    modelos.map((m) => ({
      productoId: m.id,
      nombre: m.nombre,
      cantidad: cantidades[m.id] ?? 0,
    })),
  );
  const total = totalMoldes(nuevoSet);
  const { salen, entran } = diferenciaMoldes(montado?.set ?? [], nuevoSet);
  const incompleto = total < lugares;

  function poner(id: number, valor: number) {
    setError(null);
    setCantidades((prev) => ({ ...prev, [id]: Math.max(0, Math.floor(valor) || 0) }));
  }

  async function guardar() {
    await ejecutar(
      () =>
        registrarCambioMoldes({
          lineas: nuevoSet.map((l) => ({
            productoId: l.productoId,
            cantidad: l.cantidad,
          })),
          motivoIncompleto: incompleto ? motivo : null,
          nota: nota.trim() || undefined,
          basadoEn: montado?.id ?? null,
        }),
      () => {
        alCerrar();
        router.refresh();
      },
    );
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-sm font-bold text-slate-800">
        {montado ? "¿Qué quedó montado?" : "¿Qué moldes hay montados?"}
      </p>

      <ul className="space-y-1.5">
        {modelos.map((m) => {
          const n = cantidades[m.id] ?? 0;
          const p = pedidoPor.get(m.id);
          const pasado = m.moldes > 0 && n > m.moldes;
          return (
            <li
              key={m.id}
              className={`flex items-center gap-2 rounded-lg p-2 ring-1 ${
                n > 0 ? "bg-white ring-blue-200" : "bg-white/60 ring-slate-200"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {m.nombre}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {p !== undefined && (
                    <span className="font-semibold text-blue-700">
                      pedido {numero(p)} ·{" "}
                    </span>
                  )}
                  hay {numero(m.moldes)}
                  {pasado && (
                    <span className="font-semibold text-amber-700">
                      {" "}
                      · más de lo cargado en el inventario
                    </span>
                  )}
                </span>
              </span>
              <button
                type="button"
                disabled={enviando || n === 0}
                onClick={() => poner(m.id, n - 1)}
                className="h-10 w-10 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-30"
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={n === 0 ? "" : n}
                placeholder="0"
                disabled={enviando}
                onChange={(e) => poner(m.id, Number(e.target.value))}
                className="h-10 w-14 rounded-lg border-0 bg-white text-center text-base font-bold tabular-nums ring-1 ring-slate-300 focus:ring-2 focus:ring-slate-900"
                aria-label={`Moldes de ${m.nombre}`}
              />
              <button
                type="button"
                disabled={enviando}
                onClick={() => poner(m.id, n + 1)}
                className="h-10 w-10 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300"
              >
                +
              </button>
            </li>
          );
        })}
      </ul>

      <p
        className={`text-center text-base font-extrabold tabular-nums ${
          total > lugares
            ? "text-red-700"
            : total === lugares
              ? "text-emerald-700"
              : "text-amber-700"
        }`}
      >
        {numero(total)} / {numero(lugares)} moldes
        {total > lugares && ` · sobran ${numero(total - lugares)}`}
        {total < lugares && ` · ${numero(lugares - total)} lugares vacíos`}
      </p>

      {montado && (salen.length > 0 || entran.length > 0) && (
        <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
          <SalenEntran salen={salen} entran={entran} />
        </div>
      )}

      {incompleto && total > 0 && (
        <div className="space-y-2 rounded-lg bg-amber-50 p-2.5 ring-1 ring-amber-300">
          <p className="text-xs font-bold text-amber-900">
            ¿Por qué no se ponen los {numero(lugares)}?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MOTIVOS_MOLDES_INCOMPLETOS.map((m) => (
              <button
                key={m}
                type="button"
                disabled={enviando}
                onClick={() => {
                  setError(null);
                  setMotivo(m);
                }}
                className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                  motivo === m
                    ? "bg-amber-600 text-white"
                    : "bg-white text-slate-700 ring-1 ring-amber-300"
                }`}
              >
                {ETIQUETA_MOTIVO_MOLDES[m]}
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        className="campo py-2.5"
        value={nota}
        maxLength={500}
        disabled={enviando}
        onChange={(e) => setNota(e.target.value)}
        placeholder={
          incompleto && motivo === "otro" ? "¿Qué pasó? (obligatorio)" : "Nota (opcional)"
        }
      />

      {error && <Aviso>{error}</Aviso>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={enviando || total === 0 || total > lugares}
          className="boton-primario flex-1"
        >
          {enviando ? "Guardando…" : "Guardar moldes montados"}
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={alCerrar}
          className="boton-secundario"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Un dia que no llego: que set se pidio, o que va sin cambios. */
function PlanFuturo({
  dia,
  pedido,
  referencia,
  lugares,
}: {
  dia: string;
  pedido: LineaMoldes[] | null;
  referencia: LineaMoldes[] | null;
  lugares: number;
}) {
  const cambio =
    pedido && referencia && !mismosMoldes(referencia, pedido)
      ? diferenciaMoldes(referencia, pedido)
      : null;
  const set = pedido ?? referencia ?? [];

  return (
    <Plegable
      id="moldes-carrusel-futuro"
      titulo={`Moldes · ${dia}`}
      resumen={
        <span
          className={`text-sm font-bold ${cambio ? "text-blue-700" : "text-slate-600"}`}
        >
          {cambio ? "Hay cambio de moldes pedido" : "Sin cambios"}
        </span>
      }
    >
      {cambio && (
        <div className="mb-3 rounded-lg bg-blue-50 p-2.5 ring-1 ring-blue-200">
          <SalenEntran salen={cambio.salen} entran={cambio.entran} />
        </div>
      )}
      {set.length > 0 ? (
        <>
          <ChipsSet set={set} />
          <p className="mt-2 text-xs text-slate-500">
            {numero(totalMoldes(set))} de {numero(lugares)} moldes
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-400">
          Todavía no se cargaron los moldes montados.
        </p>
      )}
    </Plegable>
  );
}

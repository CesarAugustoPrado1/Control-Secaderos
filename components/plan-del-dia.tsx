"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { explicarDesvio, registrarPalets } from "@/lib/acciones/plan";
import type { AvancePalets, ComparacionPlan, LineaPlan } from "@/lib/plan";
import type { TipoPalet } from "@/lib/db/schema";
import { COLOR_DESTINO, ETIQUETA_DESTINO } from "@/lib/estados";
import { numero, porcentaje } from "@/lib/formato";
import { etiquetaRelativa } from "@/lib/rangos";
import { useAccion } from "@/components/usar-accion";
import { Plegable } from "@/components/plegable";
import { Aviso } from "@/components/ui";

type Motivo = { id: number; nombre: string };

const TIPOS_PALET: TipoPalet[] = ["estandar", "optimizado"];

const ETIQUETA_PALET: Record<TipoPalet, string> = {
  estandar: "Palets estándar",
  optimizado: "Palets optimizados",
};

const CORTO_PALET: Record<TipoPalet, string> = {
  estandar: "pal. est.",
  optimizado: "pal. opt.",
};

/** Lo que falta de una linea, en palabras: "2 sec · 1 pal. est.". */
function faltaDeLinea(l: LineaPlan): string[] {
  const partes: string[] = [];
  if (l.hechos < l.pedidos) partes.push(`${numero(l.pedidos - l.hechos)} sec`);
  for (const t of TIPOS_PALET) {
    const p = l.palets[t];
    if (p.hechos < p.pedidos) partes.push(`${numero(p.pedidos - p.hechos)} ${CORTO_PALET[t]}`);
  }
  return partes;
}

const lineaCompleta = (l: LineaPlan) => faltaDeLinea(l).length === 0;

/**
 * La orden del dia en la pantalla del operario, con el avance en vivo.
 *
 * Va arriba de todo a proposito: si el plan vive solo en el panel del admin es
 * papeleo, y si lo ve mientras trabaja es una guia. El desvio no se carga, se
 * calcula; lo unico que se pide a mano es el motivo, y solo cuando falta algo.
 *
 * Un dia que todavia no llego muestra solo lo pedido: sin avance ni faltantes,
 * porque todo figuraria en cero y cada linea pediria explicar un desvio que
 * no existe.
 */
export function PlanDelDia({
  fecha,
  hoy,
  comparacion,
  motivos,
  entregadosPorHorno,
  puedeExplicar,
  puedeRegistrarPalets = false,
}: {
  fecha: string;
  hoy: string;
  comparacion: ComparacionPlan;
  motivos: Motivo[];
  /**
   * Solo para paletizado: cuantos secaderos entrego el horno ese dia. Sin este
   * numero, un cumplimiento bajo por falta de material se leeria como bajo
   * rendimiento del sector.
   */
  entregadosPorHorno?: number;
  puedeExplicar: boolean;
  /** Solo paletizado: si quien mira puede confirmar palets de ese dia. */
  puedeRegistrarPalets?: boolean;
}) {
  const dia = etiquetaRelativa(fecha, hoy);
  const esFuturo = fecha > hoy;

  if (!comparacion.hayPlan) {
    return (
      <section className="tarjeta border-l-4 border-slate-300 p-4">
        <h2 className="text-sm font-bold text-slate-700">Sin plan · {dia}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {fecha === hoy
            ? "Todavía no se cargó la orden de producción del día. Podés trabajar igual: lo que hagas queda registrado."
            : esFuturo
              ? "Todavía no se cargó la orden de producción de ese día."
              : "Ese día no tuvo orden de producción cargada."}
        </p>
      </section>
    );
  }

  const { lineas, fueraDePlan, totalPedido, totalHecho, palets } = comparacion;
  const cumplimiento = totalPedido > 0 ? totalHecho / totalPedido : 1;
  const faltantes = lineas.filter((l) => !lineaCompleta(l));
  const tiposConPalets = TIPOS_PALET.filter(
    (t) => palets[t].pedidos > 0 || palets[t].hechos > 0,
  );

  /**
   * Lo que se lee sin abrir la seccion.
   *
   * El avance solo no alcanza: "3 de 18" dice que falta, no QUE falta. Un
   * operario que cierra el plan para ganar lugar tendria que volver a abrirlo
   * cada vez que termina una tanda. Por eso el encabezado nombra lo que queda
   * pendiente, producto por producto: es la instruccion en un renglon. Abrir
   * queda para el detalle en placas, la instruccion de paletizado y explicar
   * un desvio.
   */
  const resumen = (
    <>
      {totalPedido === 0 ? null : esFuturo ? (
        <span className="text-sm font-bold tabular-nums text-slate-700">
          {numero(totalPedido)} secaderos pedidos
        </span>
      ) : (
        <span
          className={`text-sm font-bold tabular-nums ${
            cumplimiento >= 1
              ? "text-emerald-600"
              : cumplimiento >= 0.7
                ? "text-slate-700"
                : "text-amber-700"
          }`}
        >
          Secaderos {numero(totalHecho)}/{numero(totalPedido)} ·{" "}
          {porcentaje(totalHecho, totalPedido)}
        </span>
      )}

      {/* Los palets van en su propio renglon y sin topear: 9/7 es 9/7. */}
      {tiposConPalets.map((t) => (
        <span
          key={t}
          className={`block text-sm font-bold tabular-nums ${
            esFuturo
              ? "text-slate-700"
              : palets[t].hechos >= palets[t].pedidos
                ? "text-emerald-600"
                : "text-slate-700"
          }`}
        >
          {ETIQUETA_PALET[t]}{" "}
          {esFuturo
            ? `${numero(palets[t].pedidos)} pedidos`
            : `${numero(palets[t].hechos)}/${numero(palets[t].pedidos)}`}
        </span>
      ))}

      {esFuturo ? (
        lineas.length > 0 && (
          <span className="mt-0.5 block text-xs text-slate-500">
            {lineas
              .map((l) =>
                [
                  l.producto,
                  l.pedidos > 0 ? `${numero(l.pedidos)} sec` : null,
                  ...TIPOS_PALET.map((t) =>
                    l.palets[t].pedidos > 0
                      ? `${numero(l.palets[t].pedidos)} ${CORTO_PALET[t]}`
                      : null,
                  ),
                ]
                  .filter(Boolean)
                  .join(" "),
              )
              .join(" · ")}
          </span>
        )
      ) : faltantes.length > 0 ? (
        <span className="mt-0.5 block text-xs font-semibold text-amber-800">
          Falta:{" "}
          {faltantes
            .map((l) => `${l.producto} ${faltaDeLinea(l).join(" + ")}`)
            .join(" · ")}
        </span>
      ) : (
        <span className="mt-0.5 block text-xs font-semibold text-emerald-700">
          Todo lo pedido está hecho.
        </span>
      )}
    </>
  );

  return (
    <Plegable
      id={`plan-${comparacion.sector}`}
      titulo={`Plan · ${dia}`}
      resumen={resumen}
    >
      {comparacion.nota && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 italic">
          {comparacion.nota}
        </p>
      )}

      {entregadosPorHorno !== undefined && !esFuturo && (
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          El horno entregó <strong>{numero(entregadosPorHorno)}</strong>{" "}
          {entregadosPorHorno === 1 ? "secadero" : "secaderos"} en el día. Si te
          pidieron más de eso, el faltante no es del sector.
        </p>
      )}

      <ul className="space-y-2">
        {lineas.map((l) =>
          esFuturo ? (
            <FilaPedido key={l.lineaId} linea={l} />
          ) : (
            <FilaPlan
              key={l.lineaId}
              linea={l}
              fecha={fecha}
              motivos={motivos}
              puedeExplicar={puedeExplicar}
              puedeRegistrarPalets={puedeRegistrarPalets}
            />
          ),
        )}
      </ul>

      {fueraDePlan.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-600">
            Además, fuera del plan:
          </p>
          <p className="text-xs text-slate-500">
            {fueraDePlan
              .map((f) => {
                const partes = [
                  f.hechos > 0 ? `${numero(f.hechos)} sec` : null,
                  ...TIPOS_PALET.map((t) =>
                    f.palets[t] > 0 ? `${numero(f.palets[t])} ${CORTO_PALET[t]}` : null,
                  ),
                ].filter(Boolean);
                return `${f.producto} (${partes.join(", ")})`;
              })
              .join(", ")}
          </p>
        </div>
      )}
    </Plegable>
  );
}

/**
 * Que hacer con los secaderos de esta linea y para quien.
 *
 * Va debajo del avance y no escondido en una nota: es la instruccion que el
 * paletizador necesita ANTES de descargar, no un dato de consulta. El aviso de
 * que lo que sobra va a placas sueltas se repite en cada linea a proposito;
 * es una regla que se aplica siempre y verla al lado del palet evita la duda.
 */
function Instruccion({
  destino,
  cliente,
}: {
  destino: LineaPlan["destino"];
  cliente: string | null;
}) {
  if (!destino && !cliente) return null;
  // `destino` solo viene en planes viejos: los nuevos piden palets por
  // cantidad, que se muestran en sus propios renglones.

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      {destino && (
        <span className={`chip ${COLOR_DESTINO[destino]}`}>
          {ETIQUETA_DESTINO[destino]}
        </span>
      )}
      {cliente && (
        <span className="text-xs font-semibold text-slate-700">
          Rotular: <span className="text-slate-900">{cliente}</span>
        </span>
      )}
      {destino && destino !== "placa_suelta" && (
        <span className="basis-full text-xs text-slate-500">
          Lo que sobre va a placas sueltas.
        </span>
      )}
    </div>
  );
}

/** Una linea de un dia que todavia no llego: lo pedido y nada mas. */
function FilaPedido({ linea }: { linea: LineaPlan }) {
  return (
    <li className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
          {linea.producto}
        </span>
        {linea.pedidos > 0 && (
          <span className="shrink-0 text-sm font-bold tabular-nums text-slate-700">
            {numero(linea.pedidos)}{" "}
            {linea.pedidos === 1 ? "secadero" : "secaderos"}
          </span>
        )}
      </div>
      {linea.pedidos > 0 && linea.placasEsperadas !== null && (
        <p className="mt-1 text-xs tabular-nums text-slate-500">
          {numero(linea.placasEsperadas)} placas
        </p>
      )}
      {TIPOS_PALET.map(
        (t) =>
          linea.palets[t].pedidos > 0 && (
            <p key={t} className="mt-1 text-sm font-semibold text-slate-700">
              {ETIQUETA_PALET[t]}: {numero(linea.palets[t].pedidos)}
            </p>
          ),
      )}
      <Instruccion destino={linea.destino} cliente={linea.cliente} />
    </li>
  );
}

function FilaPlan({
  linea,
  fecha,
  motivos,
  puedeExplicar,
  puedeRegistrarPalets,
}: {
  linea: LineaPlan;
  fecha: string;
  motivos: Motivo[];
  puedeExplicar: boolean;
  puedeRegistrarPalets: boolean;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [motivoId, setMotivoId] = useState(linea.motivoDesvioId ?? 0);
  const [nota, setNota] = useState(linea.notaDesvio ?? "");

  const secaderosCompletos = linea.hechos >= linea.pedidos;
  const completo = lineaCompleta(linea);
  const falta = faltaDeLinea(linea).join(" + ");
  const avance = linea.pedidos > 0 ? Math.min(1, linea.hechos / linea.pedidos) : 1;
  const conSecaderos = linea.pedidos > 0 || linea.hechos > 0;
  const explicado = linea.motivoDesvioId != null;
  const nombreMotivo = motivos.find((m) => m.id === linea.motivoDesvioId)?.nombre;

  return (
    <li className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
          {linea.producto}
        </span>
        {conSecaderos && (
          <span
            className={`shrink-0 text-sm font-bold tabular-nums ${
              secaderosCompletos ? "text-emerald-600" : "text-slate-700"
            }`}
          >
            {linea.pedidos > 0
              ? `Secaderos ${numero(linea.hechos)} / ${numero(linea.pedidos)}${secaderosCompletos ? " ✓" : ""}`
              : `Secaderos bajados: ${numero(linea.hechos)}`}
          </span>
        )}
      </div>

      {linea.pedidos > 0 && (
        <>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${secaderosCompletos ? "bg-emerald-500" : "bg-blue-500"}`}
              style={{ width: `${avance * 100}%` }}
            />
          </div>

          {/* El detalle en placas revela los secaderos que salieron
              incompletos: 3 de 3 secaderos puede ser 500 de 612 placas. Sin
              tope fijo no hay esperado contra el cual compararlo, asi que va
              solo lo hecho. */}
          <p className="mt-1 text-xs tabular-nums text-slate-500">
            {linea.placasEsperadas === null
              ? `${numero(linea.placas)} placas`
              : `${numero(linea.placas)} de ${numero(linea.placasEsperadas)} placas`}
          </p>
        </>
      )}

      {TIPOS_PALET.map(
        (t) =>
          (linea.palets[t].pedidos > 0 || linea.palets[t].hechos > 0) && (
            <FilaPalets
              key={t}
              tipo={t}
              avance={linea.palets[t]}
              productoId={linea.productoId}
              fecha={fecha}
              puedeRegistrar={puedeRegistrarPalets}
            />
          ),
      )}
      {/* Pedido de palets sin palets de un tipo todavia: igual se puede
          confirmar uno de mas desde aca, en la linea del modelo. */}
      {puedeRegistrarPalets &&
        TIPOS_PALET.every(
          (t) => linea.palets[t].pedidos === 0 && linea.palets[t].hechos === 0,
        ) &&
        linea.destino === null && (
          <AgregarPaletSinPedir productoId={linea.productoId} fecha={fecha} />
        )}

      <Instruccion destino={linea.destino} cliente={linea.cliente} />

      {!completo && (
        <div className="mt-2">
          {explicado ? (
            <p className="text-xs text-slate-600">
              <span className="font-semibold text-amber-800">
                Faltaron {falta}:
              </span>{" "}
              {nombreMotivo ?? "motivo no encontrado"}
              {linea.notaDesvio && ` — ${linea.notaDesvio}`}
              {linea.explicadoPorNombre && (
                <span className="text-slate-400">
                  {" "}
                  ({linea.explicadoPorNombre})
                </span>
              )}
              {puedeExplicar && (
                <button
                  type="button"
                  onClick={() => setAbierto((v) => !v)}
                  className="ml-2 font-semibold text-slate-500 underline"
                >
                  cambiar
                </button>
              )}
            </p>
          ) : puedeExplicar ? (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-300"
            >
              Faltaron {falta} · explicar por qué
            </button>
          ) : (
            <p className="text-xs font-semibold text-amber-800">
              Faltaron {falta}, sin explicar
            </p>
          )}
        </div>
      )}

      {abierto && puedeExplicar && (
        <div className="mt-2 space-y-2">
          <select
            className="campo py-2.5"
            value={motivoId || ""}
            disabled={enviando}
            onChange={(e) => setMotivoId(Number(e.target.value))}
            aria-label={`Motivo del desvío de ${linea.producto}`}
          >
            <option value="">¿Por qué no se llegó?</option>
            {motivos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>

          <input
            className="campo py-2.5"
            placeholder="Detalle (opcional)"
            value={nota}
            maxLength={500}
            disabled={enviando}
            onChange={(e) => setNota(e.target.value)}
          />

          {error && <Aviso>{error}</Aviso>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enviando || !motivoId}
              onClick={async () => {
                const ok = await ejecutar(
                  () =>
                    explicarDesvio({
                      lineaId: linea.lineaId,
                      motivoId,
                      nota: nota.trim() || undefined,
                    }),
                  () => router.refresh(),
                );
                if (ok) setAbierto(false);
              }}
              className="boton-primario px-4 text-sm"
            >
              {enviando ? "Guardando…" : "Guardar"}
            </button>
            {explicado && (
              <button
                type="button"
                disabled={enviando}
                onClick={async () => {
                  const ok = await ejecutar(
                    () =>
                      explicarDesvio({ lineaId: linea.lineaId, motivoId: null }),
                    () => router.refresh(),
                  );
                  if (ok) {
                    setMotivoId(0);
                    setNota("");
                    setAbierto(false);
                  }
                }}
                className="boton-secundario px-4 text-sm"
              >
                Quitar
              </button>
            )}
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="boton-secundario px-4 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Un renglon de palets: lo confirmado contra lo pedido, con los botones para
 * confirmar de a uno, todo junto o descontar un toque de mas.
 *
 * Lo hecho no se topea: si armaron 9 de 7, dice 9/7.
 */
function FilaPalets({
  tipo,
  avance,
  productoId,
  fecha,
  puedeRegistrar,
}: {
  tipo: TipoPalet;
  avance: AvancePalets;
  productoId: number;
  fecha: string;
  puedeRegistrar: boolean;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const { pedidos, hechos } = avance;
  const completo = hechos >= pedidos;

  const registrar = (cantidad: number) =>
    void ejecutar(
      () => registrarPalets({ fecha, productoId, tipo, cantidad }),
      () => router.refresh(),
    );

  return (
    <div className="mt-2 rounded-lg bg-white p-2 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
          {ETIQUETA_PALET[tipo]}
        </span>
        <span
          className={`text-base font-extrabold tabular-nums ${
            hechos > pedidos
              ? "text-blue-700"
              : completo
                ? "text-emerald-600"
                : "text-slate-800"
          }`}
        >
          {numero(hechos)} / {numero(pedidos)}
          {completo && pedidos > 0 && " ✓"}
        </span>
      </div>

      {puedeRegistrar && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={enviando || hechos === 0}
            onClick={() => registrar(-1)}
            className="h-11 w-11 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300 disabled:opacity-30"
            aria-label={`Descontar un ${ETIQUETA_PALET[tipo].toLowerCase()}`}
          >
            −
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => registrar(1)}
            className="h-11 w-11 shrink-0 rounded-lg bg-white text-xl font-bold text-slate-700 ring-1 ring-slate-300"
            aria-label={`Confirmar un ${ETIQUETA_PALET[tipo].toLowerCase()}`}
          >
            +
          </button>
          {!completo && (
            <button
              type="button"
              disabled={enviando}
              onClick={() => registrar(pedidos - hechos)}
              className="boton flex-1 bg-emerald-600 text-sm text-white hover:bg-emerald-700"
            >
              {enviando ? "Guardando…" : `✓ Listo (${numero(pedidos)})`}
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Aviso>{error}</Aviso>
        </div>
      )}
    </div>
  );
}

/** Para una linea sin palets pedidos: confirmar un palet que se armo igual. */
function AgregarPaletSinPedir({
  productoId,
  fecha,
}: {
  productoId: number;
  fecha: string;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-slate-500">¿Armaron un palet igual?</span>
      {TIPOS_PALET.map((t) => (
        <button
          key={t}
          type="button"
          disabled={enviando}
          onClick={() =>
            void ejecutar(
              () => registrarPalets({ fecha, productoId, tipo: t, cantidad: 1 }),
              () => router.refresh(),
            )
          }
          className="rounded-lg bg-white px-2.5 py-1.5 font-semibold text-slate-600 ring-1 ring-slate-300"
        >
          + 1 {CORTO_PALET[t]}
        </button>
      ))}
      {error && <span className="basis-full text-red-600">{error}</span>}
    </div>
  );
}

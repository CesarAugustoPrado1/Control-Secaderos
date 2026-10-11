"use client";

import Link from "next/link";
import type { Sector } from "@/lib/db/schema";
import type { Avance, Cumplimiento } from "@/lib/plan";
import { etiquetaDia } from "@/lib/rangos";

type Resumen = {
  fecha: string;
  sector: Sector;
  lineas: number;
  secaderos: number;
  palets: number;
};

/** Las filas de la semana: los sectores con plan, mas las notas del horno. */
export type Fila = Sector | "horno";

/** En el orden en que pasa el material por la fabrica. */
const FILAS: { clave: Fila; etiqueta: string }[] = [
  { clave: "carrusel", etiqueta: "Carrusel" },
  { clave: "horno", etiqueta: "Horno" },
  { clave: "paletizado", etiqueta: "Paletizado" },
];

/**
 * Vista de la semana: que dias tienen orden cargada y cuales no.
 *
 * Un dia sin plan se muestra como "sin plan" y no como cero. La diferencia
 * importa: el cumplimiento de un dia sin plan no se mide, asi que un olvido no
 * castiga a nadie en las estadisticas.
 *
 * El horno va sin numero: no recibe orden, solo las indicaciones del dia para
 * cargar y descargar. Igual va entre carrusel y paletizado, que es donde esta
 * en el recorrido del material.
 */
export function Semana({
  inicio,
  fechas,
  hoy,
  resumen,
  notasHorno,
  moldes,
  diaElegido,
  filaElegida,
  cumplimiento,
}: {
  inicio: string;
  fechas: string[];
  hoy: string;
  resumen: Resumen[];
  /** Fechas de la semana que tienen notas para el horno. */
  notasHorno: string[];
  /** Fechas de la semana con un set de moldes pedido. */
  moldes: string[];
  diaElegido: string | null;
  filaElegida: Fila;
  /** Lo hecho contra lo pedido de cada dia con plan, hasta hoy. */
  cumplimiento: Cumplimiento[];
}) {
  const avanceDe = (fecha: string, sector: Sector) =>
    cumplimiento.find((c) => c.fecha === fecha && c.sector === sector);
  const buscar = (fecha: string, sector: Sector) =>
    resumen.find((r) => r.fecha === fecha && r.sector === sector);
  const conNotas = new Set(notasHorno);
  const conMoldes = new Set(moldes);

  const correr = (dias: number) => {
    const d = new Date(`${inicio}T12:00:00-03:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  };

  return (
    <section className="tarjeta p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">
          Orden de producción
        </h2>
        <div className="flex gap-1.5">
          <Link
            href={`/admin/plan?desde=${correr(-7)}`}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300"
          >
            ← Semana anterior
          </Link>
          <Link
            href="/admin/plan"
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300"
          >
            Hoy
          </Link>
          <Link
            href={`/admin/plan?desde=${correr(7)}`}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300"
          >
            Semana siguiente →
          </Link>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr>
              <th className="pb-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Sector
              </th>
              {fechas.map((f) => (
                <th
                  key={f}
                  className={`px-1 pb-2 text-center text-xs font-semibold ${
                    f === hoy ? "text-slate-900" : "text-slate-500"
                  }`}
                >
                  {etiquetaDia(f)}
                  {f === hoy && (
                    <span className="block text-[10px] font-bold text-blue-600">
                      HOY
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {FILAS.map((s) => (
              <tr key={s.clave}>
                <td className="py-2 pr-3 font-medium text-slate-800">
                  {s.etiqueta}
                </td>
                {fechas.map((f) => {
                  const activo = diaElegido === f && filaElegida === s.clave;
                  const href = `/admin/plan?desde=${inicio}&dia=${f}&sector=${s.clave}`;
                  const avance =
                    s.clave === "horno" ? undefined : avanceDe(f, s.clave);

                  // Un dia con plan que ya empezo se dibuja como vaso: lleno
                  // hasta donde se cumplio. Paletizado va partido al medio,
                  // secaderos y palets, porque se miden cada uno por su lado.
                  if (avance) {
                    return (
                      <td key={f} className="px-1 py-2 text-center">
                        <Link
                          href={href}
                          className={`flex min-w-14 gap-1 rounded-lg transition hover:opacity-90 ${
                            s.clave === "paletizado" ? "min-w-28" : ""
                          } ${activo ? "ring-2 ring-slate-900 ring-offset-2" : ""}`}
                        >
                          <Vaso avance={avance.secaderos} unidad="sec." />
                          {s.clave === "paletizado" && (
                            <Vaso avance={avance.palets} unidad="pal." />
                          )}
                        </Link>
                      </td>
                    );
                  }

                  const celda =
                    s.clave === "horno"
                      ? conNotas.has(f)
                        ? {
                            valor: "✎",
                            detalle: "notas",
                            color:
                              "bg-orange-50 text-orange-800 ring-1 ring-orange-300 hover:bg-orange-100",
                          }
                        : { valor: "—", detalle: "sin notas", color: null }
                      : (() => {
                          const r = buscar(f, s.clave);
                          const cambiaMoldes =
                            s.clave === "carrusel" && conMoldes.has(f);
                          if (!r && cambiaMoldes) {
                            return {
                              valor: "⟳",
                              detalle: "moldes",
                              color:
                                "bg-blue-50 text-blue-800 ring-1 ring-blue-300 hover:bg-blue-100",
                            };
                          }
                          const soloPalets = r && r.secaderos === 0 && r.palets > 0;
                          return r
                            ? {
                                valor: `${soloPalets ? r.palets : r.secaderos}`,
                                detalle: soloPalets
                                  ? "palets"
                                  : cambiaMoldes
                                    ? "sec. + moldes"
                                    : r.palets > 0
                                      ? `sec. + ${r.palets} pal.`
                                      : "secaderos",
                                color:
                                  "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-100",
                              }
                            : { valor: "—", detalle: "sin plan", color: null };
                        })();
                  return (
                    <td key={f} className="px-1 py-2 text-center">
                      <Link
                        href={href}
                        className={`block min-w-14 rounded-lg px-2 py-2 text-xs font-bold transition ${
                          activo
                            ? "bg-slate-900 text-white"
                            : (celda.color ??
                              "bg-slate-50 text-slate-400 ring-1 ring-slate-200 hover:bg-slate-100")
                        }`}
                      >
                        {celda.valor}
                        <span className="block text-[10px] font-medium opacity-80">
                          {celda.detalle}
                        </span>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ResumenSemana cumplimiento={cumplimiento} />

      <p className="mt-3 text-xs text-slate-500">
        En los días que ya pasaron, cada cajita se llena hasta donde se cumplió
        lo pedido: verde completo, amarillo desde la mitad, rojo por debajo.
        Paletizado va partido en dos: a la izquierda los secaderos y a la
        derecha los palets, que se miden por separado.{" "}
        Tocá un día para cargar o editar su orden. Un día sin plan no se mide
        como incumplimiento: queda marcado como sin plan. En Horno se cargan
        las indicaciones para cargar y descargar, que el hornero ve arriba de
        su pantalla. En Carrusel, «moldes» marca los días con cambio de moldes
        pedido.
      </p>
    </section>
  );
}

/** Porcentaje cumplido, o null si no se pidio nada y no hay contra que medir. */
export function porcentajeCumplido(a: Avance): number | null {
  return a.pedidos > 0 ? Math.round((a.hechos / a.pedidos) * 100) : null;
}

/** Verde cumplido, amarillo desde la mitad, rojo por debajo. */
function colorDe(pct: number) {
  if (pct >= 100) return { relleno: "bg-emerald-300", borde: "ring-emerald-400" };
  if (pct >= 50) return { relleno: "bg-amber-200", borde: "ring-amber-400" };
  return { relleno: "bg-red-200", borde: "ring-red-400" };
}

/**
 * Una mitad de la cajita como un vaso: se llena desde abajo hasta el
 * porcentaje cumplido. Pasarse del 100% no rebalsa el dibujo, pero el numero
 * lo dice: 9 de 7 palets es 129% y tiene que leerse asi.
 */
function Vaso({ avance, unidad }: { avance: Avance; unidad: string }) {
  const pct = porcentajeCumplido(avance);

  if (pct === null) {
    return (
      <span className="flex min-h-14 flex-1 flex-col items-center justify-center rounded-lg bg-slate-50 px-1 py-1.5 text-slate-400 ring-1 ring-slate-200">
        <span className="text-xs font-bold">—</span>
        <span className="text-[10px] font-medium">
          {avance.hechos > 0 ? `${avance.hechos} ${unidad}` : `sin ${unidad}`}
        </span>
      </span>
    );
  }

  const { relleno, borde } = colorDe(pct);
  return (
    <span
      className={`relative flex min-h-14 flex-1 flex-col items-center justify-center overflow-hidden rounded-lg bg-white px-1 py-1.5 ring-1 ${borde}`}
      title={`${avance.hechos} de ${avance.pedidos} ${unidad} (${pct}%)`}
    >
      <span
        aria-hidden
        className={`absolute inset-x-0 bottom-0 ${relleno} transition-all`}
        style={{ height: `${Math.min(pct, 100)}%` }}
      />
      <span className="relative text-xs font-bold text-slate-900 tabular-nums">
        {pct}%
      </span>
      <span className="relative text-[10px] font-medium whitespace-nowrap text-slate-700 tabular-nums">
        {avance.hechos}/{avance.pedidos} {unidad}
      </span>
    </span>
  );
}

/** La semana en numeros: lo hecho contra lo pedido, sumando los dias medidos. */
function ResumenSemana({ cumplimiento }: { cumplimiento: Cumplimiento[] }) {
  const sumar = (sector: Sector, parte: "secaderos" | "palets"): Avance =>
    cumplimiento
      .filter((c) => c.sector === sector)
      .reduce(
        (a, c) => ({
          pedidos: a.pedidos + c[parte].pedidos,
          hechos: a.hechos + c[parte].hechos,
        }),
        { pedidos: 0, hechos: 0 },
      );

  const items = [
    { etiqueta: "Carrusel · secaderos", avance: sumar("carrusel", "secaderos") },
    { etiqueta: "Paletizado · secaderos", avance: sumar("paletizado", "secaderos") },
    { etiqueta: "Paletizado · palets", avance: sumar("paletizado", "palets") },
  ].filter((i) => i.avance.pedidos > 0);

  if (items.length === 0) return null;

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {items.map((i) => {
        const pct = porcentajeCumplido(i.avance)!;
        const { relleno } = colorDe(pct);
        return (
          <div key={i.etiqueta} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {i.etiqueta}
            </p>
            <p className="mt-0.5 text-xl font-bold text-slate-900 tabular-nums">
              {pct}%
              <span className="ml-2 text-xs font-medium text-slate-500">
                {i.avance.hechos} de {i.avance.pedidos}
              </span>
            </p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${relleno}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-slate-500 sm:col-span-3">
        Cumplimiento de la semana, sumando sólo los días con plan que ya
        empezaron.
      </p>
    </div>
  );
}

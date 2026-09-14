"use client";

import Link from "next/link";
import type { Sector } from "@/lib/db/schema";
import { etiquetaDia } from "@/lib/rangos";

type Resumen = {
  fecha: string;
  sector: Sector;
  lineas: number;
  secaderos: number;
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
  diaElegido,
  filaElegida,
}: {
  inicio: string;
  fechas: string[];
  hoy: string;
  resumen: Resumen[];
  /** Fechas de la semana que tienen notas para el horno. */
  notasHorno: string[];
  diaElegido: string | null;
  filaElegida: Fila;
}) {
  const buscar = (fecha: string, sector: Sector) =>
    resumen.find((r) => r.fecha === fecha && r.sector === sector);
  const conNotas = new Set(notasHorno);

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
                          return r
                            ? {
                                valor: `${r.secaderos}`,
                                detalle: "secaderos",
                                color:
                                  "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-100",
                              }
                            : { valor: "—", detalle: "sin plan", color: null };
                        })();
                  return (
                    <td key={f} className="px-1 py-2 text-center">
                      <Link
                        href={`/admin/plan?desde=${inicio}&dia=${f}&sector=${s.clave}`}
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

      <p className="mt-3 text-xs text-slate-500">
        Tocá un día para cargar o editar su orden. Un día sin plan no se mide
        como incumplimiento: queda marcado como sin plan. En Horno se cargan
        las indicaciones para cargar y descargar, que el hornero ve arriba de
        su pantalla.
      </p>
    </section>
  );
}

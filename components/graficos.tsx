"use client";

import { useState } from "react";

/*
 * Graficos simples, hechos con HTML y sin librerias: columnas en el tiempo y
 * barras horizontales. Una sola serie cada uno, en un solo color (azul), con
 * barras finas, esquinas redondeadas solo en la punta, grilla en gris muy
 * claro y los numeros en tinta y no en el color de la barra.
 *
 * Los textos que llegan como datos (nombres de modelos, motivos) se renderizan
 * como texto de React, nunca como HTML.
 */

const AZUL = "#2a78d6";
const AZUL_HOVER = "#1c5cab";
const PISTA = "#e8f1fc";

const fmt = (n: number) => n.toLocaleString("es-AR");

/** Un tope "redondo" para el eje: 7 -> 8, 23 -> 25, 140 -> 150, 1830 -> 2000. */
function topeRedondo(max: number): number {
  if (max <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (max <= m * potencia) return m * potencia;
  }
  return 10 * potencia;
}

export type PuntoColumna = {
  clave: string;
  /** Etiqueta corta para el eje: "lun 21", "sep". */
  etiqueta: string;
  /** Etiqueta completa para el detalle: "lunes 21/09". */
  titulo: string;
  valor: number;
  /** Renglones extra del detalle, ya formateados: "355 placas". */
  detalle?: string[];
};

/**
 * Columnas en el tiempo, una por dia o por mes.
 *
 * Al pasar el mouse o tocar una columna aparece su detalle; el maximo lleva el
 * numero arriba y una linea fina marca el promedio, para que se lea de un
 * vistazo sin tener que tocar nada.
 */
export function GraficoColumnas({
  datos,
  unidad,
  alto = 170,
  valoresEnTodas = false,
}: {
  datos: PuntoColumna[];
  /** En plural: "secaderos". */
  unidad: string;
  alto?: number;
  /**
   * El numero arriba de cada columna, no solo del maximo. Con muchas columnas
   * va de costado para que entre.
   */
  valoresEnTodas?: boolean;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  if (datos.length === 0) return null;

  const max = Math.max(...datos.map((d) => d.valor));
  const deCostado = valoresEnTodas && datos.length > 12;
  // Con numeros en todas las columnas se deja aire arriba para que el de la
  // mas alta no se salga del grafico.
  const tope = topeRedondo(max * (valoresEnTodas ? (deCostado ? 1.35 : 1.15) : 1));
  const conValor = datos.filter((d) => d.valor > 0);
  const promedio =
    conValor.length > 0
      ? conValor.reduce((a, d) => a + d.valor, 0) / conValor.length
      : 0;
  const iMax = datos.findIndex((d) => d.valor === max);
  // Con muchas columnas no entran todas las etiquetas: se muestra una de cada
  // tantas, y la ultima solo si no queda pegada a la anterior.
  const cada = datos.length <= 12 ? 1 : Math.ceil(datos.length / 8);
  const ultima = datos.length - 1;
  const conEtiqueta = (i: number) =>
    i % cada === 0 || (i === ultima && ultima % cada >= cada / 2);
  const pct = (v: number) => (v / tope) * 100;

  const sel = activo === null ? null : datos[activo];

  return (
    <div className="select-none">
      <div className="flex gap-2">
        {/* Eje Y: tres valores redondos. */}
        <div
          className="relative w-8 shrink-0 text-right text-[11px] text-slate-400 tabular-nums"
          style={{ height: alto }}
        >
          {[tope, tope / 2, 0].map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${100 - pct(v)}%` }}
            >
              {fmt(Math.round(v * 10) / 10)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="relative" style={{ height: alto }}>
            {/* Grilla: lineas finas, solidas y recesivas. */}
            {[0.5, 1].map((f) => (
              <div
                key={f}
                className="absolute inset-x-0 h-px bg-slate-100"
                style={{ top: `${100 - f * 100}%` }}
              />
            ))}
            <div className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />

            {/* Promedio de los dias con trabajo. */}
            {promedio > 0 && conValor.length > 1 && (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 h-px bg-slate-500"
                style={{ bottom: `${pct(promedio)}%` }}
              >
                {/* Con numeros en todas las columnas la etiqueta se pisaria con
                    ellos: queda la linea y el promedio se dice debajo. */}
                {!valoresEnTodas && (
                  <span className="absolute -top-4 right-0 rounded bg-white/90 px-1 text-[10px] font-semibold text-slate-600">
                    promedio {fmt(Math.round(promedio * 10) / 10)}
                  </span>
                )}
              </div>
            )}

            <div className="absolute inset-0 flex items-end">
              {datos.map((d, i) => (
                <button
                  key={d.clave}
                  type="button"
                  onPointerEnter={() => setActivo(i)}
                  onPointerLeave={() => setActivo(null)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  onClick={() => setActivo(i)}
                  aria-label={`${d.titulo}: ${fmt(d.valor)} ${unidad}`}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                >
                  {(valoresEnTodas ? d.valor > 0 : i === iMax && max > 0) && (
                    <span
                      className={`absolute z-10 font-bold whitespace-nowrap text-slate-800 tabular-nums ${
                        deCostado ? "rotate-180 text-[10px] [writing-mode:vertical-rl]" : "text-[11px]"
                      }`}
                      style={{ bottom: `calc(${pct(d.valor)}% + 2px)` }}
                    >
                      {fmt(d.valor)}
                    </span>
                  )}
                  <span
                    className="block rounded-t transition-colors"
                    style={{
                      width: "min(24px, 70%)",
                      height: `${pct(d.valor)}%`,
                      background: activo === i ? AZUL_HOVER : AZUL,
                    }}
                  />
                </button>
              ))}
            </div>

            {/* Detalle de la columna elegida. */}
            {sel && activo !== null && (
              <div
                className="pointer-events-none absolute top-0 z-20 w-max max-w-48 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200"
                style={{
                  left: `${((activo + 0.5) / datos.length) * 100}%`,
                  transform:
                    activo < datos.length / 2
                      ? "translateX(-10%)"
                      : "translateX(-90%)",
                }}
              >
                <p className="text-sm font-bold text-slate-900">
                  {fmt(sel.valor)} {unidad}
                </p>
                <p className="text-slate-500">{sel.titulo}</p>
                {sel.detalle?.map((r) => (
                  <p key={r} className="text-slate-600">
                    {r}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Eje X: cada etiqueta centrada bajo su columna, sin cortarse. */}
          <div className="relative mt-1.5 h-4 text-[10px] text-slate-500">
            {datos.map((d, i) =>
              conEtiqueta(i) ? (
                <span
                  key={d.clave}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${((i + 0.5) / datos.length) * 100}%` }}
                >
                  {d.etiqueta}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type BarraDato = { etiqueta: string; valor: number; detalle?: string };

/**
 * Barras horizontales, de mayor a menor, con el numero en la punta. Sirven
 * para comparar categorias sin orden propio: modelos, motivos, tipos de
 * movimiento, operarios.
 */
export function BarrasHorizontales({
  datos,
  unidad,
}: {
  datos: BarraDato[];
  unidad?: string;
}) {
  const max = Math.max(...datos.map((d) => d.valor), 1);
  return (
    <ul className="space-y-3">
      {datos.map((d) => (
        <li key={d.etiqueta} title={`${d.etiqueta}: ${fmt(d.valor)}${unidad ? ` ${unidad}` : ""}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-slate-700">
              {d.etiqueta}
            </span>
            <span className="shrink-0 text-slate-500">
              <strong className="text-slate-900">{fmt(d.valor)}</strong>
              {d.detalle && ` · ${d.detalle}`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: PISTA }}>
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.valor / max) * 100}%`, background: AZUL }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

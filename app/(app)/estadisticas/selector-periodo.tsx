"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { esFecha } from "@/lib/rangos";
import { TIPOS_PERIODO, type TipoPeriodo } from "@/lib/periodos";

/**
 * Que periodo se esta mirando: dia, semana, mes o año, con flechas para ir al
 * anterior o al siguiente y el calendario para saltar a cualquiera.
 *
 * `consulta` son los demas parametros de la pagina (categoria, unidad): se
 * conservan al cambiar de periodo para no perder lo que se estaba mirando.
 */
export function SelectorPeriodo({
  tipo,
  inicio,
  anterior,
  siguiente,
  etiqueta,
  enCurso,
  hoy,
  consulta,
}: {
  tipo: TipoPeriodo;
  inicio: string;
  anterior: string;
  siguiente: string;
  etiqueta: string;
  enCurso: boolean;
  hoy: string;
  consulta: string;
}) {
  const router = useRouter();
  const hrefDe = (t: TipoPeriodo, fecha: string) =>
    `/estadisticas?${consulta ? `${consulta}&` : ""}periodo=${t}&fecha=${fecha}`;
  const ir = (fecha: string) => router.push(hrefDe(tipo, fecha), { scroll: false });

  const anioActual = Number(hoy.slice(0, 4));
  const anioElegido = Number(inicio.slice(0, 4));
  // Desde 2025, que es cuando arranco la app, hasta el año que viene; y el
  // elegido siempre, por si llego desde un link a un año fuera de esa lista.
  const anios = Array.from(
    new Set([
      ...Array.from({ length: anioActual - 2025 + 2 }, (_, i) => 2025 + i),
      anioElegido,
    ]),
  ).sort((a, b) => a - b);

  const flecha =
    "flex items-center justify-center rounded-lg bg-white px-3 text-lg font-bold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50";
  const campo =
    "min-w-0 rounded-lg bg-white px-2 py-1.5 text-sm font-semibold tabular-nums text-slate-700 ring-1 ring-slate-300 outline-none";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {TIPOS_PERIODO.map((t) => (
          <Link
            key={t.tipo}
            // Al cambiar de tipo se queda en el mismo momento: pasar de "mes de
            // septiembre" a "semana" muestra una semana de septiembre, no la
            // de hoy. Si el periodo actual incluye hoy, va a hoy.
            href={hrefDe(t.tipo, enCurso ? hoy : inicio)}
            scroll={false}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              t.tipo === tipo
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {t.etiqueta}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-stretch gap-2">
        <Link
          href={hrefDe(tipo, anterior)}
          scroll={false}
          className={flecha}
          aria-label="Período anterior"
        >
          ‹
        </Link>

        {tipo === "anio" ? (
          <select
            value={anioElegido}
            onChange={(e) => ir(`${e.target.value}-01-01`)}
            aria-label="Elegir año"
            className={campo}
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        ) : tipo === "mes" ? (
          <input
            type="month"
            value={inicio.slice(0, 7)}
            onChange={(e) => {
              if (/^\d{4}-\d{2}$/.test(e.target.value)) ir(`${e.target.value}-01`);
            }}
            aria-label="Elegir mes"
            className={campo}
          />
        ) : (
          <input
            type="date"
            value={inicio}
            onChange={(e) => {
              if (esFecha(e.target.value)) ir(e.target.value);
            }}
            aria-label={tipo === "semana" ? "Elegir un día de la semana" : "Elegir día"}
            className={campo}
          />
        )}

        <Link
          href={hrefDe(tipo, siguiente)}
          scroll={false}
          className={flecha}
          aria-label="Período siguiente"
        >
          ›
        </Link>

        {!enCurso && (
          <Link
            href={hrefDe(tipo, hoy)}
            scroll={false}
            className="flex items-center rounded-lg px-3 text-xs font-bold text-slate-600 underline underline-offset-2"
          >
            Volver a hoy
          </Link>
        )}
      </div>

      <p className="text-sm font-semibold text-slate-800">
        {etiqueta}
        {enCurso && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            en curso
          </span>
        )}
      </p>
    </div>
  );
}

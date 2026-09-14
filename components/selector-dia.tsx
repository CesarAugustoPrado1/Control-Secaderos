"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DIAS_RAPIDOS, esFecha, etiquetaDia, sumarDias } from "@/lib/rangos";

/**
 * Que dia se esta mirando en una pantalla de operario.
 *
 * Mira para atras -lo que se hizo- y para adelante -lo que se pide-: el plan de
 * mañana o las notas del horno de pasado ya pueden estar cargados aunque ese
 * dia todavia no tenga movimientos. Los cinco dias de alrededor van a un toque
 * y cualquier otro sale del calendario.
 *
 * Solo cambia lo que se MUESTRA. Cargar, meter o descargar un secadero se
 * registra siempre con la hora de ahora, y por eso fuera de hoy se avisa.
 */
export function SelectorDia({
  rutaBase,
  fecha,
  hoy,
}: {
  rutaBase: string;
  fecha: string;
  hoy: string;
}) {
  const router = useRouter();
  const hrefDe = (d: string) => (d === hoy ? rutaBase : `${rutaBase}?dia=${d}`);
  const esRapido = DIAS_RAPIDOS.some((d) => sumarDias(hoy, d.dias) === fecha);

  return (
    <div>
      <div className="flex flex-wrap items-stretch gap-1.5">
        {DIAS_RAPIDOS.map((d) => {
          const dia = sumarDias(hoy, d.dias);
          const activo = dia === fecha;
          return (
            <Link
              key={d.dias}
              href={hrefDe(dia)}
              scroll={false}
              className={`min-w-14 flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-bold transition sm:flex-none ${
                activo
                  ? "bg-slate-900 text-white"
                  : d.dias === 0
                    ? "bg-white text-slate-900 ring-2 ring-slate-400"
                    : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
              }`}
            >
              {d.etiqueta}
              <span className="block text-[10px] font-medium opacity-70">
                {etiquetaDia(dia)}
              </span>
            </Link>
          );
        })}

        <label
          className={`flex min-w-36 flex-1 items-center gap-2 rounded-lg px-2 py-1 sm:flex-none ${
            esRapido
              ? "bg-white ring-1 ring-slate-300"
              : "bg-slate-900 text-white"
          }`}
        >
          <span className="text-xs font-bold whitespace-nowrap">Otro día</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => {
              if (esFecha(e.target.value)) {
                router.push(hrefDe(e.target.value), { scroll: false });
              }
            }}
            aria-label="Elegir cualquier día"
            className={`min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums outline-none ${
              esRapido ? "text-slate-700" : "text-white [color-scheme:dark]"
            }`}
          />
        </label>
      </div>

      {fecha !== hoy && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
          <span>
            Estás mirando <strong>{fecha < hoy ? "un día pasado" : "un día que viene"}</strong>.
            Lo que registres se guarda igual con la fecha de hoy.
          </span>
          <Link
            href={rutaBase}
            scroll={false}
            className="font-bold underline underline-offset-2"
          >
            Volver a hoy
          </Link>
        </p>
      )}
    </div>
  );
}

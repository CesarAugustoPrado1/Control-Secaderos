import Link from "next/link";
import { etiquetaRelativa, sumarDias } from "@/lib/rangos";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "Martes 20 de octubre de 2026". */
function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const dia = DIAS[new Date(`${fecha}T12:00:00-03:00`).getUTCDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d} de ${MESES[m - 1]} de ${a}`;
}

const FLECHA =
  "inline-flex h-11 min-w-11 items-center justify-center rounded-lg bg-white px-3 text-lg font-bold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50";
const BOTON =
  "inline-flex h-10 items-center justify-center rounded-lg bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50";

/**
 * La fecha arriba de todo, grande, con flechas al dia anterior y al siguiente:
 * la hoja de produccion se arma y se lee dia por dia. Saltar a otro dia es un
 * formulario comun, sin JavaScript, asi anda aunque la pagina no haya
 * terminado de cargar.
 */
export function BarraDia({ dia, hoy }: { dia: string; hoy: string }) {
  const url = (d: string) => `/admin/plan?dia=${d}`;
  const relativo = etiquetaRelativa(dia, hoy);
  const esRapido = !/\d/.test(relativo);

  return (
    <section className="tarjeta p-3">
      <div className="flex items-center gap-2">
        <Link href={url(sumarDias(dia, -1))} aria-label="Día anterior" className={FLECHA}>
          ‹
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-base leading-tight font-bold text-balance text-slate-900 sm:text-lg">
            {fechaLarga(dia)}
          </p>
          {esRapido && (
            <p
              className={`text-xs font-semibold ${dia === hoy ? "text-blue-700" : "text-slate-500"}`}
            >
              {relativo}
            </p>
          )}
        </div>
        <Link href={url(sumarDias(dia, 1))} aria-label="Día siguiente" className={FLECHA}>
          ›
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 pt-3">
        {dia !== hoy && (
          <Link href={url(hoy)} className={BOTON}>
            Hoy
          </Link>
        )}
        {dia !== sumarDias(hoy, 1) && (
          <Link href={url(sumarDias(hoy, 1))} className={BOTON}>
            Mañana
          </Link>
        )}
        <form action="/admin/plan" className="flex items-center gap-2">
          <input
            type="date"
            name="dia"
            defaultValue={dia}
            key={dia}
            aria-label="Ir a otro día"
            className="h-10 rounded-lg bg-white px-2 text-sm ring-1 ring-slate-300"
          />
          <button type="submit" className={BOTON}>
            Ir
          </button>
        </form>
      </div>
    </section>
  );
}

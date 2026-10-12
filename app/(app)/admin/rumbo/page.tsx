import { leerRumbo } from "@/lib/consultas";
import { HITOS, INICIO_DESARROLLO } from "@/lib/historial";
import { nombreMes } from "@/lib/periodos";
import { fechaLocal } from "@/lib/rangos";
import { EditorRumbo } from "./editor";

export const metadata = { title: "Rumbo · Administración" };
export const dynamic = "force-dynamic";

/** Dias corridos entre dos fechas YYYY-MM-DD, contando las dos puntas. */
function diasEntre(desde: string, hasta: string): number {
  const a = new Date(`${desde}T12:00:00-03:00`).getTime();
  const b = new Date(`${hasta}T12:00:00-03:00`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

const fechaCorta = (f: string) => {
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * El rumbo de la app a golpe de vista: para que existe, a donde va y de donde
 * viene. Arriba lo que se quiere lograr, editable; abajo la historia.
 */
export default async function PaginaRumbo() {
  const rumbo = await leerRumbo();
  const hoy = fechaLocal();
  const dias = diasEntre(INICIO_DESARROLLO, hoy);
  const ultimo = HITOS[HITOS.length - 1];
  const meses = new Set(HITOS.map((h) => h.fecha.slice(0, 7))).size;

  // Del mas nuevo al mas viejo, agrupado por mes.
  const porMes = new Map<string, typeof HITOS>();
  for (const h of [...HITOS].reverse()) {
    const mes = h.fecha.slice(0, 7);
    porMes.set(mes, [...(porMes.get(mes) ?? []), h]);
  }

  return (
    <div className="max-w-3xl space-y-8">
      <EditorRumbo inicial={rumbo} />

      <section>
        <h2 className="text-lg font-bold text-slate-900">Historial de desarrollo</h2>
        <p className="mt-0.5 mb-4 text-sm text-slate-500">
          Los cambios más importantes, del más nuevo al más viejo.
        </p>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <Dato valor={String(dias)} rotulo="días de desarrollo" detalle={`desde el ${fechaCorta(INICIO_DESARROLLO)}`} />
          <Dato valor={String(HITOS.length)} rotulo="hitos" detalle={`en ${meses} ${meses === 1 ? "mes" : "meses"}`} />
          <Dato valor={fechaCorta(ultimo.fecha).slice(0, 5)} rotulo="último cambio" detalle={ultimo.titulo} />
        </div>

        <div className="space-y-6">
          {[...porMes.entries()].map(([mes, hitos]) => (
            <div key={mes}>
              <h3 className="mb-3 text-xs font-bold tracking-wide text-slate-500 uppercase">
                {nombreMes(mes)}
              </h3>
              <ol className="relative space-y-4 border-l-2 border-slate-200 pl-5">
                {hitos.map((h) => (
                  <li key={`${h.fecha}-${h.titulo}`} className="relative">
                    <span
                      aria-hidden
                      className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full bg-slate-900 ring-4 ring-white"
                    />
                    <div className="tarjeta p-3.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-900 tabular-nums">
                          {fechaCorta(h.fecha)}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                          {h.area}
                        </span>
                      </div>
                      <p className="mt-1 font-bold text-slate-900">{h.titulo}</p>
                      <p className="mt-0.5 text-sm text-slate-600">{h.detalle}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Dato({ valor, rotulo, detalle }: { valor: string; rotulo: string; detalle: string }) {
  return (
    <div className="tarjeta p-3.5">
      <p className="text-2xl leading-none font-bold text-slate-900">{valor}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{rotulo}</p>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">{detalle}</p>
    </div>
  );
}

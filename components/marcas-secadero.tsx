import { numero } from "@/lib/formato";

/**
 * Marcas de un secadero que se aparta del flujo optimo (completo y con un solo
 * producto).
 *
 * Son DOS condiciones independientes que pueden darse a la vez, asi que no van
 * como un color: con color habria que inventar un cuarto tono para "ambas" y
 * ademas competiria con los colores de tipo y de estado, que ya ocupan ese
 * canal. Van como insignias que se apilan, cada una con su forma propia.
 *
 * La incompleta muestra el numero: de un vistazo se distingue un secadero al
 * que le faltan tres placas por rotura de uno que salio cargado a medias.
 */
export function MarcasSecadero({
  total,
  capacidad,
  productos,
  compacto,
}: {
  total: number;
  capacidad: number;
  /** Cuantos productos distintos tiene adentro. */
  productos: number;
  /** Version corta, para listas muy densas. */
  compacto?: boolean;
}) {
  const incompleto = total > 0 && total < capacidad;
  const mixto = productos > 1;

  if (!incompleto && !mixto) return null;

  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {incompleto && (
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-300">
          <span aria-hidden>◑</span>
          {compacto
            ? `${numero(total)}/${numero(capacidad)}`
            : `INCOMPLETO ${numero(total)}/${numero(capacidad)}`}
        </span>
      )}
      {mixto && (
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-bold text-violet-800 ring-1 ring-violet-300">
          <span aria-hidden>⧉</span>
          {compacto ? `${productos}` : `MIXTO · ${productos} productos`}
        </span>
      )}
    </span>
  );
}

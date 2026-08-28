import Link from "next/link";
import type { MovimientoVista } from "@/lib/consultas";
import { CLAVES_RANGO, ETIQUETA_RANGO, type ClaveRango } from "@/lib/rangos";
import { hora, numero } from "@/lib/formato";

/**
 * Lo hecho en el periodo, en la propia pantalla del operario.
 *
 * Reemplaza a la lista de secaderos disponibles, que con ~250 unidades no era
 * una cola de trabajo sino un muro de scroll. Esto en cambio le confirma al
 * operario lo que ya hizo -y lo que hizo el compañero de turno-, que es lo que
 * evita cargar dos veces el mismo secadero.
 */
export function Actividad({
  titulo,
  movimientos,
  rango,
  rutaBase,
  vacio,
}: {
  titulo: string;
  movimientos: MovimientoVista[];
  rango: ClaveRango;
  rutaBase: string;
  vacio: string;
}) {
  const totalPlacas = movimientos.reduce(
    (a, m) => a + m.lineas.reduce((b, l) => b + l.cantidad, 0),
    0,
  );
  const totalRotas = movimientos.reduce(
    (a, m) => a + m.lineas.reduce((b, l) => b + l.desperdicio, 0),
    0,
  );

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">{titulo}</h2>
        <div className="flex gap-1.5">
          {CLAVES_RANGO.map((c) => (
            <Link
              key={c}
              href={c === "hoy" ? rutaBase : `${rutaBase}?rango=${c}`}
              scroll={false}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                rango === c
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-300"
              }`}
            >
              {ETIQUETA_RANGO[c]}
            </Link>
          ))}
        </div>
      </div>

      {movimientos.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          {vacio}
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-500">
            {movimientos.length}{" "}
            {movimientos.length === 1 ? "secadero" : "secaderos"} ·{" "}
            {numero(totalPlacas)} placas
            {totalRotas > 0 && (
              <span className="font-semibold text-red-600">
                {" "}
                · {numero(totalRotas)} rotas
              </span>
            )}
          </p>

          <ul className="space-y-2">
            {movimientos.map((m) => {
              const placas = m.lineas.reduce((a, l) => a + l.cantidad, 0);
              const rotas = m.lineas.reduce((a, l) => a + l.desperdicio, 0);
              return (
                <li key={m.id} className="tarjeta flex items-start gap-3 p-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base font-bold tabular-nums text-slate-700">
                    {m.secaderoNumero}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {numero(placas)} placas
                      {rotas > 0 && (
                        <span className="ml-2 text-xs font-bold text-red-600">
                          −{numero(rotas)}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {m.lineas
                        .filter((l) => l.cantidad > 0)
                        .map((l) => `${l.productoNombre} (${numero(l.cantidad)})`)
                        .join(", ")}
                    </p>
                    <p className="text-xs text-slate-400">{m.usuarioNombre}</p>
                  </div>

                  <span className="shrink-0 text-xs tabular-nums text-slate-400">
                    {hora(m.creadoEn)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

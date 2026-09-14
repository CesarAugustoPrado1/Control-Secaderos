import type { MovimientoVista } from "@/lib/consultas";
import { hora, numero } from "@/lib/formato";
import { MarcasSecadero } from "@/components/marcas-secadero";
import { ChipTipo } from "@/components/ui";

/**
 * Lo hecho en el periodo, en la propia pantalla del operario.
 *
 * Reemplaza a la lista de secaderos disponibles, que con ~250 unidades no era
 * una cola de trabajo sino un muro de scroll. Esto en cambio le confirma al
 * operario lo que ya hizo -y lo que hizo el compañero de turno-, que es lo que
 * evita cargar dos veces el mismo secadero.
 *
 * El dia lo elige el selector de arriba de la pantalla, que es el mismo que
 * cambia el plan: tener dos selectores de fecha distintos en una pantalla era
 * invitar a mirar el plan de un dia y lo hecho de otro.
 */
export function Actividad({
  titulo,
  dia,
  movimientos,
  vacio,
}: {
  titulo: string;
  /** "Hoy", "Ayer", "lun 14/09": el dia que se esta mirando. */
  dia: string;
  movimientos: MovimientoVista[];
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
      <h2 className="mb-3 text-base font-bold text-slate-900">
        {titulo} · {dia}
      </h2>

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
            {movimientos.map((m, i) => {
              const placas = m.lineas.reduce((a, l) => a + l.cantidad, 0);
              const rotas = m.lineas.reduce((a, l) => a + l.desperdicio, 0);
              // La lista viene del mas viejo al mas nuevo, en el mismo orden en
              // que fueron saliendo del carrusel.
              const orden = i + 1;
              return (
                <li key={m.id} className="tarjeta flex items-start gap-3 p-3">
                  <span className="w-7 shrink-0 pt-2.5 text-right text-sm font-bold tabular-nums text-slate-400">
                    {orden}
                  </span>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base font-bold tabular-nums text-slate-700">
                    {m.secaderoNumero}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                      <span>
                        {numero(placas)} placas
                        {rotas > 0 && (
                          <span className="ml-2 text-xs font-bold text-red-600">
                            −{numero(rotas)}
                          </span>
                        )}
                      </span>
                      {/* Snapshot del tipo al momento del movimiento, no el
                          actual: si al secadero le cambiaron el tipo despues,
                          el historial tiene que seguir diciendo la verdad. */}
                      <ChipTipo
                        id={m.secaderoTipoId ?? 0}
                        nombre={m.secaderoTipoNombre}
                      />
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {m.lineas
                        .filter((l) => l.cantidad > 0)
                        .map((l) => `${l.productoNombre} (${numero(l.cantidad)})`)
                        .join(", ")}
                    </p>
                    {m.capacidad != null && (
                      <MarcasSecadero
                        total={placas}
                        capacidad={m.capacidad}
                        productos={
                          m.lineas.filter((l) => l.cantidad > 0).length
                        }
                      />
                    )}
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

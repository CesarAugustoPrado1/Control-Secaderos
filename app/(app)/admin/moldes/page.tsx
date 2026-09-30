import { leerConfig } from "@/lib/consultas";
import {
  ajustesDeInventario,
  cambiosDeMoldes,
  inventarioEn,
  inventarioMoldes,
  montadoEn,
  ultimoCambioVigente,
} from "@/lib/moldes";
import {
  ETIQUETA_MOTIVO_INVENTARIO,
  ETIQUETA_MOTIVO_MOLDES,
  listaMoldes,
} from "@/lib/moldes-comun";
import { fechaHora, numero } from "@/lib/formato";
import { finDeHoy } from "@/lib/rangos";
import { SalenEntran } from "@/components/moldes-carrusel";
import { Inventario } from "./inventario";
import { AnularCambio } from "./anular";

export const metadata = { title: "Moldes · Administración" };
export const dynamic = "force-dynamic";

/** "2026-09-30T14:30" en hora argentina, que es lo que da un datetime-local. */
const esInstante = (v?: string) =>
  !!v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);

export default async function PaginaAdminMoldes({
  searchParams,
}: {
  searchParams: Promise<{ en?: string }>;
}) {
  const { en } = await searchParams;
  // Hasta el final del minuto elegido: "a las 16:13" incluye lo que se
  // registro a las 16:13:40.
  const instante = esInstante(en) ? new Date(`${en}:59.999-03:00`) : null;

  const hace120 = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  const [
    inventario,
    config,
    cambios,
    ultimoId,
    montadoAhora,
    montadoEntonces,
    ajustes,
    inventarioEntonces,
    [primerAjuste],
  ] = await Promise.all([
      inventarioMoldes(),
      leerConfig(),
      // Los ultimos 120 dias alcanzan para el historial en pantalla; para un
      // momento puntual mas viejo esta la consulta de arriba.
      cambiosDeMoldes(hace120, finDeHoy(), 300),
      ultimoCambioVigente(),
      montadoEn(),
      instante ? montadoEn(instante) : Promise.resolve(null),
      ajustesDeInventario(hace120, finDeHoy()),
      instante ? inventarioEn(instante) : Promise.resolve(null),
      ajustesDeInventario(new Date(0), finDeHoy(), 1),
    ]);

  const lugares = config.moldes_carrusel;
  const totalInventario = inventario
    .filter((p) => p.activo)
    .reduce((a, p) => a + p.moldes, 0);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">
          Inventario de moldes
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Cuántos moldes hay de cada modelo, montados o no. Es el techo de lo que
          se puede pedir en el plan. Actualizalo cuando se den de baja moldes
          deteriorados o lleguen nuevos. Hay {numero(totalInventario)} moldes en
          total para {numero(lugares)} lugares del carrusel.
        </p>
        <Inventario
          productos={inventario.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            moldes: p.moldes,
            activo: p.activo,
            montados:
              montadoAhora?.set.find((l) => l.productoId === p.id)?.cantidad ?? 0,
          }))}
          sinHistorial={!primerAjuste}
        />
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">
          Historial del inventario
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Cada vez que cambió la cantidad de moldes de un modelo, en los últimos
          120 días: de cuánto a cuánto, por qué y quién lo cargó.
        </p>
        {ajustes.length === 0 ? (
          <p className="tarjeta p-4 text-sm text-slate-400">
            Todavía no se registró ningún cambio de inventario.
          </p>
        ) : (
          <ul className="tarjeta divide-y divide-slate-100 px-4">
            {ajustes.map((a) => {
              const delta = a.despues - a.antes;
              return (
                <li key={a.id} className="py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-slate-800">
                      {a.productoNombre}
                    </span>
                    <span className="text-sm tabular-nums text-slate-600">
                      {numero(a.antes)} → {numero(a.despues)}
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        delta > 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {delta > 0 ? "+" : "−"}
                      {numero(Math.abs(delta))}
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      {fechaHora(a.creadoEn)} · {a.usuarioNombre}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    {ETIQUETA_MOTIVO_INVENTARIO[a.motivo]}
                    {a.nota && ` — ${a.nota}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">
          ¿Qué había montado?
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Elegí un día y una hora para ver el set de moldes que estaba en el
          carrusel en ese momento, y cuántos moldes había en el inventario.
        </p>
        <form className="tarjeta flex flex-wrap items-end gap-2 p-4">
          <label className="block">
            <span className="etiqueta">Momento</span>
            <input
              type="datetime-local"
              name="en"
              defaultValue={esInstante(en) ? en : undefined}
              className="campo"
              required
            />
          </label>
          <button type="submit" className="boton-primario">
            Ver
          </button>
        </form>
        {instante && (
          <div className="tarjeta mt-3 p-4">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Montado en el carrusel
            </p>
            {montadoEntonces ? (
              <>
                <p className="text-sm font-bold text-slate-900">
                  {numero(montadoEntonces.total)} / {numero(montadoEntonces.lugares)}{" "}
                  moldes
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {listaMoldes(montadoEntonces.set)}
                </p>
                {montadoEntonces.motivoIncompleto && (
                  <p className="mt-1 text-xs text-amber-800">
                    {ETIQUETA_MOTIVO_MOLDES[montadoEntonces.motivoIncompleto]}
                    {montadoEntonces.nota && ` — ${montadoEntonces.nota}`}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  Registrado el {fechaHora(montadoEntonces.creadoEn)} por{" "}
                  {montadoEntonces.usuarioNombre}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Para ese momento todavía no se había cargado ningún set de moldes.
              </p>
            )}

            <p className="mt-4 mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Inventario
            </p>
            {inventarioEntonces && inventarioEntonces.length > 0 ? (
              <p className="text-sm text-slate-700">
                {inventarioEntonces
                  .map((i) => `${numero(i.moldes)} ${i.nombre}`)
                  .join(" · ")}{" "}
                <span className="text-slate-500">
                  (total{" "}
                  {numero(inventarioEntonces.reduce((a, i) => a + i.moldes, 0))})
                </span>
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                Para ese momento todavía no se había cargado el inventario.
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-bold text-slate-900">
          Historial de cambios
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Los cambios de moldes de los últimos 120 días, del más nuevo al más
          viejo. Sólo se puede anular el último.
        </p>
        {cambios.length === 0 ? (
          <p className="tarjeta p-4 text-sm text-slate-400">
            Todavía no se registró ningún cambio de moldes.
          </p>
        ) : (
          <ul className="space-y-2">
            {cambios.map((c) => (
              <li
                key={c.id}
                className={`tarjeta p-3 ${c.anuladoEn ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-sm font-bold text-slate-800">
                    {fechaHora(c.creadoEn)}
                  </span>
                  <span className="text-sm text-slate-500">{c.usuarioNombre}</span>
                  <span
                    className={`ml-auto text-xs font-bold tabular-nums ${
                      c.total < c.lugares ? "text-amber-700" : "text-emerald-700"
                    }`}
                  >
                    {numero(c.total)}/{numero(c.lugares)}
                  </span>
                </div>
                <div className={`mt-1 ${c.anuladoEn ? "line-through" : ""}`}>
                  {c.inicial ? (
                    <p className="text-xs text-slate-700">
                      Set inicial: {listaMoldes(c.set)}
                    </p>
                  ) : (
                    <SalenEntran salen={c.salen} entran={c.entran} />
                  )}
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Quedó: {listaMoldes(c.set)}
                  </p>
                </div>
                {c.motivoIncompleto && (
                  <p className="text-xs text-amber-800">
                    {ETIQUETA_MOTIVO_MOLDES[c.motivoIncompleto]}
                    {c.nota && ` — ${c.nota}`}
                  </p>
                )}
                {!c.motivoIncompleto && c.nota && (
                  <p className="text-xs text-slate-500">{c.nota}</p>
                )}
                {c.anuladoEn && (
                  <p className="text-xs font-semibold text-red-700">
                    Anulado por {c.anuladoPorNombre} el {fechaHora(c.anuladoEn)}
                    {c.motivoAnulacion && `: ${c.motivoAnulacion}`}
                  </p>
                )}
                {!c.anuladoEn && c.id === ultimoId && <AnularCambio id={c.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

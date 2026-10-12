import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import { numero } from "@/lib/formato";
import { nombreDeUsuario, resumenDeOperarios } from "@/lib/mis-estadisticas";
import { leerPeriodo } from "@/lib/periodos";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { fechaLocal } from "@/lib/rangos";
import { Titulo } from "@/components/ui";
import { SelectorPeriodo } from "../estadisticas/selector-periodo";
import { DetalleOperario } from "../mis-estadisticas/detalle";

export const metadata = { title: "Estadísticas operarios · Secaderos" };
export const dynamic = "force-dynamic";

/**
 * Las estadisticas de cada operario, para el admin y el auditor.
 *
 * Arriba, todos en una tabla para compararlos. Al elegir uno, abajo aparece
 * su detalle: el mismo componente que ese operario ve en "Mis estadisticas",
 * asi lo que mira el admin es exactamente lo que ve el operario, sin tener
 * que entrar con su usuario.
 */
export default async function PaginaEstadisticasOperarios({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; periodo?: string; fecha?: string }>;
}) {
  await requerirRol("admin", "auditor");
  const params = await searchParams;

  const hoy = fechaLocal();
  const periodo = leerPeriodo(params.periodo ?? "semana", params.fecha, hoy);
  const elegido = /^\d+$/.test(params.u ?? "") ? Number(params.u) : null;

  const [operarios, usuarioElegido] = await Promise.all([
    resumenDeOperarios(periodo.rango, periodo.inicio, periodo.fin),
    elegido ? nombreDeUsuario(elegido) : Promise.resolve(null),
  ]);

  // Al tocar un operario se conserva el periodo, y al cambiar el periodo se
  // conserva el operario.
  const hrefOperario = (uid: number) =>
    `/estadisticas-operarios?u=${uid}&periodo=${periodo.tipo}&fecha=${periodo.inicio}#detalle`;
  const consulta = elegido ? `u=${elegido}` : "";

  const total = operarios.reduce(
    (a, o) => ({
      secaderos: a.secaderos + o.secaderos,
      placas: a.placas + o.placas,
      rotas: a.rotas + o.rotas,
      palets: a.palets + o.palets,
    }),
    { secaderos: 0, placas: 0, rotas: 0, palets: 0 },
  );
  const hayPalets = operarios.some((o) => o.palets !== 0);

  const th =
    "pb-2 pl-4 text-right text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase";
  const td = "py-2.5 pl-4 text-right tabular-nums whitespace-nowrap";

  return (
    <>
      <Titulo detalle={periodo.etiqueta}>Estadísticas operarios</Titulo>

      <div className="tarjeta mb-6 p-4">
        <SelectorPeriodo
          ruta="/estadisticas-operarios"
          tipo={periodo.tipo}
          inicio={periodo.inicio}
          anterior={periodo.anterior}
          siguiente={periodo.siguiente}
          etiqueta={periodo.etiqueta}
          enCurso={periodo.enCurso}
          hoy={hoy}
          consulta={consulta}
        />
      </div>

      <section className="tarjeta mb-6 p-4">
        <h2 className="text-sm font-bold text-slate-900">Todos los operarios</h2>
        <p className="mt-0.5 mb-3 text-xs text-slate-500">
          Tocá un nombre para ver sus estadísticas tal como las ve él o ella.
        </p>

        {operarios.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No hay operarios cargados.
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="pb-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Operario
                  </th>
                  <th className={th}>Secaderos</th>
                  <th className={th}>Placas</th>
                  <th className={th}>Rotas</th>
                  <th className={th}>Días</th>
                  {hayPalets && <th className={th}>Palets</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operarios.map((o) => {
                  const activo = o.uid === elegido;
                  return (
                    <tr key={o.uid} className={activo ? "bg-slate-100" : ""}>
                      <td className="py-2.5 pr-2">
                        <Link
                          href={hrefOperario(o.uid)}
                          className={`font-semibold underline-offset-2 hover:underline ${
                            activo ? "text-slate-900" : "text-blue-700"
                          }`}
                        >
                          {o.nombre}
                        </Link>
                        <span className="block text-xs text-slate-500">
                          {ETIQUETA_ROL[o.rol]}
                          {!o.activo && " · dado de baja"}
                        </span>
                      </td>
                      <td className={`${td} ${o.secaderos === 0 ? "text-slate-400" : "text-slate-700"}`}>
                        {numero(o.secaderos)}
                      </td>
                      <td className={`${td} text-slate-600`}>{numero(o.placas)}</td>
                      <td className={`${td} ${o.rotas > 0 ? "text-red-600" : "text-slate-400"}`}>
                        {o.rotas > 0 ? numero(o.rotas) : "—"}
                      </td>
                      <td className={`${td} text-slate-600`}>{numero(o.dias)}</td>
                      {hayPalets && (
                        <td className={`${td} text-slate-600`}>
                          {o.palets !== 0 ? numero(o.palets) : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="py-2.5">Total</td>
                  <td className={td}>{numero(total.secaderos)}</td>
                  <td className={td}>{numero(total.placas)}</td>
                  <td className={td}>{numero(total.rotas)}</td>
                  <td className={td} />
                  {hayPalets && <td className={td}>{numero(total.palets)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {elegido && usuarioElegido && (
        <section id="detalle" className="scroll-mt-4">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-200 pt-5">
            <h2 className="text-lg font-bold text-slate-900">
              {usuarioElegido.nombre}
              <span className="ml-2 text-sm font-medium text-slate-500">
                {ETIQUETA_ROL[usuarioElegido.rol]} · {periodo.etiqueta}
              </span>
            </h2>
            <Link
              href={`/estadisticas-operarios?periodo=${periodo.tipo}&fecha=${periodo.inicio}`}
              className="text-xs font-bold text-slate-600 underline underline-offset-2"
            >
              Cerrar
            </Link>
          </div>
          <DetalleOperario uid={elegido} periodo={periodo} propio={false} />
        </section>
      )}
    </>
  );
}

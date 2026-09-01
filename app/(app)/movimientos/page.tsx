import { requerirRol } from "@/lib/auth";
import {
  listarMovimientos,
  todosLosSecaderos,
  todosLosUsuarios,
} from "@/lib/consultas";
import { tipoMovimientoEnum } from "@/lib/db/schema";
import {
  COLOR_MOVIMIENTO,
  ETIQUETA_ESTADO,
  ETIQUETA_MOVIMIENTO,
} from "@/lib/estados";
import { duracion, fechaHora, numero } from "@/lib/formato";
import { rangoDeFecha } from "@/lib/rangos";
import { Titulo, Vacio } from "@/components/ui";
import { Paginador } from "./paginador";

export const metadata = { title: "Movimientos · Secaderos" };
export const dynamic = "force-dynamic";

type Busqueda = {
  tipo?: string;
  secadero?: string;
  usuario?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

/**
 * Interpreta una fecha `YYYY-MM-DD` del filtro como el dia completo ARGENTINO.
 *
 * Antes se parseaba sin huso, o sea en la hora del servidor: en Vercel eso es
 * UTC, asi que un filtro por el 1 de septiembre traia desde las 21 h del 31 de
 * agosto hasta las 21 h del 1, y el turno noche caia siempre en el dia
 * equivocado. En local no se notaba porque la maquina ya esta en hora de
 * Argentina.
 */
function comoFecha(valor: string | undefined, finDelDia: boolean) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return undefined;
  const { desde, hasta } = rangoDeFecha(valor);
  const fecha = finDelDia ? hasta : desde;
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

export default async function PaginaMovimientos({
  searchParams,
}: {
  searchParams: Promise<Busqueda>;
}) {
  await requerirRol("admin", "auditor");
  const q = await searchParams;

  const [{ items, total, pagina, paginas }, secaderos, usuarios] =
    await Promise.all([
      listarMovimientos({
        tipo: q.tipo || undefined,
        secaderoId: q.secadero ? Number(q.secadero) : undefined,
        usuarioId: q.usuario ? Number(q.usuario) : undefined,
        desde: comoFecha(q.desde, false),
        hasta: comoFecha(q.hasta, true),
        pagina: q.pagina ? Number(q.pagina) : 1,
      }),
      todosLosSecaderos(),
      todosLosUsuarios(),
    ]);

  const parametros = new URLSearchParams(
    Object.entries(q).filter(([k, v]) => v && k !== "pagina") as [
      string,
      string,
    ][],
  );

  return (
    <>
      <Titulo
        detalle={`${numero(total)} movimientos registrados`}
        accion={
          <a
            href={`/movimientos/exportar?${parametros.toString()}`}
            className="boton-secundario"
          >
            Exportar CSV
          </a>
        }
      >
        Movimientos
      </Titulo>

      <form className="tarjeta mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label htmlFor="tipo" className="etiqueta">
            Tipo
          </label>
          <select id="tipo" name="tipo" defaultValue={q.tipo ?? ""} className="campo py-2.5">
            <option value="">Todos</option>
            {/* `ajuste` queda fuera: no se genera mas, asi que como filtro
                seria una opcion que no devuelve nunca nada. Sigue en el enum
                por compatibilidad, no como cosa elegible. */}
            {tipoMovimientoEnum.enumValues
              .filter((t) => t !== "ajuste")
              .map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_MOVIMIENTO[t]}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label htmlFor="secadero" className="etiqueta">
            Secadero
          </label>
          <select
            id="secadero"
            name="secadero"
            defaultValue={q.secadero ?? ""}
            className="campo py-2.5"
          >
            <option value="">Todos</option>
            {secaderos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.numero}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="usuario" className="etiqueta">
            Usuario
          </label>
          <select
            id="usuario"
            name="usuario"
            defaultValue={q.usuario ?? ""}
            className="campo py-2.5"
          >
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="desde" className="etiqueta">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            name="desde"
            defaultValue={q.desde ?? ""}
            className="campo py-2.5"
          />
        </div>

        <div>
          <label htmlFor="hasta" className="etiqueta">
            Hasta
          </label>
          <input
            id="hasta"
            type="date"
            name="hasta"
            defaultValue={q.hasta ?? ""}
            className="campo py-2.5"
          />
        </div>

        <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className="boton-primario">
            Filtrar
          </button>
          <a href="/movimientos" className="boton-secundario">
            Limpiar
          </a>
        </div>
      </form>

      {items.length === 0 ? (
        <Vacio
          titulo="No hay movimientos"
          detalle="Probá cambiando los filtros."
        />
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((m) => {
              const placas = m.lineas.reduce((a, l) => a + l.cantidad, 0);
              const rotas = m.lineas.reduce((a, l) => a + l.desperdicio, 0);

              return (
                <li key={m.id} className="tarjeta p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold tabular-nums text-white`}
                    >
                      {m.secaderoNumero}
                    </span>
                    <span className={`chip ${COLOR_MOVIMIENTO[m.tipo]}`}>
                      {ETIQUETA_MOVIMIENTO[m.tipo]}
                    </span>
                    <span className="text-xs text-slate-500">
                      {ETIQUETA_ESTADO[m.estadoDesde]} →{" "}
                      <strong className="text-slate-700">
                        {ETIQUETA_ESTADO[m.estadoHasta]}
                      </strong>
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      {fechaHora(m.creadoEn)}
                    </span>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <ul className="space-y-0.5">
                      {m.lineas.map((l) => (
                        <li key={l.id} className="text-sm text-slate-700">
                          <span className="font-medium">{l.productoNombre}</span>
                          {l.cantidad > 0 && (
                            <span className="ml-2 tabular-nums">
                              {numero(l.cantidad)} placas
                            </span>
                          )}
                          {l.desperdicio > 0 && (
                            <span className="ml-2 font-semibold text-red-600 tabular-nums">
                              −{numero(l.desperdicio)}
                              {l.motivoNombre && (
                                <span className="font-normal text-red-500">
                                  {" "}
                                  ({l.motivoNombre})
                                </span>
                              )}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="text-right text-xs whitespace-nowrap text-slate-500">
                      <p>
                        <strong className="text-slate-700">{m.usuarioNombre}</strong>
                      </p>
                      {m.duracionMin != null && (
                        <p>
                          {ETIQUETA_ESTADO[m.estadoDesde]} por{" "}
                          {duracion(m.duracionMin)}
                        </p>
                      )}
                      <p className="tabular-nums">
                        {numero(placas)} placas
                        {rotas > 0 && ` · ${numero(rotas)} rotas`}
                      </p>
                    </div>
                  </div>

                  {m.nota && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 italic">
                      {m.nota}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <Paginador pagina={pagina} paginas={paginas} />
        </>
      )}
    </>
  );
}

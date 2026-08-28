import Link from "next/link";
import type { SecaderoVista } from "@/lib/consultas";
import { COLOR_ESTADO } from "@/lib/estados";
import { duracion, minutosDesde, numero } from "@/lib/formato";

/** Tarjeta tactil de un secadero. Si recibe `href` es un link; si no, un div. */
export function TarjetaSecadero({
  secadero,
  href,
  detalleEstado = true,
  children,
}: {
  secadero: SecaderoVista;
  href?: string;
  detalleEstado?: boolean;
  children?: React.ReactNode;
}) {
  const color = COLOR_ESTADO[secadero.estado];

  const contenido = (
    <>
      <div className="flex items-start gap-3">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold tabular-nums ${color.chip}`}
        >
          {secadero.numero}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">
              {secadero.tipoNombre}
            </span>
            {secadero.total > 0 && (
              <span className="text-sm font-bold tabular-nums text-slate-900">
                · {numero(secadero.total)} placas
              </span>
            )}
          </div>

          {secadero.contenido.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {secadero.contenido.map((c) => (
                <li
                  key={c.productoId}
                  className="flex justify-between gap-2 text-xs text-slate-600"
                >
                  <span className="truncate">{c.nombre}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {numero(c.cantidad)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Sin placas</p>
          )}

          {detalleEstado && (
            <p className="mt-1.5 text-xs text-slate-500">
              hace {duracion(minutosDesde(secadero.estadoDesde))}
            </p>
          )}
        </div>
      </div>
      {children}
    </>
  );

  const clases = `tarjeta block p-3 text-left ${color.borde} ${
    href ? "transition hover:shadow-md active:scale-[0.99]" : ""
  }`;

  return href ? (
    <Link href={href} className={clases}>
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  );
}

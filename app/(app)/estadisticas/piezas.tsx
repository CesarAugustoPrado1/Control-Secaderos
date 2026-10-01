import Link from "next/link";
import { numero, porcentaje } from "@/lib/formato";

/*
 * Piezas de presentacion compartidas por todas las categorias de estadisticas.
 * Son componentes de servidor sin estado: solo arman el HTML.
 */

export function Indicador({
  rotulo,
  valor,
  detalle,
  tono,
}: {
  rotulo: string;
  valor: string;
  detalle?: string;
  tono: "neutro" | "bueno" | "malo";
}) {
  const color = {
    neutro: "text-slate-900",
    bueno: "text-emerald-600",
    malo: "text-red-600",
  }[tono];

  return (
    <div className="tarjeta p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {rotulo}
      </p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

export function Panel({
  titulo,
  detalle,
  children,
}: {
  titulo: string;
  detalle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="tarjeta p-4">
      <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
      {detalle && <p className="mt-0.5 mb-3 text-xs text-slate-500">{detalle}</p>}
      <div className={detalle ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export function SinDatos({ texto = "Sin datos en este período." }: { texto?: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{texto}</p>;
}

export function Tabla({
  encabezados,
  filas = [],
  grupos,
  pie,
}: {
  encabezados: string[];
  filas?: string[][];
  /**
   * Filas agrupadas bajo un titulo, cada grupo con su subtotal. Van despues de
   * `filas`, que normalmente queda vacio cuando se usan grupos.
   */
  grupos?: { titulo: string; filas: string[][]; subtotal?: string[] }[];
  /** Fila de totales, separada y en negrita. */
  pie?: string[];
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {encabezados.map((e, i) => (
              <th
                key={e}
                className={`pb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase ${
                  i === 0 ? "text-left" : "pl-4 text-right whitespace-nowrap"
                }`}
              >
                {e}
              </th>
            ))}
          </tr>
        </thead>
        {filas.length > 0 && (
          <tbody className="divide-y divide-slate-100">
            {filas.map((fila, i) => (
              <FilaTabla key={i} fila={fila} />
            ))}
          </tbody>
        )}
        {grupos?.map((g) => (
          <tbody key={g.titulo} className="divide-y divide-slate-100">
            <tr>
              <th
                colSpan={encabezados.length}
                className="bg-slate-50 px-2 pt-4 pb-1.5 text-left text-xs font-bold tracking-wide text-slate-700 uppercase"
              >
                {g.titulo}
              </th>
            </tr>
            {g.filas.map((fila, i) => (
              <FilaTabla key={i} fila={fila} sangria />
            ))}
            {g.subtotal && (
              <tr>
                {g.subtotal.map((celda, j) => (
                  <td
                    key={j}
                    className={`py-2 font-semibold text-slate-800 ${
                      j === 0 ? "pl-3" : "pl-4 text-right tabular-nums whitespace-nowrap"
                    }`}
                  >
                    {celda}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        ))}
        {pie && (
          <tfoot>
            <tr className="border-t-2 border-slate-300">
              {pie.map((celda, j) => (
                <td
                  key={j}
                  className={`py-2.5 font-bold text-slate-900 ${
                    j === 0 ? "" : "pl-4 text-right tabular-nums whitespace-nowrap"
                  }`}
                >
                  {celda}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function FilaTabla({ fila, sangria }: { fila: string[]; sangria?: boolean }) {
  return (
    <tr>
      {fila.map((celda, j) => (
        <td
          key={j}
          className={`py-2.5 ${
            j === 0
              ? `font-medium text-slate-800 ${sangria ? "pl-3" : ""}`
              : "pl-4 text-right tabular-nums whitespace-nowrap text-slate-600"
          }`}
        >
          {celda}
        </td>
      ))}
    </tr>
  );
}

export function Barras({
  datos,
  total,
}: {
  datos: { etiqueta: string; valor: number }[];
  total: number;
}) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1);

  return (
    <ul className="space-y-3">
      {datos.map((d) => (
        <li key={d.etiqueta}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-slate-700">
              {d.etiqueta}
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">
              <strong className="text-slate-900">{numero(d.valor)}</strong>
              {total > 0 && ` · ${porcentaje(d.valor, total)}`}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-red-400"
              style={{ width: `${(d.valor / maximo) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GraficoDiario({
  datos,
}: {
  datos: { dia: string; terminadas: number; rotas: number }[];
}) {
  const maximo = Math.max(...datos.map((d) => d.terminadas), 1);
  // Con muchos dias las barras no entran: mostramos la cola reciente.
  const visibles = datos.slice(-60);

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="flex min-w-full items-end gap-1" style={{ height: 140 }}>
        {visibles.map((d) => (
          <div
            key={d.dia}
            className="group relative flex min-w-2 flex-1 flex-col justify-end"
            title={`${d.dia}: ${numero(d.terminadas)} terminadas, ${numero(d.rotas)} rotas`}
          >
            <div
              className="w-full rounded-t bg-emerald-500 transition group-hover:bg-emerald-600"
              style={{
                height: `${Math.max(2, (d.terminadas / maximo) * 130)}px`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>{visibles[0]?.dia}</span>
        <span>{visibles[visibles.length - 1]?.dia}</span>
      </div>
    </div>
  );
}

/** Fila de opciones excluyentes, cada una un link. La activa va en oscuro. */
export function Opciones({
  opciones,
  chica,
}: {
  opciones: { href: string; etiqueta: string; activa: boolean }[];
  chica?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          scroll={false}
          className={`rounded-lg font-semibold transition ${
            chica ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-sm"
          } ${
            o.activa
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
          }`}
        >
          {o.etiqueta}
        </Link>
      ))}
    </div>
  );
}

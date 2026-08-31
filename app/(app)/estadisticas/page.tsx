import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import {
  adherenciaAlFlujo,
  desperdicioPorEtapa,
  desperdicioPorMotivo,
  desperdicioPorUsuario,
  movimientoDeHornoDiario,
  produccionDiaria,
  rangoDeDias,
  resumenDevoluciones,
  resumenPorModelo,
  roturasPorEtapa,
  roturasPorProducto,
  roturasPorTipoSecadero,
  tiempoDeHornoPorTipo,
  tiemposPorEtapa,
  totales,
  ultimosCiclosDeHorno,
} from "@/lib/estadisticas";
import { ETIQUETA_MOVIMIENTO } from "@/lib/estados";
import { duracion, fechaHora, numero, porcentaje } from "@/lib/formato";
import { Titulo, Vacio } from "@/components/ui";

export const metadata = { title: "Estadísticas · Secaderos" };
export const dynamic = "force-dynamic";

const PERIODOS = [
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
  { dias: 90, etiqueta: "90 días" },
  { dias: 365, etiqueta: "1 año" },
];

export default async function PaginaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  await requerirRol("admin", "auditor");
  const { dias } = await searchParams;

  const periodo = PERIODOS.find((p) => String(p.dias) === dias) ?? PERIODOS[1];
  const rango = rangoDeDias(periodo.dias);

  const [
    tot,
    etapas,
    horno,
    ciclos,
    porMotivo,
    porEtapa,
    porModelo,
    porUsuario,
    diaria,
  ] = await Promise.all([
    totales(rango),
    tiemposPorEtapa(rango),
    tiempoDeHornoPorTipo(rango),
    ultimosCiclosDeHorno(rango),
    desperdicioPorMotivo(rango),
    desperdicioPorEtapa(rango),
    resumenPorModelo(rango),
    desperdicioPorUsuario(rango),
    produccionDiaria(rango),
  ]);

  const [adherencia, porTipoSec, promEtapa, promProducto, hornoDiario] =
    await Promise.all([
      adherenciaAlFlujo(rango),
      roturasPorTipoSecadero(rango),
      roturasPorEtapa(rango),
      roturasPorProducto(rango),
      movimientoDeHornoDiario(rango),
    ]);

  const devoluciones = await resumenDevoluciones(rango);

  const hayDatos = tot.cargadas > 0 || tot.terminadas > 0 || tot.rotas > 0;
  const tiempo = (tipo: string) => etapas.find((e) => e.tipo === tipo);

  return (
    <>
      <Titulo detalle={`Últimos ${periodo.etiqueta}`}>Estadísticas</Titulo>

      <div className="mb-5 flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.dias}
            href={`/estadisticas?dias=${p.dias}`}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              p.dias === periodo.dias
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            {p.etiqueta}
          </Link>
        ))}
      </div>

      {!hayDatos ? (
        <Vacio
          titulo="Todavía no hay movimientos en este período"
          detalle="Las estadísticas se arman con los movimientos registrados."
        />
      ) : (
        <div className="space-y-6">
          {/* ----------------------------- Resumen ----------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              rotulo="Placas cargadas"
              valor={numero(tot.cargadas)}
              tono="neutro"
            />
            <Indicador
              rotulo="A producto terminado"
              valor={numero(tot.terminadas)}
              tono="bueno"
            />
            <Indicador
              rotulo="Desperdicio"
              valor={numero(tot.rotas)}
              detalle={`${porcentaje(tot.rotas, tot.cargadas)} de lo cargado`}
              tono="malo"
            />
            <Indicador
              rotulo="Tiempo de horno promedio"
              valor={duracion(tiempo("salida_horno")?.promedioMin)}
              detalle={`${tiempo("salida_horno")?.movimientos ?? 0} ciclos`}
              tono="neutro"
            />
          </div>

          {/* --------------------------- Produccion --------------------------- */}
          {diaria.length > 1 && (
            <Panel titulo="Producción por día">
              <GraficoDiario datos={diaria} />
            </Panel>
          )}

          {/* ----------------------------- Tiempos ---------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel titulo="Tiempo de horno por tipo de secadero">
              {horno.length === 0 ? (
                <SinDatos />
              ) : (
                <Tabla
                  encabezados={["Tipo", "Ciclos", "Promedio", "Mínimo", "Máximo"]}
                  filas={horno.map((h) => [
                    h.tipo,
                    numero(h.ciclos),
                    duracion(h.promedioMin),
                    duracion(h.minimoMin),
                    duracion(h.maximoMin),
                  ])}
                />
              )}
            </Panel>

            <Panel
              titulo="Tiempo promedio en cada etapa"
              detalle="Cuánto tarda un secadero en pasar al siguiente paso"
            >
              <Tabla
                encabezados={["Etapa", "Promedio", "Máximo", "Veces"]}
                filas={[
                  ["Esperando carga (vacío)", tiempo("carga")],
                  ["Húmedo, esperando horno", tiempo("entrada_horno")],
                  ["Dentro del horno", tiempo("salida_horno")],
                  ["Seco, esperando paletizado", tiempo("descarga")],
                ].map(([etiqueta, dato]) => {
                  const d = dato as ReturnType<typeof tiempo>;
                  return [
                    etiqueta as string,
                    duracion(d?.promedioMin),
                    duracion(d?.maximoMin),
                    numero(d?.movimientos ?? 0),
                  ];
                })}
              />
            </Panel>
          </div>

          {/* ------------------------- Flujo óptimo --------------------------- */}
          <Panel
            titulo="Cargas según el flujo óptimo"
            detalle="Secadero completo y con un solo producto"
          >
            {adherencia.total === 0 ? (
              <SinDatos />
            ) : (
              <>
                <div className="mb-4 grid gap-3 sm:grid-cols-3">
                  <Indicador
                    rotulo="Según la norma"
                    valor={porcentaje(adherencia.optimas, adherencia.total)}
                    detalle={`${numero(adherencia.optimas)} de ${numero(adherencia.total)} cargas`}
                    tono={
                      adherencia.optimas / adherencia.total >= 0.9
                        ? "bueno"
                        : "neutro"
                    }
                  />
                  <Indicador
                    rotulo="A medio llenar"
                    valor={numero(adherencia.incompletas)}
                    detalle="No alcanzaron la capacidad"
                    tono={adherencia.incompletas > 0 ? "malo" : "neutro"}
                  />
                  <Indicador
                    rotulo="Con varios productos"
                    valor={numero(adherencia.mezcladas)}
                    detalle="Más de un producto en el mismo secadero"
                    tono={adherencia.mezcladas > 0 ? "malo" : "neutro"}
                  />
                </div>

                {adherencia.desvios.length > 0 && (
                  <>
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Cargas que se apartaron
                    </h3>
                    <Tabla
                      encabezados={[
                        "Fecha",
                        "Secadero",
                        "Tipo",
                        "Placas",
                        "Productos",
                        "Operario",
                      ]}
                      filas={adherencia.desvios.map((d) => [
                        fechaHora(d.creadoEn),
                        String(d.secaderoNumero),
                        d.tipo,
                        `${numero(d.placas)} / ${numero(d.capacidad)}`,
                        String(d.productos),
                        d.usuarioNombre,
                      ])}
                    />
                  </>
                )}
              </>
            )}
          </Panel>

          {/* ---------------------- Promedios de rotura ----------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              titulo="Roturas promedio por secadero"
              detalle="Según el tipo de secadero, sobre las cargas del período"
            >
              {porTipoSec.length === 0 ? (
                <SinDatos />
              ) : (
                <Tabla
                  encabezados={["Tipo", "Secaderos", "Rotas", "Promedio"]}
                  filas={porTipoSec.map((f) => [
                    f.clave,
                    numero(f.secaderos),
                    numero(f.rotas),
                    f.promedio.toLocaleString("es-AR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }),
                  ])}
                />
              )}
            </Panel>

            <Panel
              titulo="Roturas promedio por etapa"
              detalle="Cuántas placas se rompen por secadero en cada paso"
            >
              {promEtapa.length === 0 ? (
                <SinDatos />
              ) : (
                <Tabla
                  encabezados={["Etapa", "Secaderos", "Rotas", "Promedio"]}
                  filas={promEtapa.map((f) => [
                    ETIQUETA_MOVIMIENTO[f.clave as keyof typeof ETIQUETA_MOVIMIENTO],
                    numero(f.secaderos),
                    numero(f.rotas),
                    f.promedio.toLocaleString("es-AR", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    }),
                  ])}
                />
              )}
            </Panel>
          </div>

          <Panel
            titulo="Roturas promedio por producto"
            detalle="Por secadero en el que aparece el producto"
          >
            {promProducto.length === 0 ? (
              <SinDatos texto="No se registraron roturas. 👏" />
            ) : (
              <Tabla
                encabezados={["Producto", "Secaderos", "Rotas", "Promedio"]}
                filas={promProducto.map((f) => [
                  f.clave,
                  numero(f.secaderos),
                  numero(f.rotas),
                  f.promedio.toLocaleString("es-AR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }),
                ])}
              />
            )}
          </Panel>

          {/* ---------------------- Devoluciones al horno --------------------- */}
          {devoluciones.devoluciones > 0 && (
            <Panel
              titulo="Secaderos que no secaron bien"
              detalle="Volvieron a la cola de húmedos para rehornear"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Indicador
                  rotulo="Rehorneados"
                  valor={numero(devoluciones.devoluciones)}
                  detalle="en el período"
                  tono="malo"
                />
                <Indicador
                  rotulo="Horno que no alcanzó"
                  valor={duracion(devoluciones.promedioDevueltosMin)}
                  detalle={`${numero(devoluciones.ciclosDevueltos)} ciclos que no alcanzaron`}
                  tono="malo"
                />
                <Indicador
                  rotulo="Horno que sí alcanzó"
                  valor={duracion(devoluciones.promedioBuenosMin)}
                  detalle={`${numero(devoluciones.ciclosBuenos)} ciclos`}
                  tono="bueno"
                />
              </div>

              {/* La comparacion es el dato accionable: dice cual es el tiempo
                  minimo real de horno, medido y no estimado. */}
              {devoluciones.ciclosDevueltos > 0 &&
                devoluciones.promedioBuenosMin >
                  devoluciones.promedioDevueltosMin && (
                  <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
                    Los ciclos que no alcanzaron duraron en promedio{" "}
                    <strong>
                      {duracion(
                        devoluciones.promedioBuenosMin -
                          devoluciones.promedioDevueltosMin,
                      )}
                    </strong>{" "}
                    menos que los que salieron bien. Es una señal de cuál es el
                    tiempo mínimo de horno para estas placas.
                  </p>
                )}

              {devoluciones.porProducto.length > 0 && (
                <div className="mt-4">
                  <Tabla
                    encabezados={["Producto", "Veces rehorneado"]}
                    filas={devoluciones.porProducto.map((p) => [
                      p.producto,
                      numero(p.veces),
                    ])}
                  />
                </div>
              )}
            </Panel>
          )}

          {/* ------------------------- Horno por día -------------------------- */}
          {hornoDiario.length > 0 && (
            <Panel
              titulo="Movimiento del horno por día"
              detalle="Secaderos que entraron y salieron cada jornada"
            >
              <Tabla
                encabezados={["Día", "Entraron", "Salieron", "Diferencia"]}
                filas={hornoDiario.map((d) => [
                  d.dia,
                  numero(d.entraron),
                  numero(d.salieron),
                  d.entraron === d.salieron
                    ? "—"
                    : `${d.entraron > d.salieron ? "+" : ""}${d.entraron - d.salieron}`,
                ])}
              />
            </Panel>
          )}

          {/* --------------------------- Desperdicio -------------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel titulo="Desperdicio por motivo">
              {porMotivo.length === 0 ? (
                <SinDatos texto="No se registraron roturas. 👏" />
              ) : (
                <Barras
                  datos={porMotivo.map((m) => ({
                    etiqueta: m.motivo,
                    valor: m.placas,
                  }))}
                  total={tot.rotas}
                />
              )}
            </Panel>

            <Panel titulo="Dónde se rompen">
              {porEtapa.length === 0 ? (
                <SinDatos texto="No se registraron roturas. 👏" />
              ) : (
                <Barras
                  datos={porEtapa.map((e) => ({
                    etiqueta: ETIQUETA_MOVIMIENTO[e.tipo],
                    valor: e.placas,
                  }))}
                  total={tot.rotas}
                />
              )}
            </Panel>
          </div>

          {/* ----------------------------- Modelos ---------------------------- */}
          <Panel titulo="Por producto">
            {porModelo.length === 0 ? (
              <SinDatos />
            ) : (
              <Tabla
                encabezados={["Producto", "Cargadas", "Terminadas", "Rotas", "% rotura"]}
                filas={porModelo.map((m) => [
                  m.modelo,
                  numero(m.cargadas),
                  numero(m.terminadas),
                  numero(m.rotas),
                  m.cargadas > 0 ? porcentaje(m.rotas, m.cargadas) : "—",
                ])}
              />
            )}
          </Panel>

          {/* ---------------------------- Operarios --------------------------- */}
          {porUsuario.length > 0 && (
            <Panel
              titulo="Roturas registradas por operario"
              detalle="Quién cargó la rotura, no necesariamente quién la causó"
            >
              <Tabla
                encabezados={["Usuario", "Placas rotas", "Movimientos con rotura"]}
                filas={porUsuario.map((u) => [
                  u.usuario,
                  numero(u.placas),
                  numero(u.movimientos),
                ])}
              />
            </Panel>
          )}

          {/* ------------------------- Ciclos de horno ------------------------ */}
          {ciclos.length > 0 && (
            <Panel
              titulo="Últimos ciclos de horno"
              detalle="El promedio esconde los casos raros; acá están uno por uno"
            >
              <Tabla
                encabezados={["Salida", "Secadero", "Tipo", "Tiempo en horno", "Operario"]}
                filas={ciclos.map((c) => [
                  fechaHora(c.creadoEn),
                  String(c.secaderoNumero),
                  c.tipo,
                  duracion(c.duracionMin),
                  c.usuarioNombre,
                ])}
              />
            </Panel>
          )}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Indicador({
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

function Panel({
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

function SinDatos({ texto = "Sin datos en este período." }: { texto?: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{texto}</p>;
}

function Tabla({
  encabezados,
  filas,
}: {
  encabezados: string[];
  filas: string[][];
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
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((fila, i) => (
            <tr key={i}>
              {fila.map((celda, j) => (
                <td
                  key={j}
                  className={`py-2.5 ${
                    j === 0
                      ? "font-medium text-slate-800"
                      : "text-right tabular-nums text-slate-600"
                  }`}
                >
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Barras({
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

function GraficoDiario({
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

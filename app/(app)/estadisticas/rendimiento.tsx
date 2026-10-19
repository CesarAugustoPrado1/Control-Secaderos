import {
  adherenciaAlFlujo,
  produccionDiaria,
  resumenPorModelo,
  tiemposPorEtapa,
  totales,
  type Rango,
} from "@/lib/estadisticas";
import { duracion, fechaHora, m2, medida, ml, numero, porcentaje } from "@/lib/formato";
import { etiquetaDia } from "@/lib/rangos";
import { GraficoColumnas, type PuntoColumna } from "@/components/graficos";
import { Indicador, Panel, SinDatos, Tabla } from "./piezas";

/**
 * Cuanto de lo que se produce llega a producto terminado, cuanto tarda y si se
 * trabaja segun la norma.
 */
export async function Rendimiento({ rango }: { rango: Rango }) {
  const [tot, etapas, diaria, adherencia, porModelo] = await Promise.all([
    totales(rango),
    tiemposPorEtapa(rango),
    produccionDiaria(rango),
    adherenciaAlFlujo(rango),
    resumenPorModelo(rango),
  ]);

  // Produccion por dia en m2: lo que se termino (paletizo) cada dia. Con
  // muchos dias las columnas no entran: se muestra la cola reciente.
  const dias = diaria.slice(-60);
  const serie: PuntoColumna[] = dias.map((d) => ({
    clave: d.dia,
    etiqueta:
      dias.length <= 12
        ? `${etiquetaDia(d.dia).split(" ")[0]} ${Number(d.dia.slice(8))}`
        : String(Number(d.dia.slice(8))),
    titulo: etiquetaDia(d.dia),
    // Redondeado como se muestran los m2: sin decimales desde 100.
    valor:
      Math.abs(d.m2Terminadas) >= 100
        ? Math.round(d.m2Terminadas)
        : Math.round(d.m2Terminadas * 10) / 10,
    detalle: [
      `${numero(d.terminadas)} placas`,
      ...(d.mlTerminadas > 0 ? [`${ml(d.mlTerminadas)} de guardas`] : []),
      ...(d.rotas > 0 ? [`${numero(d.rotas)} rotas`] : []),
    ],
  }));
  // El promedio es de los dias en que se termino algo: un feriado o un dia
  // sin paletizado no tira el promedio para abajo.
  const conProduccion = diaria.filter((d) => d.terminadas > 0);
  const nDias = conProduccion.length;
  const prom = (f: (d: (typeof diaria)[number]) => number) =>
    nDias ? conProduccion.reduce((a, d) => a + f(d), 0) / nDias : 0;

  if (tot.cargadas === 0 && tot.terminadas === 0 && tot.rotas === 0) {
    return (
      <Panel titulo="Rendimiento">
        <SinDatos texto="Todavía no hay movimientos en este período." />
      </Panel>
    );
  }

  const tiempo = (tipo: string) => etapas.find((e) => e.tipo === tipo);

  return (
    <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              rotulo="Placas cargadas"
              valor={numero(tot.cargadas)}
              detalle={medida(tot.m2.cargadas, tot.ml.cargadas)}
              tono="neutro"
            />
            <Indicador
              rotulo="A producto terminado"
              valor={numero(tot.terminadas)}
              detalle={medida(tot.m2.terminadas, tot.ml.terminadas)}
              tono="bueno"
            />
            <Indicador
              rotulo="Desperdicio"
              valor={numero(tot.rotas)}
              detalle={`${medida(tot.m2.rotas, tot.ml.rotas)} · ${porcentaje(tot.rotas, tot.cargadas)} de lo cargado`}
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
            <Panel
              titulo="Producción por día, en m²"
              detalle={`Lo terminado (paletizado) cada día${
                diaria.length > dias.length ? `, los últimos ${dias.length} días con movimiento` : ""
              }. Tocá una columna para ver las placas`}
            >
              <GraficoColumnas datos={serie} unidad="m²" valoresEnTodas />
              {nDias > 0 && (
                <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <span
                    aria-hidden
                    className="mr-2 inline-block h-px w-5 bg-slate-500 align-middle"
                  />
                  <strong className="text-slate-900">
                    Promedio diario: {medida(prom((d) => d.m2Terminadas), prom((d) => d.mlTerminadas))}
                  </strong>{" "}
                  · {numero(Math.round(prom((d) => d.terminadas)))} placas · en {numero(nDias)}{" "}
                  {nDias === 1 ? "día" : "días"} con producción
                </p>
              )}
            </Panel>
          )}
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
          {/* ------------------------- Flujo óptimo --------------------------- */}
          <Panel
            titulo="Cargas según el flujo óptimo"
            detalle="Secadero completo y con un solo producto, sólo en los tipos con capacidad fija"
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

                {/* Sin esta linea el porcentaje se leeria como si cubriera toda
                    la produccion del periodo, y no es asi. */}
                {adherencia.sinNorma > 0 && (
                  <p className="mt-3 text-xs text-slate-500">
                    Quedan afuera {numero(adherencia.sinNorma)} cargas de tipos
                    sin capacidad fija, donde no hay un secadero “lleno” contra
                    el cual medirlas.
                  </p>
                )}
              </>
            )}
          </Panel>
          {/* ----------------------------- Modelos ---------------------------- */}
          <Panel titulo="Por producto">
            {porModelo.length === 0 ? (
              <SinDatos />
            ) : (
              <Tabla
                encabezados={["Producto", "Cargadas", "Terminadas", "Medida terminada", "Rotas", "% rotura"]}
                filas={porModelo.map((m) => [
                  m.modelo,
                  numero(m.cargadas),
                  numero(m.terminadas),
                  m.m2Terminados === null
                    ? m.lineal
                      ? "sin ml"
                      : "sin m²"
                    : m.lineal
                      ? ml(m.m2Terminados)
                      : m2(m.m2Terminados),
                  numero(m.rotas),
                  m.cargadas > 0 ? porcentaje(m.rotas, m.cargadas) : "—",
                ])}
              />
            )}
          </Panel>
    </div>
  );
}

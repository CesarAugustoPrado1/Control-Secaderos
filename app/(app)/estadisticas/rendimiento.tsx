import {
  adherenciaAlFlujo,
  produccionDiaria,
  resumenPorModelo,
  tiemposPorEtapa,
  totales,
  type Rango,
} from "@/lib/estadisticas";
import { duracion, fechaHora, numero, porcentaje } from "@/lib/formato";
import { GraficoDiario, Indicador, Panel, SinDatos, Tabla } from "./piezas";

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
    </div>
  );
}

import {
  ciclosContraObjetivo,
  movimientoDeHornoDiario,
  resumenDevoluciones,
  tiempoDeHornoPorTipo,
  ultimosCiclosDeHorno,
  usoDelHorno,
  type Rango,
} from "@/lib/estadisticas";
import type { Configuracion } from "@/lib/configuracion";
import { duracion, fechaHora, numero, porcentaje } from "@/lib/formato";
import { Indicador, Panel, SinDatos, Tabla } from "./piezas";

/** Cuanto tarda el horno, como se aprovecha y que no salio bien. */
export async function Horno({
  rango,
  cfg,
}: {
  rango: Rango;
  cfg: Configuracion;
}) {
  const [horno, ciclos, hornoDiario, devoluciones, horno2, ciclos2] =
    await Promise.all([
      tiempoDeHornoPorTipo(rango),
      ultimosCiclosDeHorno(rango),
      movimientoDeHornoDiario(rango),
      resumenDevoluciones(rango),
      usoDelHorno(rango, cfg.capacidad_horno),
      ciclosContraObjetivo(rango, cfg.minutos_horno_objetivo),
    ]);

  if (horno2.total === 0 && horno.length === 0 && devoluciones.devoluciones === 0) {
    return (
      <Panel titulo="Horno">
        <SinDatos texto="No entró ni salió nada del horno en este período." />
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
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
          {/* --------------------- Aprovechamiento del horno ------------------ */}
          {horno2.total > 0 && (
            <Panel
              titulo="Aprovechamiento del horno"
              detalle={`Capacidad ${cfg.capacidad_horno} secaderos · objetivo de ciclo ${duracion(cfg.minutos_horno_objetivo)}`}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Indicador
                  rotulo="Hornadas"
                  valor={numero(horno2.total)}
                  detalle={`${horno2.promedioSecaderos.toLocaleString("es-AR", { maximumFractionDigits: 1 })} secaderos en promedio`}
                  tono="neutro"
                />
                <Indicador
                  rotulo="Entraron completas"
                  valor={porcentaje(horno2.completas, horno2.total)}
                  detalle={`${numero(horno2.completas)} de ${numero(horno2.total)}`}
                  tono={
                    horno2.completas / horno2.total >= 0.8 ? "bueno" : "neutro"
                  }
                />
                <Indicador
                  rotulo="A medias con material"
                  valor={numero(horno2.cortasConMaterial)}
                  detalle="Había húmedos sin cargar"
                  tono={horno2.cortasConMaterial > 0 ? "malo" : "bueno"}
                />
                <Indicador
                  rotulo="Ciclos fuera de objetivo"
                  valor={numero(ciclos2.cortos + ciclos2.largos)}
                  detalle={`${numero(ciclos2.cortos)} cortos · ${numero(ciclos2.largos)} largos`}
                  tono={ciclos2.cortos > 0 ? "malo" : "neutro"}
                />
              </div>

              {/* Sin esta aclaracion, una hornada corta se leeria como
                  desperdicio de capacidad cuando puede no haber habido nada
                  mas para cargar. */}
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Una hornada por debajo de la capacidad sólo es un desvío del
                sector si había húmedos esperando. Esa es la columna{" "}
                <strong>esperaban</strong> de la tabla.
              </p>

              <div className="mt-3">
                <Tabla
                  encabezados={[
                    "Hornada",
                    "Entraron",
                    "Esperaban",
                    "Operario",
                  ]}
                  filas={horno2.hornadas.slice(0, 20).map((h) => [
                    `${fechaHora(h.inicio)}`,
                    `${numero(h.secaderos)} / ${numero(cfg.capacidad_horno)}`,
                    numero(h.habiaEsperando),
                    h.usuario,
                  ])}
                />
              </div>
            </Panel>
          )}

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
  );
}

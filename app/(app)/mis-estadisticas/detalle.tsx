import type { TipoMovimiento } from "@/lib/db/schema";
import { ETIQUETA_MOVIMIENTO } from "@/lib/estados";
import { numero } from "@/lib/formato";
import {
  misDiasYCorrecciones,
  misMovimientosEnElTiempo,
  misMovimientosPorTipo,
  misPalets,
  misPlacasPorModelo,
  misRoturasPorMotivo,
} from "@/lib/mis-estadisticas";
import { granularidad, nombreMes, type Periodo } from "@/lib/periodos";
import { etiquetaDia, fechaLocal, sumarDias } from "@/lib/rangos";
import { Vacio } from "@/components/ui";
import {
  BarrasHorizontales,
  GraficoColumnas,
  type PuntoColumna,
} from "@/components/graficos";
import { Barras, Indicador, Panel, Tabla } from "../estadisticas/piezas";

/** En el orden en que pasa el material, para que las columnas se lean igual siempre. */
const ORDEN_TIPOS: TipoMovimiento[] = [
  "carga",
  "entrada_horno",
  "salida_horno",
  "secado_natural",
  "devolucion_horno",
  "descarga",
  "correccion",
  "ajuste",
];

/**
 * Las estadisticas de una persona en un periodo. Es lo que ve cada operario
 * en "Mis estadisticas" y lo que ve el admin de cada uno en "Estadisticas
 * operarios": el mismo componente, para que las dos vistas no se separen.
 */
export async function DetalleOperario({
  uid,
  periodo,
  propio,
}: {
  uid: number;
  periodo: Periodo;
  /**
   * Si lo mira la misma persona. Cambia solo la forma de decirlo ("hiciste"
   * o "hizo"): los numeros y los paneles son exactamente los mismos, que es
   * el punto de que el admin vea lo que ve el operario.
   */
  propio: boolean;
}) {
  const rango = periodo.rango;
  const paso = granularidad(periodo.tipo);

  const [porTipo, enElTiempo, porModelo, roturas, palets, extra] =
    await Promise.all([
      misMovimientosPorTipo(uid, rango),
      paso ? misMovimientosEnElTiempo(uid, rango, paso) : Promise.resolve([]),
      misPlacasPorModelo(uid, rango),
      misRoturasPorMotivo(uid, rango),
      misPalets(uid, periodo.inicio, periodo.fin),
      misDiasYCorrecciones(uid, rango),
    ]);

  const total = porTipo.reduce(
    (a, f) => ({
      secaderos: a.secaderos + f.secaderos,
      placas: a.placas + f.placas,
      rotas: a.rotas + f.rotas,
    }),
    { secaderos: 0, placas: 0, rotas: 0 },
  );
  const rotasRegistradas = roturas.reduce((a, r) => a + r.placas, 0);
  const paletsTotal = palets.estandar + palets.optimizado;
  const hayAlgo =
    total.secaderos > 0 || rotasRegistradas > 0 || paletsTotal !== 0;

  // Columnas de la tabla por modelo: solo los pasos que la persona hizo.
  const tiposHechos = ORDEN_TIPOS.filter((t) =>
    porModelo.some((f) => f.tipo === t && f.placas > 0),
  );
  const modelos = [...new Set(porModelo.map((f) => f.modelo))]
    .map((modelo) => ({
      modelo,
      placas: Object.fromEntries(
        tiposHechos.map((t) => [
          t,
          porModelo.find((f) => f.modelo === modelo && f.tipo === t)?.placas ?? 0,
        ]),
      ) as Record<TipoMovimiento, number>,
    }))
    .filter((m) => tiposHechos.some((t) => m.placas[t] > 0))
    .sort(
      (a, b) =>
        tiposHechos.reduce((s, t) => s + b.placas[t], 0) -
          tiposHechos.reduce((s, t) => s + a.placas[t], 0) ||
        a.modelo.localeCompare(b.modelo),
    );

  const ordenados = [...porTipo].sort(
    (a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo),
  );

  // La serie en el tiempo con TODOS los dias (o meses) del periodo hasta hoy,
  // no solo los que tuvieron trabajo: un dia en cero tiene que verse como un
  // hueco en el grafico, no desaparecer.
  const hoy = fechaLocal();
  const ultimo = periodo.fin < hoy ? periodo.fin : hoy;
  const claves: string[] = [];
  if (paso === "dia") {
    for (let f = periodo.inicio; f <= ultimo; f = sumarDias(f, 1)) claves.push(f);
  } else if (paso === "mes") {
    for (let m = 1; m <= 12; m++) {
      const clave = `${periodo.inicio.slice(0, 4)}-${String(m).padStart(2, "0")}`;
      if (`${clave}-01` <= ultimo) claves.push(clave);
    }
  }
  const serie: PuntoColumna[] = claves.map((clave) => {
    const f = enElTiempo.find((x) => x.clave === clave);
    const dd = `${clave}-01`.split("-")[2];
    return {
      clave,
      // En una semana entra "lun 21"; en un mes, solo el numero de dia.
      etiqueta:
        paso === "dia"
          ? claves.length <= 12
            ? `${etiquetaDia(clave).split(" ")[0]} ${Number(dd)}`
            : String(Number(dd))
          : nombreMes(clave).slice(0, 3),
      titulo: paso === "dia" ? etiquetaDia(clave) : nombreMes(clave),
      valor: f?.secaderos ?? 0,
      detalle: f
        ? [
            `${numero(f.placas)} placas`,
            ...(f.rotas > 0 ? [`${numero(f.rotas)} rotas`] : []),
          ]
        : ["Sin trabajo"],
    };
  });

  // El grafico por modelo va sobre el paso con mas placas: sumar todos los
  // pasos contaria dos veces la misma placa (la entrada y la salida del horno).
  const tipoPrincipal = tiposHechos
    .slice()
    .sort(
      (x, y) =>
        modelos.reduce((s2, m) => s2 + m.placas[y], 0) -
        modelos.reduce((s2, m) => s2 + m.placas[x], 0),
    )[0];
  const porModeloPrincipal = tipoPrincipal
    ? modelos
        .map((m) => ({ etiqueta: m.modelo, valor: m.placas[tipoPrincipal] }))
        .filter((m) => m.valor > 0)
        .sort((x, y) => y.valor - x.valor)
    : [];

  return !hayAlgo ? (
      <Vacio
        titulo={
          periodo.futuro
            ? "Este período todavía no empezó"
            : propio
              ? "No registraste trabajo en este período"
              : "No registró trabajo en este período"
        }
        detalle={
          propio
            ? "Acá aparece lo que cargás, horneás o descargás con tu usuario."
            : "Acá aparece lo que carga, hornea o descarga con su usuario."
        }
      />
    ) : (
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador
            rotulo="Secaderos movidos"
            valor={numero(total.secaderos)}
            detalle={`${numero(total.placas)} placas`}
            tono="neutro"
          />
          <Indicador
            rotulo="Días trabajados"
            valor={numero(extra.dias)}
            detalle={
              extra.dias > 0
                ? `${(total.secaderos / extra.dias).toLocaleString("es-AR", { maximumFractionDigits: 1 })} secaderos por día`
                : undefined
            }
            tono="neutro"
          />
          <Indicador
            rotulo="Roturas registradas"
            valor={numero(rotasRegistradas)}
            detalle={propio ? "Placas rotas que cargaste" : "Placas rotas que cargó"}
            tono={rotasRegistradas > 0 ? "malo" : "bueno"}
          />
          {paletsTotal !== 0 ? (
            <Indicador
              rotulo="Palets armados"
              valor={numero(paletsTotal)}
              detalle={`${numero(palets.estandar)} estándar · ${numero(palets.optimizado)} optimizados`}
              tono="bueno"
            />
          ) : (
            <Indicador
              rotulo="Correcciones"
              valor={numero(extra.corregidos)}
              detalle={propio ? "Movimientos tuyos que se anularon" : "Movimientos suyos que se anularon"}
              tono={extra.corregidos > 0 ? "malo" : "bueno"}
            />
          )}
        </div>

        {serie.length > 1 && (
          <Panel
            titulo={paso === "dia" ? "Secaderos por día" : "Secaderos por mes"}
            detalle="Tocá o pasá el mouse por una columna para ver el detalle"
          >
            <GraficoColumnas datos={serie} unidad="secaderos" />
          </Panel>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {porModeloPrincipal.length > 0 && (
            <Panel
              titulo="Placas por modelo"
              detalle={
                tiposHechos.length > 1
                  ? `En ${ETIQUETA_MOVIMIENTO[tipoPrincipal!].toLowerCase()}, ${propio ? "tu" : "su"} paso principal`
                  : ETIQUETA_MOVIMIENTO[tipoPrincipal!]
              }
            >
              <BarrasHorizontales datos={porModeloPrincipal} unidad="placas" />
            </Panel>
          )}

          {ordenados.length > 1 && (
            <Panel
              titulo={propio ? "Lo que hiciste" : "Lo que hizo"}
              detalle="Secaderos por tipo de movimiento"
            >
              <BarrasHorizontales
                datos={[...ordenados]
                  .sort((x, y) => y.secaderos - x.secaderos)
                  .map((f) => ({
                    etiqueta: ETIQUETA_MOVIMIENTO[f.tipo],
                    valor: f.secaderos,
                    detalle: `${numero(f.placas)} placas`,
                  }))}
                unidad="secaderos"
              />
            </Panel>
          )}

          {roturas.length > 1 && (
            <Panel
              titulo={propio ? "Roturas que registraste" : "Roturas que registró"}
              detalle="Por motivo. Es lo que se cargó como roto, que no siempre es lo que se rompió en esas manos"
            >
              <Barras
                datos={roturas.map((r) => ({ etiqueta: r.motivo, valor: r.placas }))}
                total={rotasRegistradas}
              />
            </Panel>
          )}
        </div>

        {/* Los mismos numeros en tabla: para el que prefiere leerlos asi, y
            para que ningun valor dependa de tocar un grafico. */}
        <details className="tarjeta group p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 select-none">
            Ver los números en tablas
          </summary>
          <div className="mt-4 space-y-6">
            <Tabla
              encabezados={["Movimiento", "Secaderos", "Placas", "Rotas"]}
              filas={ordenados.map((f) => [
                ETIQUETA_MOVIMIENTO[f.tipo],
                numero(f.secaderos),
                numero(f.placas),
                f.rotas > 0 ? numero(f.rotas) : "—",
              ])}
              pie={[
                "Total",
                numero(total.secaderos),
                numero(total.placas),
                numero(total.rotas),
              ]}
            />
            {paso && enElTiempo.length > 0 && (
              <Tabla
                encabezados={[
                  paso === "dia" ? "Día" : "Mes",
                  "Secaderos",
                  "Placas",
                  "Rotas",
                ]}
                filas={enElTiempo.map((f) => [
                  paso === "dia" ? etiquetaDia(f.clave) : nombreMes(f.clave),
                  numero(f.secaderos),
                  numero(f.placas),
                  f.rotas > 0 ? numero(f.rotas) : "—",
                ])}
              />
            )}
            {modelos.length > 0 && (
              <Tabla
                encabezados={[
                  "Modelo",
                  ...tiposHechos.map((t) => ETIQUETA_MOVIMIENTO[t]),
                ]}
                filas={modelos.map((m) => [
                  m.modelo,
                  ...tiposHechos.map((t) =>
                    m.placas[t] > 0 ? numero(m.placas[t]) : "—",
                  ),
                ])}
              />
            )}
            {roturas.length > 0 && (
              <Tabla
                encabezados={["Motivo de rotura", "Placas"]}
                filas={roturas.map((r) => [r.motivo, numero(r.placas)])}
              />
            )}
          </div>
        </details>

        {paletsTotal !== 0 && extra.corregidos > 0 && (
          <p className="text-xs text-slate-500">
            {numero(extra.corregidos)}{" "}
            {extra.corregidos === 1
              ? `movimiento ${propio ? "tuyo" : "suyo"} se anuló`
              : `movimientos ${propio ? "tuyos" : "suyos"} se anularon`}{" "}
            en este período por estar mal cargados.
          </p>
        )}
      </div>
    );
}

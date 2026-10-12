import { requerirRol } from "@/lib/auth";
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
import { granularidad, leerPeriodo, nombreMes } from "@/lib/periodos";
import { etiquetaDia, fechaLocal } from "@/lib/rangos";
import { Titulo, Vacio } from "@/components/ui";
import { Barras, Indicador, Panel, Tabla } from "../estadisticas/piezas";
import { SelectorPeriodo } from "../estadisticas/selector-periodo";

export const metadata = { title: "Mis estadísticas · Secaderos" };
export const dynamic = "force-dynamic";

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
 * Lo que hizo la persona logueada: sus movimientos, sus placas, las roturas
 * que registro y los palets que armo. No ve el trabajo de nadie mas; para eso
 * estan las estadisticas generales, que son del admin y el auditor.
 */
export default async function PaginaMisEstadisticas({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; fecha?: string }>;
}) {
  const sesion = await requerirRol(
    "carrusel",
    "llenado_manual",
    "horno",
    "paletizado",
    "admin",
  );
  const params = await searchParams;

  const hoy = fechaLocal();
  // Por defecto la semana: es lo que un operario mira para saber como viene.
  const periodo = leerPeriodo(params.periodo ?? "semana", params.fecha, hoy);
  const rango = periodo.rango;
  const paso = granularidad(periodo.tipo);
  const uid = sesion.uid;

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

  return (
    <>
      <Titulo detalle={`${sesion.nombre} · ${periodo.etiqueta}`}>
        Mis estadísticas
      </Titulo>

      <div className="tarjeta mb-6 p-4">
        <SelectorPeriodo
          ruta="/mis-estadisticas"
          tipo={periodo.tipo}
          inicio={periodo.inicio}
          anterior={periodo.anterior}
          siguiente={periodo.siguiente}
          etiqueta={periodo.etiqueta}
          enCurso={periodo.enCurso}
          hoy={hoy}
          consulta=""
        />
      </div>

      {!hayAlgo ? (
        <Vacio
          titulo={
            periodo.futuro
              ? "Este período todavía no empezó"
              : "No registraste trabajo en este período"
          }
          detalle="Acá aparece lo que cargás, horneás o descargás con tu usuario."
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
              detalle="Placas rotas que cargaste"
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
                detalle="Movimientos tuyos que se anularon"
                tono={extra.corregidos > 0 ? "malo" : "bueno"}
              />
            )}
          </div>

          {ordenados.length > 0 && (
            <Panel
              titulo="Lo que hiciste"
              detalle="Cada movimiento es un secadero que pasaste al paso siguiente"
            >
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
            </Panel>
          )}

          {paso && enElTiempo.length > 0 && (
            <Panel titulo={paso === "dia" ? "Por día" : "Por mes"}>
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
            </Panel>
          )}

          {modelos.length > 0 && (
            <Panel titulo="Por modelo, en placas">
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
            </Panel>
          )}

          {roturas.length > 0 && (
            <Panel
              titulo="Roturas que registraste, por motivo"
              detalle="Lo que cargaste como roto, que no siempre es lo que se rompió en tus manos"
            >
              <Barras
                datos={roturas.map((r) => ({ etiqueta: r.motivo, valor: r.placas }))}
                total={rotasRegistradas}
              />
            </Panel>
          )}

          {paletsTotal !== 0 && extra.corregidos > 0 && (
            <p className="text-xs text-slate-500">
              {numero(extra.corregidos)}{" "}
              {extra.corregidos === 1
                ? "movimiento tuyo se anuló"
                : "movimientos tuyos se anularon"}{" "}
              en este período por estar mal cargados.
            </p>
          )}
        </div>
      )}
    </>
  );
}

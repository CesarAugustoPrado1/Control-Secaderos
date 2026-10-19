import {
  PUESTOS,
  produccionPorPuesto,
  produccionPorPuestoEnElTiempo,
  type Cuenta,
  type Rango,
} from "@/lib/estadisticas";
import { granularidad, nombreMes, type Periodo } from "@/lib/periodos";
import { etiquetaDia } from "@/lib/rangos";
import { medida, m2Numero, numero } from "@/lib/formato";
import { Indicador, Opciones, Panel, SinDatos, Tabla } from "./piezas";

export type Unidad = "m2" | "secaderos";

/** Como se nombra cada unidad en los titulos. */
const NOMBRE_UNIDAD: Record<Unidad, string> = {
  m2: "m²",
  secaderos: "secaderos",
};

/**
 * Cuanto movio cada puesto en el periodo: lo que cargo el carrusel, lo que
 * paso por el horno y lo que se paletizo, en m2 o en secaderos, por modelo
 * y en total.
 */
export async function Produccion({
  periodo,
  rango,
  unidad,
  hrefUnidad,
}: {
  periodo: Periodo;
  rango: Rango;
  unidad: Unidad;
  hrefUnidad: (u: Unidad) => string;
}) {
  const paso = granularidad(periodo.tipo);
  const [prod, enElTiempo] = await Promise.all([
    produccionPorPuesto(rango),
    paso ? produccionPorPuestoEnElTiempo(rango, paso) : Promise.resolve([]),
  ]);

  // Las columnas del llenado manual aparecen solo si hubo: en la mayoria de
  // los periodos no hay guardas y serian dos columnas de ceros.
  const puestos = PUESTOS.filter(
    (p) =>
      (p.clave !== "manual_carga" && p.clave !== "manual_descarga") ||
      prod.totales[p.clave].secaderos > 0,
  );

  // En m2, las guardas van en metros lineales: no se suman a los m2, van al
  // lado con su unidad ("40.536 + 2.016 ml"). Los m2 traen decimales y se
  // muestran redondeados; los secaderos son enteros.
  const fmtCuenta = (c: Cuenta) => {
    if (unidad === "secaderos") return numero(c.secaderos);
    const partes = [
      c.m2 > 0 ? m2Numero(c.m2) : null,
      c.ml > 0 ? `${m2Numero(c.ml)} ml` : null,
    ].filter(Boolean);
    return partes.length ? partes.join(" + ") : "0";
  };
  const vacia = (c: Cuenta) => (unidad === "m2" ? c.m2 + c.ml === 0 : c.secaderos === 0);
  const celda = (c: Cuenta) => (vacia(c) ? "—" : fmtCuenta(c));
  const hayMl = PUESTOS.some((p) => prod.totales[p.clave].ml > 0);
  const otra = (c: Cuenta) =>
    unidad === "m2"
      ? `${numero(c.secaderos)} ${c.secaderos === 1 ? "secadero" : "secaderos"}`
      : medida(c.m2, c.ml);
  // "en m² y ml" solo si en el periodo hubo guardas.
  const nombreUnidad = unidad === "m2" && hayMl ? "m² y ml" : NOMBRE_UNIDAD[unidad];

  const hayDatos = PUESTOS.some((p) => prod.totales[p.clave].secaderos > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Contar en
        </span>
        <Opciones
          chica
          opciones={[
            { href: hrefUnidad("m2"), etiqueta: "m²", activa: unidad === "m2" },
            {
              href: hrefUnidad("secaderos"),
              etiqueta: "Secaderos",
              activa: unidad === "secaderos",
            },
          ]}
        />
      </div>

      {!hayDatos ? (
        <Panel titulo="Producción del período">
          <SinDatos
            texto={
              periodo.futuro
                ? "Este período todavía no empezó."
                : "No se cargó, horneó ni paletizó nada en este período."
            }
          />
        </Panel>
      ) : (
        <>
          <div
            className={`grid gap-3 sm:grid-cols-3 ${puestos.length > 3 ? "lg:grid-cols-5" : ""}`}
          >
            {puestos.map((p) => (
              <Indicador
                key={p.clave}
                rotulo={p.etiqueta}
                valor={fmtCuenta(prod.totales[p.clave])}
                detalle={`${p.detalle}: ${otra(prod.totales[p.clave])}`}
                tono="neutro"
              />
            ))}
          </div>

          <Panel
            titulo={`Por tipo de secadero y modelo, en ${nombreUnidad}`}
            detalle={
              unidad === "secaderos"
                ? "Un secadero con dos modelos cuenta en los dos, pero una sola vez en el total"
                : hayMl
                  ? "Metros cuadrados, con la conversión de cada producto y sin lo roto en ese paso. Las guardas van en metros lineales (ml) y no se suman a los m²"
                  : "Metros cuadrados, con la conversión de cada producto y sin lo roto en ese paso"
            }
          >
            <Tabla
              encabezados={["Modelo", ...puestos.map((p) => p.etiqueta)]}
              grupos={prod.tipos.map((g) => ({
                titulo: g.tipo,
                filas: g.modelos.map((m) => [
                  m.modelo,
                  ...puestos.map((p) => celda(m.puestos[p.clave])),
                ]),
                subtotal: [
                  `Subtotal ${g.tipo}`,
                  ...puestos.map((p) => celda(g.subtotal[p.clave])),
                ],
              }))}
              pie={["Total", ...puestos.map((p) => fmtCuenta(prod.totales[p.clave]))]}
            />
          </Panel>

          {paso && enElTiempo.length > 0 && (
            <Panel
              titulo={
                paso === "dia"
                  ? `Por día, en ${nombreUnidad}`
                  : `Por mes, en ${nombreUnidad}`
              }
              detalle="Todos los modelos juntos"
            >
              <Tabla
                encabezados={[paso === "dia" ? "Día" : "Mes", ...puestos.map((p) => p.etiqueta)]}
                filas={enElTiempo.map((f) => [
                  paso === "dia" ? etiquetaDia(f.clave) : nombreMes(f.clave),
                  ...puestos.map((p) => celda(f.puestos[p.clave])),
                ])}
                pie={["Total", ...puestos.map((p) => fmtCuenta(prod.totales[p.clave]))]}
              />
            </Panel>
          )}

          <p className="text-xs text-slate-500">
            <strong>Horno</strong> cuenta lo que entró en el período: un secadero
            rehorneado entra dos veces y cuenta dos. Lo que se secó al sol no
            pasó por el horno y no se cuenta ahí.{" "}
            {puestos.length > 3 &&
              "Carrusel y paletizado no incluyen los tipos de llenado manual, que van en sus propias columnas."}
          </p>
        </>
      )}
    </div>
  );
}


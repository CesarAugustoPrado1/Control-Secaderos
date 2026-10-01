import {
  PUESTOS,
  produccionPorPuesto,
  produccionPorPuestoEnElTiempo,
  type Cuenta,
  type Rango,
} from "@/lib/estadisticas";
import { granularidad, nombreMes, type Periodo } from "@/lib/periodos";
import { etiquetaDia } from "@/lib/rangos";
import { numero } from "@/lib/formato";
import { Indicador, Opciones, Panel, SinDatos, Tabla } from "./piezas";

export type Unidad = "placas" | "secaderos";

/**
 * Cuanto movio cada puesto en el periodo: lo que cargo el carrusel, lo que
 * paso por el horno y lo que se paletizo, en placas o en secaderos, por modelo
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

  const valor = (c: Cuenta) => c[unidad];
  const otra = (c: Cuenta) =>
    unidad === "placas"
      ? `${numero(c.secaderos)} ${c.secaderos === 1 ? "secadero" : "secaderos"}`
      : `${numero(c.placas)} placas`;

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
            { href: hrefUnidad("placas"), etiqueta: "Placas", activa: unidad === "placas" },
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
                valor={numero(valor(prod.totales[p.clave]))}
                detalle={`${p.detalle}: ${otra(prod.totales[p.clave])}`}
                tono="neutro"
              />
            ))}
          </div>

          <Panel
            titulo={`Por tipo de secadero y modelo, en ${unidad}`}
            detalle={
              unidad === "secaderos"
                ? "Un secadero con dos modelos cuenta en los dos, pero una sola vez en el total"
                : "Placas que entraron al secadero, al horno o a producto terminado, sin las rotas en ese paso"
            }
          >
            <Tabla
              encabezados={["Modelo", ...puestos.map((p) => p.etiqueta)]}
              grupos={prod.tipos.map((g) => ({
                titulo: g.tipo,
                filas: g.modelos.map((m) => [
                  m.modelo,
                  ...puestos.map((p) => celda(valor(m.puestos[p.clave]))),
                ]),
                subtotal: [
                  `Subtotal ${g.tipo}`,
                  ...puestos.map((p) => celda(valor(g.subtotal[p.clave]))),
                ],
              }))}
              pie={["Total", ...puestos.map((p) => numero(valor(prod.totales[p.clave])))]}
            />
          </Panel>

          {paso && enElTiempo.length > 0 && (
            <Panel
              titulo={paso === "dia" ? `Por día, en ${unidad}` : `Por mes, en ${unidad}`}
              detalle="Todos los modelos juntos"
            >
              <Tabla
                encabezados={[paso === "dia" ? "Día" : "Mes", ...puestos.map((p) => p.etiqueta)]}
                filas={enElTiempo.map((f) => [
                  paso === "dia" ? etiquetaDia(f.clave) : nombreMes(f.clave),
                  ...puestos.map((p) => celda(valor(f.puestos[p.clave]))),
                ])}
                pie={["Total", ...puestos.map((p) => numero(valor(prod.totales[p.clave])))]}
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

/** Los ceros van como guion para que la tabla se lea de un vistazo. */
const celda = (n: number) => (n === 0 ? "—" : numero(n));

import {
  desperdicioPorEtapa,
  desperdicioPorMotivo,
  desperdicioPorUsuario,
  roturasCarruselPorMotivo,
  roturasCarruselPorProducto,
  roturasPorEtapa,
  roturasPorProducto,
  roturasPorTipoSecadero,
  totales,
  type Rango,
} from "@/lib/estadisticas";
import { ETIQUETA_MOVIMIENTO } from "@/lib/estados";
import { numero, porcentaje } from "@/lib/formato";
import { Barras, Indicador, Panel, SinDatos, Tabla } from "./piezas";

/** Cuanto se rompe, donde, por que y de que modelo. */
export async function Roturas({ rango }: { rango: Rango }) {
  const [
    tot,
    porMotivo,
    porEtapa,
    porUsuario,
    porTipoSec,
    promEtapa,
    promProducto,
    carruselProducto,
    carruselMotivo,
  ] = await Promise.all([
    totales(rango),
    desperdicioPorMotivo(rango),
    desperdicioPorEtapa(rango),
    desperdicioPorUsuario(rango),
    roturasPorTipoSecadero(rango),
    roturasPorEtapa(rango),
    roturasPorProducto(rango),
    roturasCarruselPorProducto(rango),
    roturasCarruselPorMotivo(rango),
  ]);

  if (tot.cargadas === 0 && tot.rotas === 0) {
    return (
      <Panel titulo="Roturas">
        <SinDatos texto="Todavía no hay movimientos en este período." />
      </Panel>
    );
  }

  const rotasEnCarrusel = carruselProducto.reduce((a, r) => a + r.placas, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          rotulo="Desperdicio"
          valor={numero(tot.rotas)}
          detalle={`${porcentaje(tot.rotas, tot.cargadas)} de lo producido`}
          tono="malo"
        />
        <Indicador
          rotulo="Dentro del circuito"
          valor={numero(tot.rotas - rotasEnCarrusel)}
          detalle="Con la placa ya en un secadero"
          tono={tot.rotas - rotasEnCarrusel > 0 ? "malo" : "bueno"}
        />
        <Indicador
          rotulo="Antes del secadero"
          valor={numero(rotasEnCarrusel)}
          detalle="En la línea del carrusel"
          tono={rotasEnCarrusel > 0 ? "malo" : "bueno"}
        />
      </div>

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
                    etiqueta: e.etapa,
                    valor: e.placas,
                  }))}
                  total={tot.rotas}
                />
              )}
            </Panel>
          </div>

          {/* ------------------- Roturas antes del secadero -------------------- */}
          {rotasEnCarrusel > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                titulo="Roturas antes del secadero, por producto"
                detalle={`${numero(rotasEnCarrusel)} placas rotas en la línea del carrusel, sin llegar a entrar a un secadero`}
              >
                <Barras
                  datos={carruselProducto.map((r) => ({
                    etiqueta: r.producto,
                    valor: r.placas,
                  }))}
                  total={rotasEnCarrusel}
                />
              </Panel>

              <Panel titulo="Roturas antes del secadero, por motivo">
                <Barras
                  datos={carruselMotivo.map((r) => ({
                    etiqueta: r.motivo,
                    valor: r.placas,
                  }))}
                  total={rotasEnCarrusel}
                />
              </Panel>
            </div>
          )}
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
    </div>
  );
}

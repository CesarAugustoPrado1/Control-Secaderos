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
import { medida, numero, porcentajeRotura } from "@/lib/formato";
import type { Medida, PromedioRotura } from "@/lib/estadisticas";
import { BarrasMedida, Indicador, Panel, SinDatos, Tabla } from "./piezas";

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

  // Todo en m2 (y las guardas en metros lineales): contar placas mezcla una
  // placa grande con una chica como si fueran lo mismo.
  const sumar = (filas: Medida[]): Medida =>
    filas.reduce((a, r) => ({ m2: a.m2 + r.m2, ml: a.ml + r.ml }), { m2: 0, ml: 0 });
  const rotas: Medida = { m2: tot.m2.rotas, ml: tot.ml.rotas };
  const cargado: Medida = { m2: tot.m2.cargadas, ml: tot.ml.cargadas };
  const antes = sumar(carruselProducto);
  const adentro: Medida = { m2: rotas.m2 - antes.m2, ml: rotas.ml - antes.ml };
  const hayRotas = (m: Medida) => m.m2 + m.ml > 0.0001;
  const rotasEnCarrusel = carruselProducto.reduce((a, r) => a + r.placas, 0);
  const filasPromedio = (filas: PromedioRotura[], clave: (c: string) => string) =>
    filas.map((f) => [
      clave(f.clave),
      numero(f.secaderos),
      medida(f.rotas.m2, f.rotas.ml),
      medida(f.promedio.m2, f.promedio.ml),
    ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Indicador
          rotulo="Desperdicio"
          valor={medida(rotas.m2, rotas.ml)}
          detalle={porcentajeRotura(rotas, cargado)}
          tono="malo"
        />
        <Indicador
          rotulo="Dentro del circuito"
          valor={medida(adentro.m2, adentro.ml)}
          detalle="Con la placa ya en un secadero"
          tono={hayRotas(adentro) ? "malo" : "bueno"}
        />
        <Indicador
          rotulo="Antes del secadero"
          valor={medida(antes.m2, antes.ml)}
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
                <BarrasMedida
                  datos={porMotivo.map((m) => ({ etiqueta: m.motivo, m2: m.m2, ml: m.ml }))}
                  total={rotas}
                />
              )}
            </Panel>

            <Panel titulo="Dónde se rompen">
              {porEtapa.length === 0 ? (
                <SinDatos texto="No se registraron roturas. 👏" />
              ) : (
                <BarrasMedida
                  datos={porEtapa.map((e) => ({ etiqueta: e.etapa, m2: e.m2, ml: e.ml }))}
                  total={rotas}
                />
              )}
            </Panel>
          </div>

          {/* ------------------- Roturas antes del secadero -------------------- */}
          {rotasEnCarrusel > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel
                titulo="Roturas antes del secadero, por producto"
                detalle={`${medida(antes.m2, antes.ml)} rotos en la línea del carrusel, sin llegar a entrar a un secadero`}
              >
                <BarrasMedida
                  datos={carruselProducto.map((r) => ({ etiqueta: r.producto, m2: r.m2, ml: r.ml }))}
                  total={antes}
                />
              </Panel>

              <Panel titulo="Roturas antes del secadero, por motivo">
                <BarrasMedida
                  datos={carruselMotivo.map((r) => ({ etiqueta: r.motivo, m2: r.m2, ml: r.ml }))}
                  total={antes}
                />
              </Panel>
            </div>
          )}
          {/* ---------------------- Promedios de rotura ----------------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel
              titulo="Roturas promedio por secadero"
              detalle="Cuánto se rompe por secadero cargado, según el tipo de secadero"
            >
              {porTipoSec.length === 0 ? (
                <SinDatos />
              ) : (
                <Tabla
                  encabezados={["Tipo", "Secaderos", "Roto", "Promedio"]}
                  filas={filasPromedio(porTipoSec, (c) => c)}
                />
              )}
            </Panel>

            <Panel
              titulo="Roturas promedio por etapa"
              detalle="Cuánto se rompe por secadero en cada paso"
            >
              {promEtapa.length === 0 ? (
                <SinDatos />
              ) : (
                <Tabla
                  encabezados={["Etapa", "Secaderos", "Roto", "Promedio"]}
                  filas={filasPromedio(
                    promEtapa,
                    (c) => ETIQUETA_MOVIMIENTO[c as keyof typeof ETIQUETA_MOVIMIENTO],
                  )}
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
                encabezados={["Producto", "Secaderos", "Roto", "Promedio"]}
                filas={filasPromedio(promProducto, (c) => c)}
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
                encabezados={["Usuario", "Roto", "Movimientos con rotura"]}
                filas={porUsuario.map((u) => [
                  u.usuario,
                  medida(u.m2, u.ml),
                  numero(u.movimientos),
                ])}
              />
            </Panel>
          )}
    </div>
  );
}

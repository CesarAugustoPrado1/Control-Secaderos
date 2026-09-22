import { requerirRol } from "@/lib/auth";
import {
  corregiblesPara,
  leerConfig,
  listarMovimientos,
  motivosActivos,
  secaderosConContenido,
  secaderosEnReproceso,
} from "@/lib/consultas";
import { notasDelHorno } from "@/lib/plan";
import { esFecha, etiquetaRelativa, fechaLocal, rangoDeFecha } from "@/lib/rangos";
import { Actividad } from "@/components/actividad";
import { Plegable } from "@/components/plegable";
import { PanelHorno } from "./panel";

export const metadata = { title: "Horno · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaHorno({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const sesion = await requerirRol("horno", "admin");
  const { dia } = await searchParams;
  const hoy = fechaLocal();
  // El dia elegido cambia las notas y lo hecho: sacar y meter son siempre el
  // estado de ahora del horno, no el de ese dia.
  const fecha = esFecha(dia) ? dia : hoy;
  const { desde, hasta } = rangoDeFecha(fecha);

  const [enHorno, humedos, motivos, cfg, reproceso, notas, hecho] =
    await Promise.all([
      secaderosConContenido(["horno"]),
      secaderosConContenido(["humedo"]),
      motivosActivos(),
      leerConfig(),
      secaderosEnReproceso(),
      notasDelHorno(fecha),
      // Lo que hizo el horno ese dia, de los dos circuitos: el hornero mete y
      // saca tambien las guardas.
      listarMovimientos({
        tipo: ["entrada_horno", "salida_horno", "secado_natural"],
        desde,
        hasta,
        porPagina: 300,
        orden: "asc",
      }),
    ]);

  const corregibles = await corregiblesPara(hecho.items, {
    uid: sesion.uid,
    rol: sesion.rol,
  });

  // Lo mas viejo primero: es el orden en que conviene trabajar.
  const porAntiguedad = (a: { estadoDesde: Date }, b: { estadoDesde: Date }) =>
    a.estadoDesde.getTime() - b.estadoDesde.getTime();

  /**
   * Los que no secaron van al principio de la cola: ya vienen demorados y estan
   * reteniendo un secadero que deberia estar produciendo.
   */
  const porPrioridad = (
    a: { id: number; estadoDesde: Date },
    b: { id: number; estadoDesde: Date },
  ) => {
    const pa = reproceso.has(a.id) ? 0 : 1;
    const pb = reproceso.has(b.id) ? 0 : 1;
    return pa - pb || porAntiguedad(a, b);
  };

  const cuenta = (tipo: string) =>
    hecho.items.filter((m) => m.tipo === tipo).length;
  const resumen = [
    [cuenta("entrada_horno"), "entraron", "entró"],
    [cuenta("salida_horno"), "salieron", "salió"],
    [cuenta("secado_natural"), "al sol", "al sol"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, plural, singular]) => `${n} ${n === 1 ? singular : plural}`)
    .join(" · ");
  const etiqueta = etiquetaRelativa(fecha, hoy);

  return (
    <div className="space-y-8">
      <PanelHorno
        enHorno={[...enHorno].sort(porAntiguedad)}
        humedos={[...humedos].sort(porPrioridad)}
        motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
        capacidadHorno={cfg.capacidad_horno}
        reproceso={[...reproceso]}
        notas={notas}
        fecha={fecha}
        hoy={hoy}
      />

      {/* Abajo y plegado: el trabajo del hornero es sacar y meter. Esto es para
          confirmar lo que ya hizo y, si se equivoco, corregirlo. */}
      {fecha <= hoy && (
        <Plegable
          id="hecho-horno"
          titulo={`Hecho en el horno · ${etiqueta}`}
          resumen={
            <span className="text-sm font-semibold text-slate-500">
              {resumen || "Sin movimientos"}
            </span>
          }
        >
          <Actividad
            titulo="Hecho en el horno"
            dia={etiqueta}
            movimientos={hecho.items}
            corregibles={corregibles}
            volverA="/horno"
            mixta
            sinTitulo
            vacio={
              fecha === hoy
                ? "Todavía no entró ni salió ningún secadero hoy."
                : "Ese día no entró ni salió ningún secadero."
            }
          />
        </Plegable>
      )}
    </div>
  );
}

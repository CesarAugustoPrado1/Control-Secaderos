import { requerirRol } from "@/lib/auth";
import {
  leerConfig,
  motivosActivos,
  secaderosConContenido,
  secaderosEnReproceso,
} from "@/lib/consultas";
import { notasDelHorno } from "@/lib/plan";
import { esFecha, fechaLocal } from "@/lib/rangos";
import { PanelHorno } from "./panel";

export const metadata = { title: "Horno · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaHorno({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  await requerirRol("horno", "admin");
  const { dia } = await searchParams;
  const hoy = fechaLocal();
  // El dia elegido solo cambia las notas: sacar y meter son siempre el estado
  // de ahora del horno, no el de ese dia.
  const fecha = esFecha(dia) ? dia : hoy;

  const [enHorno, humedos, motivos, cfg, reproceso, notas] = await Promise.all([
    secaderosConContenido(["horno"]),
    secaderosConContenido(["humedo"]),
    motivosActivos(),
    leerConfig(),
    secaderosEnReproceso(),
    notasDelHorno(fecha),
  ]);

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

  return (
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
  );
}

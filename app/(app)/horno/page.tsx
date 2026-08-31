import { requerirRol } from "@/lib/auth";
import {
  leerConfig,
  motivosActivos,
  secaderosConContenido,
  secaderosDevueltosAlHorno,
} from "@/lib/consultas";
import { PanelHorno } from "./panel";

export const metadata = { title: "Horno · Secaderos" };

export default async function PaginaHorno() {
  await requerirRol("horno", "admin");

  const [enHorno, humedos, motivos, cfg, devueltos] = await Promise.all([
    secaderosConContenido(["horno"]),
    secaderosConContenido(["humedo"]),
    motivosActivos(),
    leerConfig(),
    secaderosDevueltosAlHorno(),
  ]);

  // Lo mas viejo primero: es el orden en que conviene trabajar.
  const porAntiguedad = (a: { estadoDesde: Date }, b: { estadoDesde: Date }) =>
    a.estadoDesde.getTime() - b.estadoDesde.getTime();

  /**
   * Los devueltos van al principio de la cola: ya vienen demorados y estan
   * ocupando un secadero que deberia estar produciendo.
   */
  const porPrioridad = (a: { id: number; estadoDesde: Date }, b: { id: number; estadoDesde: Date }) => {
    const pa = devueltos.has(a.id) ? 0 : 1;
    const pb = devueltos.has(b.id) ? 0 : 1;
    return pa - pb || porAntiguedad(a, b);
  };

  return (
    <PanelHorno
      enHorno={[...enHorno].sort(porAntiguedad)}
      humedos={[...humedos].sort(porPrioridad)}
      motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
      capacidadHorno={cfg.capacidad_horno}
      devueltos={[...devueltos]}
    />
  );
}

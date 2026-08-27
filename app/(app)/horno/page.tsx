import { requerirRol } from "@/lib/auth";
import {
  leerConfig,
  motivosActivos,
  secaderosConContenido,
} from "@/lib/consultas";
import { PanelHorno } from "./panel";

export const metadata = { title: "Horno · Secaderos" };

export default async function PaginaHorno() {
  await requerirRol("horno", "admin");

  const [enHorno, humedos, motivos, cfg] = await Promise.all([
    secaderosConContenido(["horno"]),
    secaderosConContenido(["humedo"]),
    motivosActivos(),
    leerConfig(),
  ]);

  // Lo mas viejo primero: es el orden en que conviene trabajar.
  const porAntiguedad = (a: { estadoDesde: Date }, b: { estadoDesde: Date }) =>
    a.estadoDesde.getTime() - b.estadoDesde.getTime();

  return (
    <PanelHorno
      enHorno={[...enHorno].sort(porAntiguedad)}
      humedos={[...humedos].sort(porAntiguedad)}
      motivos={motivos.map((m) => ({ id: m.id, nombre: m.nombre }))}
      capacidadHorno={cfg.capacidad_horno}
    />
  );
}

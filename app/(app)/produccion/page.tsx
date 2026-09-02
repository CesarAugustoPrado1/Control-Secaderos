import { requerirRol } from "@/lib/auth";
import { diasConMovimiento, resumenDelDia } from "@/lib/produccion";
import { fechaLocal } from "@/lib/rangos";
import { Titulo } from "@/components/ui";
import { PanelProduccion } from "./panel";

export const metadata = { title: "Producción · Secaderos" };
export const dynamic = "force-dynamic";

const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function PaginaProduccion({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  await requerirRol("administrativo", "admin", "auditor");
  const { dia } = await searchParams;

  const hoy = fechaLocal();
  // Sin parametro se ve el dia en curso: es lo que se mira nueve de cada diez
  // veces, y no tiene sentido hacer un click para llegar ahi.
  const fecha = esFecha(dia) ? dia! : hoy;

  const [resumen, dias] = await Promise.all([
    resumenDelDia(fecha),
    diasConMovimiento(14),
  ]);

  // El dia de hoy va siempre en la lista aunque todavia no haya pasado nada:
  // si no, al abrir la pantalla a la mañana no habria ningun boton marcado.
  const conHoy = dias.includes(hoy) ? dias : [hoy, ...dias];
  // Y el dia elegido a mano tambien, por si se llega con un link a una fecha
  // vacia y despues no se puede volver a ella.
  const listaDias = conHoy.includes(fecha) ? conHoy : [...conHoy, fecha].sort().reverse();

  return (
    <div className="space-y-5">
      <Titulo detalle="Lo que procesó cada sector, día por día">
        Producción
      </Titulo>

      <PanelProduccion
        resumen={resumen}
        dias={listaDias}
        fechaElegida={fecha}
        hoy={hoy}
      />
    </div>
  );
}

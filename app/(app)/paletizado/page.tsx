import { requerirRol } from "@/lib/auth";
import { secaderosConContenido } from "@/lib/consultas";
import { numero } from "@/lib/formato";
import { TarjetaSecadero } from "@/components/tarjeta-secadero";
import { Titulo, Vacio } from "@/components/ui";

export const metadata = { title: "Paletizado · Secaderos" };

export default async function PaginaPaletizado() {
  await requerirRol("paletizado", "admin");

  const secos = (await secaderosConContenido(["seco"])).sort(
    (a, b) => a.estadoDesde.getTime() - b.estadoDesde.getTime(),
  );

  const totalPlacas = secos.reduce((a, s) => a + s.total, 0);

  return (
    <>
      <Titulo detalle="Elegí un secadero seco para descargarlo">
        Paletizado
      </Titulo>

      {secos.length === 0 ? (
        <Vacio
          titulo="No hay secaderos secos"
          detalle="Cuando horno saque alguno, va a aparecer acá."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {secos.length} {secos.length === 1 ? "secadero" : "secaderos"} ·{" "}
            {numero(totalPlacas)} placas esperando
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {secos.map((secadero) => (
              <TarjetaSecadero
                key={secadero.id}
                secadero={secadero}
                href={`/paletizado/${secadero.id}`}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

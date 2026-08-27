import { requerirRol } from "@/lib/auth";
import { secaderosConContenido } from "@/lib/consultas";
import { TarjetaSecadero } from "@/components/tarjeta-secadero";
import { Titulo, Vacio } from "@/components/ui";

export const metadata = { title: "Carrusel · Secaderos" };

export default async function PaginaCarrusel() {
  await requerirRol("carrusel", "admin");
  const vacios = await secaderosConContenido(["vacio"]);

  return (
    <>
      <Titulo detalle="Elegí un secadero vacío para cargarlo">
        Carrusel
      </Titulo>

      {vacios.length === 0 ? (
        <Vacio
          titulo="No hay secaderos vacíos"
          detalle="Cuando paletizado descargue alguno, va a aparecer acá."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {vacios.length} {vacios.length === 1 ? "disponible" : "disponibles"}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {vacios.map((secadero) => (
              <TarjetaSecadero
                key={secadero.id}
                secadero={secadero}
                href={`/carrusel/${secadero.id}`}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

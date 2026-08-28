import { requerirRol } from "@/lib/auth";
import { secaderosConContenido } from "@/lib/consultas";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { ListaSecaderos } from "@/components/lista-secaderos";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Cargar · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaCarrusel() {
  const sesion = await requerirRol("carrusel", "llenado_manual", "admin");
  const vacios = await secaderosConContenido(["vacio"]);

  // El titulo dice el sector de quien esta cargando, asi el operario ve que
  // esta en su pantalla; los secaderos disponibles son los mismos para todos.
  const sector =
    sesion.rol === "llenado_manual" || sesion.rol === "carrusel"
      ? ETIQUETA_ROL[sesion.rol]
      : "Cargar secaderos";

  return (
    <>
      <Titulo detalle="Buscá el secadero por número y cargalo">{sector}</Titulo>

      <ListaSecaderos
        secaderos={vacios}
        hrefBase="/carrusel"
        vacio={{
          titulo: "No hay secaderos vacíos",
          detalle: "Cuando se descargue alguno, va a aparecer acá.",
        }}
      />
    </>
  );
}

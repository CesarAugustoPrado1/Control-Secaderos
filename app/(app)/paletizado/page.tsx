import { requerirRol } from "@/lib/auth";
import { secaderosConContenido } from "@/lib/consultas";
import { numero } from "@/lib/formato";
import { ListaSecaderos } from "@/components/lista-secaderos";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Descargar · Secaderos" };
export const dynamic = "force-dynamic";

export default async function PaginaPaletizado() {
  await requerirRol("paletizado", "llenado_manual", "admin");

  // Los mas viejos primero: si el operario no busca por numero, el orden ya le
  // sugiere cual conviene sacar.
  const secos = (await secaderosConContenido(["seco"])).sort(
    (a, b) => a.estadoDesde.getTime() - b.estadoDesde.getTime(),
  );

  const totalPlacas = secos.reduce((a, s) => a + s.total, 0);

  return (
    <>
      <Titulo
        detalle={
          secos.length
            ? `${numero(totalPlacas)} placas esperando · los más viejos primero`
            : undefined
        }
      >
        Descargar
      </Titulo>

      <ListaSecaderos
        secaderos={secos}
        hrefBase="/paletizado"
        vacio={{
          titulo: "No hay secaderos secos",
          detalle: "Cuando horno saque alguno, va a aparecer acá.",
        }}
      />
    </>
  );
}

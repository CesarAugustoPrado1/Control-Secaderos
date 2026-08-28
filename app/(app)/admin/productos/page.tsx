import { tiposActivos, todosLosProductos } from "@/lib/consultas";
import { ListaProductos } from "./lista";

export const metadata = { title: "Modelos · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminProductos() {
  const [productos, tipos] = await Promise.all([
    todosLosProductos(),
    tiposActivos(),
  ]);

  return (
    <ListaProductos
      productos={productos}
      tipos={tipos.map((t) => ({ id: t.id, nombre: t.nombre }))}
    />
  );
}

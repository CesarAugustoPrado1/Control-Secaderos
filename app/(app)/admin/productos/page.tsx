import { todosLosProductos } from "@/lib/consultas";
import { ListaProductos } from "./lista";

export const metadata = { title: "Modelos · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminProductos() {
  const productos = await todosLosProductos();

  return (
    <ListaProductos
      productos={productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        tamano: p.tamano,
        activo: p.activo,
      }))}
    />
  );
}

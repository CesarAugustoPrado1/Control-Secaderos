import { todosLosTipos, usoDeTipos } from "@/lib/consultas";
import { ListaTipos } from "./lista";

export const metadata = { title: "Tipos · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminTipos() {
  const [tipos, uso] = await Promise.all([todosLosTipos(), usoDeTipos()]);

  return (
    <ListaTipos
      tipos={tipos.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        capacidad: t.capacidad,
        orden: t.orden,
        activo: t.activo,
        secaderos: uso.get(t.id)?.secaderos ?? 0,
        productos: uso.get(t.id)?.productos ?? 0,
      }))}
    />
  );
}

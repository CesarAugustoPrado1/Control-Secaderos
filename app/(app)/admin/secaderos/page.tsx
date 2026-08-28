import { tiposActivos, todosLosSecaderos } from "@/lib/consultas";
import { ListaSecaderosAdmin } from "./lista";

export const metadata = { title: "Secaderos · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminSecaderos() {
  const [secaderos, tipos] = await Promise.all([
    todosLosSecaderos(),
    tiposActivos(),
  ]);

  return (
    <ListaSecaderosAdmin
      secaderos={secaderos}
      tipos={tipos.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        capacidad: t.capacidad,
      }))}
    />
  );
}

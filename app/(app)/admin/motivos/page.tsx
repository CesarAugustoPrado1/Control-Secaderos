import { todosLosMotivos } from "@/lib/consultas";
import { ListaMotivos } from "./lista";

export const metadata = { title: "Motivos · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminMotivos() {
  const motivos = await todosLosMotivos();
  return <ListaMotivos motivos={motivos} />;
}

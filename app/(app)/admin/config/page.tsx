import { leerConfig } from "@/lib/consultas";
import { FormularioConfig } from "./formulario";

export const metadata = { title: "Parámetros · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminConfig() {
  const cfg = await leerConfig();
  return <FormularioConfig inicial={cfg} />;
}

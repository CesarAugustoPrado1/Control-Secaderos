import { leerFondo } from "@/lib/consultas";
import { SelectorFondo } from "./selector";

export const metadata = { title: "Apariencia · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaApariencia() {
  const fondo = await leerFondo();
  return <SelectorFondo actual={fondo} />;
}

import { requerirRol } from "@/lib/auth";
import { PantallaDescargar } from "@/components/pantalla-descargar";

export default async function PaginaDescargarAMano({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirRol("llenado_manual", "admin");
  const { id } = await params;
  return <PantallaDescargar id={id} volverA="/llenado-manual" />;
}

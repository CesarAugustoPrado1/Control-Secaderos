import { requerirRol } from "@/lib/auth";
import { PantallaCargar } from "@/components/pantalla-cargar";

export default async function PaginaLlenarAMano({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirRol("llenado_manual", "admin");
  const { id } = await params;
  return <PantallaCargar id={id} volverA="/llenado-manual" />;
}

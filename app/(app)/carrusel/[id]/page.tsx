import { requerirRol } from "@/lib/auth";
import { PantallaCargar } from "@/components/pantalla-cargar";

export default async function PaginaCargar({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirRol("carrusel", "admin");
  const { id } = await params;
  return <PantallaCargar id={id} volverA="/carrusel" conMoldes />;
}

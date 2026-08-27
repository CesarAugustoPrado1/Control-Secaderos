import { leerConfig, todosLosSecaderos } from "@/lib/consultas";
import { ListaSecaderos } from "./lista";

export const metadata = { title: "Secaderos · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminSecaderos() {
  const [secaderos, cfg] = await Promise.all([todosLosSecaderos(), leerConfig()]);

  return (
    <ListaSecaderos
      secaderos={secaderos.map((s) => ({
        id: s.id,
        numero: s.numero,
        tamano: s.tamano,
        estado: s.estado,
        activo: s.activo,
      }))}
      capacidades={{
        grande: cfg.capacidad_grande,
        chico: cfg.capacidad_chico,
      }}
    />
  );
}

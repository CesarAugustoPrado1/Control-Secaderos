import { requerirRol } from "@/lib/auth";
import { TabsAdmin } from "./tabs";

const SECCIONES = [
  { href: "/admin/secaderos", etiqueta: "Secaderos" },
  { href: "/admin/tipos", etiqueta: "Tipos" },
  { href: "/admin/productos", etiqueta: "Modelos" },
  { href: "/admin/usuarios", etiqueta: "Usuarios" },
  { href: "/admin/motivos", etiqueta: "Motivos" },
  { href: "/admin/config", etiqueta: "Parámetros" },
];

export default async function LayoutAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  await requerirRol("admin");

  return (
    <>
      <h1 className="mb-3 text-xl font-bold text-slate-900">Administración</h1>
      <TabsAdmin secciones={SECCIONES} />
      <div className="mt-5">{children}</div>
    </>
  );
}

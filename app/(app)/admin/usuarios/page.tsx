import { sesionActual } from "@/lib/auth";
import { todosLosUsuarios } from "@/lib/consultas";
import { db } from "@/lib/db";
import { usuarios as tablaUsuarios } from "@/lib/db/schema";
import { ListaUsuarios } from "./lista";

export const metadata = { title: "Usuarios · Administración" };
export const dynamic = "force-dynamic";

export default async function PaginaAdminUsuarios() {
  const sesion = await sesionActual();
  const [lista, bloqueos] = await Promise.all([
    todosLosUsuarios(),
    db
      .select({
        id: tablaUsuarios.id,
        bloqueadoHasta: tablaUsuarios.bloqueadoHasta,
      })
      .from(tablaUsuarios),
  ]);

  const ahora = Date.now();
  const bloqueados = new Set(
    bloqueos
      .filter((b) => b.bloqueadoHasta && b.bloqueadoHasta.getTime() > ahora)
      .map((b) => b.id),
  );

  return (
    <ListaUsuarios
      usuarios={lista.map((u) => ({
        id: u.id,
        usuario: u.usuario,
        nombre: u.nombre,
        rol: u.rol,
        activo: u.activo,
        bloqueado: bloqueados.has(u.id),
      }))}
      miId={sesion?.uid ?? 0}
    />
  );
}

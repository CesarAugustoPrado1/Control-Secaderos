"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function Paginador({
  pagina,
  paginas,
}: {
  pagina: number;
  paginas: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (paginas <= 1) return null;

  const enlace = (destino: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pagina", String(destino));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <nav className="mt-4 flex items-center justify-between gap-3">
      {pagina > 1 ? (
        <Link href={enlace(pagina - 1)} className="boton-secundario">
          ← Anteriores
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-slate-500 tabular-nums">
        Página {pagina} de {paginas}
      </span>

      {pagina < paginas ? (
        <Link href={enlace(pagina + 1)} className="boton-secundario">
          Siguientes →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

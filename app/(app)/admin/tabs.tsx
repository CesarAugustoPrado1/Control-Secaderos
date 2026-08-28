"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Pestañas de administracion.
 *
 * Se envuelven en varias filas en vez de scrollear en horizontal: con seis
 * secciones, en un celular las ultimas quedaban fuera de pantalla y no habia
 * nada que sugiriera que se podia deslizar. Ocupan un renglon mas, pero se ven
 * todas de entrada.
 */
export function TabsAdmin({
  secciones,
}: {
  secciones: { href: string; etiqueta: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav>
      <ul className="flex flex-wrap gap-1.5">
        {secciones.map((s) => {
          const activo = pathname.startsWith(s.href);
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                className={`block rounded-lg px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition ${
                  activo
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                }`}
              >
                {s.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

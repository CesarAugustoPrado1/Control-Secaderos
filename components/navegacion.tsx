"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ItemNav } from "@/lib/permisos";

const ICONOS: Record<string, string> = {
  grid: "▦",
  carrusel: "⟳",
  horno: "🔥",
  pallet: "📦",
  lista: "☰",
  grafico: "📈",
  config: "⚙",
};

function estaActivo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Barra inferior fija: es la navegacion de los celulares en planta. */
export function NavInferior({ items }: { items: ItemNav[] }) {
  const pathname = usePathname();
  if (items.length < 2) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
      <ul
        className="mx-auto grid max-w-2xl"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const activo = estaActivo(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] font-medium ${
                  activo ? "text-slate-900" : "text-slate-400"
                }`}
              >
                <span className="text-lg leading-none">
                  {ICONOS[item.icono] ?? "•"}
                </span>
                <span className="truncate">{item.etiqueta}</span>
                <span
                  className={`h-0.5 w-6 rounded-full ${activo ? "bg-slate-900" : "bg-transparent"}`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Menu lateral: el auditor y el admin trabajan desde la PC. */
export function NavLateral({ items }: { items: ItemNav[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 md:block">
      <ul className="sticky top-20 space-y-1">
        {items.map((item) => {
          const activo = estaActivo(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  activo
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span className="w-5 text-center text-base">
                  {ICONOS[item.icono] ?? "•"}
                </span>
                {item.etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

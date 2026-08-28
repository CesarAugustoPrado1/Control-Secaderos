import type { Rol } from "./db/schema";

/**
 * Prefijo de ruta -> roles habilitados. Se evalua por prefijo mas largo primero,
 * asi `/admin` puede ser mas restrictivo que `/`.
 *
 * Ojo: esto controla la NAVEGACION. Cada server action revalida permisos por su
 * cuenta, porque el middleware no es una frontera de seguridad suficiente.
 *
 * Sobre llenado manual: carga y descarga cualquier tipo de secadero, igual que
 * carrusel y paletizado. El piso de planta es flexible -las guardas las puede
 * sacar quien las cargo o cualquier otro-, asi que no se restringe por tipo:
 * lo que importa es que cada movimiento quede atribuido a quien lo hizo.
 */
const REGLAS: Array<{ prefijo: string; roles: Rol[] }> = [
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/carrusel", roles: ["carrusel", "llenado_manual", "admin"] },
  { prefijo: "/horno", roles: ["horno", "admin"] },
  { prefijo: "/paletizado", roles: ["paletizado", "llenado_manual", "admin"] },
  { prefijo: "/movimientos", roles: ["admin", "auditor"] },
  { prefijo: "/estadisticas", roles: ["admin", "auditor"] },
  {
    prefijo: "/tablero",
    roles: ["admin", "auditor", "carrusel", "llenado_manual", "horno", "paletizado"],
  },
];

export function puedeVer(rol: Rol, ruta: string): boolean {
  const regla = REGLAS.filter((r) => ruta.startsWith(r.prefijo)).sort(
    (a, b) => b.prefijo.length - a.prefijo.length,
  )[0];
  if (!regla) return true;
  return regla.roles.includes(rol);
}

/** Adonde mandamos a cada rol despues de loguearse. */
export function rutaInicial(rol: Rol): string {
  switch (rol) {
    case "carrusel":
    case "llenado_manual":
      return "/carrusel";
    case "horno":
      return "/horno";
    case "paletizado":
      return "/paletizado";
    default:
      return "/tablero";
  }
}

/** El auditor ve todo pero no escribe nada, en ninguna pantalla. */
export function esSoloLectura(rol: Rol): boolean {
  return rol === "auditor";
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administrador",
  carrusel: "Carrusel",
  llenado_manual: "Llenado manual",
  horno: "Horno",
  paletizado: "Paletizado",
  auditor: "Auditor",
};

export const ROLES: Rol[] = [
  "admin",
  "carrusel",
  "llenado_manual",
  "horno",
  "paletizado",
  "auditor",
];

export type ItemNav = { href: string; etiqueta: string; icono: string };

const NAV: ItemNav[] = [
  { href: "/tablero", etiqueta: "Tablero", icono: "grid" },
  { href: "/carrusel", etiqueta: "Cargar", icono: "carrusel" },
  { href: "/horno", etiqueta: "Horno", icono: "horno" },
  { href: "/paletizado", etiqueta: "Descargar", icono: "pallet" },
  { href: "/movimientos", etiqueta: "Movimientos", icono: "lista" },
  { href: "/estadisticas", etiqueta: "Estadísticas", icono: "grafico" },
  { href: "/admin", etiqueta: "Administración", icono: "config" },
];

export function navParaRol(rol: Rol): ItemNav[] {
  return NAV.filter((item) => puedeVer(rol, item.href));
}

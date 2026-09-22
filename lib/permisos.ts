import type { Rol } from "./db/schema";

/**
 * Prefijo de ruta -> roles habilitados. Se evalua por prefijo mas largo primero,
 * asi `/admin` puede ser mas restrictivo que `/`.
 *
 * Ojo: esto controla la NAVEGACION. Cada server action revalida permisos por su
 * cuenta, porque el middleware no es una frontera de seguridad suficiente.
 *
 * Sobre llenado manual: es el puesto de las guardas, y hace las DOS puntas del
 * circuito -llenar el secadero y despues descargarlo- en una sola pantalla,
 * porque es la misma persona. Por eso tiene ruta propia y no entra ni a
 * carrusel ni a paletizado: el punto de separarlo fue justamente que cada
 * pantalla muestre un solo puesto.
 *
 * Lo que se separa es la NAVEGACION, no el permiso de mover un secadero. Las
 * server actions de carga y descarga no miran el tipo: el piso de planta es
 * flexible y una guarda la puede sacar quien la cargo o cualquier otro. Lo que
 * importa es que cada movimiento quede atribuido a quien lo hizo.
 */
const REGLAS: Array<{ prefijo: string; roles: Rol[] }> = [
  { prefijo: "/admin", roles: ["admin"] },
  { prefijo: "/carrusel", roles: ["carrusel", "admin"] },
  { prefijo: "/llenado-manual", roles: ["llenado_manual", "admin"] },
  { prefijo: "/horno", roles: ["horno", "admin"] },
  { prefijo: "/paletizado", roles: ["paletizado", "admin"] },
  // Corregir un movimiento propio. Entran todos los que operan; si ESTE
  // movimiento lo puede tocar lo decide la regla de lib/correccion.ts, del
  // lado del servidor. No esta en la barra: se llega desde la lista del dia.
  {
    prefijo: "/corregir",
    roles: ["carrusel", "llenado_manual", "horno", "paletizado", "admin"],
  },
  { prefijo: "/produccion", roles: ["administrativo", "admin", "auditor"] },
  { prefijo: "/movimientos", roles: ["admin", "auditor"] },
  { prefijo: "/estadisticas", roles: ["admin", "auditor"] },
  {
    prefijo: "/tablero",
    roles: [
      "admin",
      "auditor",
      "carrusel",
      "llenado_manual",
      "horno",
      "paletizado",
      "administrativo",
    ],
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
      return "/carrusel";
    case "llenado_manual":
      return "/llenado-manual";
    case "horno":
      return "/horno";
    case "paletizado":
      return "/paletizado";
    case "administrativo":
      return "/produccion";
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
  administrativo: "Administrativo de producción",
  auditor: "Auditor",
};

export const ROLES: Rol[] = [
  "admin",
  "carrusel",
  "llenado_manual",
  "horno",
  "paletizado",
  "administrativo",
  "auditor",
];

export type ItemNav = { href: string; etiqueta: string; icono: string };

const NAV: ItemNav[] = [
  { href: "/tablero", etiqueta: "Tablero", icono: "grid" },
  { href: "/carrusel", etiqueta: "Cargar", icono: "carrusel" },
  { href: "/horno", etiqueta: "Horno", icono: "horno" },
  { href: "/paletizado", etiqueta: "Descargar", icono: "pallet" },
  // Despues de las dos del circuito principal y no en el medio: para el rol de
  // llenado manual el orden da igual -ve dos items- y asi el admin conserva en
  // la barra del celular las cuatro de siempre, sin que Descargar se le caiga
  // al cajon de "Más".
  { href: "/llenado-manual", etiqueta: "Llenado manual", icono: "mano" },
  { href: "/produccion", etiqueta: "Producción", icono: "resumen" },
  { href: "/movimientos", etiqueta: "Movimientos", icono: "lista" },
  { href: "/estadisticas", etiqueta: "Estadísticas", icono: "grafico" },
  { href: "/admin", etiqueta: "Administración", icono: "config" },
];

export function navParaRol(rol: Rol): ItemNav[] {
  return NAV.filter((item) => puedeVer(rol, item.href));
}

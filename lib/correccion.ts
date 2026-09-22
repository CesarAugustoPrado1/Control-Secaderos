import type { Rol, TipoMovimiento } from "./db/schema";

/**
 * Correccion de movimientos por el mismo operario. Modulo puro, sin acceso a
 * base: lo usan el servidor para decidir y validar, y las pantallas para
 * explicar. Todo lo que hay aca se puede probar sin levantar nada.
 *
 * La regla, tal como se le explica al piso:
 *
 *   Cada uno puede corregir lo ultimo que hizo con un secadero, mientras nadie
 *   lo haya tocado despues, y en el mismo dia.
 *
 * - "Lo que hizo": solo el autor. Si dos operarios comparten turno y uno
 *   corrige la carga del otro, la responsabilidad se diluye.
 * - "Lo ultimo, mientras nadie lo toco despues": la ventana se cierra sola
 *   cuando el siguiente puesto trabaja encima. Si el hornero ya metio el
 *   secadero, registro roturas sobre ese contenido; cambiar la carga despues
 *   es reescribir el trabajo de otro.
 * - "En el mismo dia": un secadero puede quedar humedo hasta mañana, y cambiar
 *   los numeros de ayer despues de que el administrativo leyo el resumen es
 *   justo lo que no hay que permitir.
 *
 * El admin no tiene las dos primeras restricciones de tiempo ni de autoria:
 * puede corregir el movimiento de cualquiera en cualquier dia. Lo que no puede
 * saltear nadie es "mientras nadie lo toco despues": eso no es un permiso, es
 * lo que hace que deshacer un paso tenga sentido. Si el secadero ya siguio
 * viaje, lo que queda es la correccion forzada de Administracion.
 */

/**
 * Los movimientos que hace un puesto del piso. `correccion` queda afuera: es la
 * valvula de escape del admin y se arregla con otra correccion del admin.
 * `ajuste` ya no se genera.
 */
export const TIPOS_CORREGIBLES = [
  "carga",
  "entrada_horno",
  "salida_horno",
  "secado_natural",
  "descarga",
  "devolucion_horno",
] as const satisfies readonly TipoMovimiento[];

export type TipoCorregible = (typeof TIPOS_CORREGIBLES)[number];

export function esCorregible(tipo: TipoMovimiento): tipo is TipoCorregible {
  return (TIPOS_CORREGIBLES as readonly TipoMovimiento[]).includes(tipo);
}

/**
 * Que se corrige de cada movimiento.
 *
 * En la carga, lo que se eligio: que productos y cuantas placas. En todas las
 * demas, las roturas: el contenido de entrada vino del paso anterior -que es
 * de otro- y lo unico que decidio este operario es que se rompio.
 */
export function queSeCorrige(tipo: TipoCorregible): "carga" | "roturas" {
  return tipo === "carga" ? "carga" : "roturas";
}

/**
 * Como queda el secadero si se anula el movimiento, en palabras del piso. Se
 * muestra antes de confirmar: anular no es borrar un renglon, es mover un
 * secadero, y el operario tiene que saber a donde.
 */
export const EFECTO_ANULAR: Record<TipoCorregible, string> = {
  carga: "vuelve a quedar vacío, como si no se hubiera cargado",
  entrada_horno: "sale del horno y vuelve a los húmedos",
  salida_horno: "vuelve a figurar adentro del horno",
  secado_natural: "vuelve a los húmedos, sin secar",
  descarga: "vuelve a figurar seco, con todas sus placas",
  devolucion_horno: "vuelve a figurar seco, como antes de devolverlo",
};

/* -------------------------------------------------------------------------- */
/* Quien y cuando                                                             */
/* -------------------------------------------------------------------------- */

export type DatosParaCorregir = {
  tipo: TipoMovimiento;
  usuarioId: number;
  /** Fecha argentina del movimiento, `YYYY-MM-DD`. */
  fecha: string;
  anulado: boolean;
  /** Si es el ultimo movimiento vigente de su secadero. */
  esUltimo: boolean;
};

export type Quien = { uid: number; rol: Rol };

/**
 * Si `quien` puede corregir el movimiento, y si no, por que.
 *
 * Devuelve el motivo en palabras del piso porque se muestra tal cual: "no
 * podes" sin decir por que es lo que hace que el operario deje de intentarlo.
 */
export function puedeCorregir(
  m: DatosParaCorregir,
  quien: Quien,
  hoy: string,
): { ok: true } | { ok: false; motivo: string } {
  if (!esCorregible(m.tipo)) {
    return {
      ok: false,
      motivo: "Este movimiento no se corrige desde acá.",
    };
  }
  if (m.anulado) {
    return { ok: false, motivo: "Este movimiento ya fue anulado." };
  }
  if (quien.rol === "auditor" || quien.rol === "administrativo") {
    return { ok: false, motivo: "Tu usuario no puede corregir movimientos." };
  }
  if (!m.esUltimo) {
    return {
      ok: false,
      motivo:
        "El secadero ya tuvo otro movimiento después de este. " +
        (quien.rol === "admin"
          ? "Para arreglarlo, usá la corrección de Administración → Secaderos."
          : "Pedile al administrador que lo corrija."),
    };
  }
  if (quien.rol === "admin") return { ok: true };

  if (m.usuarioId !== quien.uid) {
    return {
      ok: false,
      motivo: "Solo lo puede corregir quien lo hizo, o el administrador.",
    };
  }
  if (m.fecha !== hoy) {
    return {
      ok: false,
      motivo:
        "Solo se corrige en el mismo día. Pedile al administrador que lo corrija.",
    };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Reconstruccion                                                             */
/* -------------------------------------------------------------------------- */

export type LineaGuardada = {
  productoId: number;
  cantidad: number;
  desperdicio: number;
  motivoId: number | null;
};

/**
 * Lo que habia adentro del secadero justo antes del movimiento.
 *
 * Sale de las lineas del propio movimiento, sin mirar nada mas, gracias a la
 * convencion de `movimiento_lineas`: `cantidad` es lo que siguio viaje y
 * `desperdicio` lo que se rompio EN este paso. Lo que habia antes es
 * exactamente la suma de las dos, producto por producto. Si un modelo se rompio
 * por dos motivos, el motivo extra va en una linea con cantidad 0: la suma
 * sigue dando.
 *
 * La carga es la excepcion: parte de un secadero vacio.
 */
export function contenidoAntes(
  tipo: TipoCorregible,
  lineas: LineaGuardada[],
): Map<number, number> {
  const antes = new Map<number, number>();
  if (tipo === "carga") return antes;
  for (const l of lineas) {
    antes.set(
      l.productoId,
      (antes.get(l.productoId) ?? 0) + l.cantidad + l.desperdicio,
    );
  }
  for (const [id, n] of antes) if (n === 0) antes.delete(id);
  return antes;
}

/** Lo que se cargo, para precargar el formulario de correccion de una carga. */
export function cantidadesCargadas(lineas: LineaGuardada[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of lineas) {
    if (l.cantidad > 0) m.set(l.productoId, (m.get(l.productoId) ?? 0) + l.cantidad);
  }
  return m;
}

/** Las roturas que se registraron, para precargar el editor de roturas. */
export function roturasRegistradas(
  lineas: LineaGuardada[],
): { productoId: number; cantidad: number; motivoId: number }[] {
  return lineas
    .filter((l) => l.desperdicio > 0 && l.motivoId !== null)
    .map((l) => ({
      productoId: l.productoId,
      cantidad: l.desperdicio,
      motivoId: l.motivoId!,
    }));
}

/**
 * Desde cuando estaba el secadero en el estado anterior.
 *
 * `duracion_min` guarda cuanto estuvo en el estado de partida antes de este
 * movimiento, asi que el inicio de ese tramo es la hora del movimiento menos
 * esa duracion. Queda redondeado al minuto, porque asi se guardo: un error de
 * treinta segundos como mucho sobre tramos de horas. Sin duracion -no deberia
 * pasar en un movimiento del piso- se toma la hora del propio movimiento.
 */
export function inicioDelEstadoAnterior(
  creadoEn: Date,
  duracionMin: number | null,
): Date {
  if (duracionMin === null) return creadoEn;
  return new Date(creadoEn.getTime() - duracionMin * 60_000);
}


/* -------------------------------------------------------------------------- */
/* Comparaciones                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Si dos cargas son la misma. Una correccion que no cambia nada no se guarda:
 * dejaria un renglon anulado y su gemelo en el historial, y un error que no
 * existio en la cuenta de errores del puesto.
 */
export function mismaCarga(
  a: Map<number, number>,
  b: Map<number, number>,
): boolean {
  const limpia = (m: Map<number, number>) =>
    [...m.entries()].filter(([, n]) => n > 0).sort(([x], [y]) => x - y);
  return JSON.stringify(limpia(a)) === JSON.stringify(limpia(b));
}

/** Lo mismo para las roturas: mismo modelo, mismo motivo, misma cantidad. */
export function mismasRoturas(
  a: { productoId: number; cantidad: number; motivoId: number }[],
  b: { productoId: number; cantidad: number; motivoId: number }[],
): boolean {
  const normal = (lista: typeof a) => {
    const suma = new Map<string, number>();
    for (const r of lista) {
      if (r.cantidad <= 0) continue;
      const clave = `${r.productoId}:${r.motivoId}`;
      suma.set(clave, (suma.get(clave) ?? 0) + r.cantidad);
    }
    return [...suma.entries()].sort(([x], [y]) => x.localeCompare(y));
  };
  return JSON.stringify(normal(a)) === JSON.stringify(normal(b));
}

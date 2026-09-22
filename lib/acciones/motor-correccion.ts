import "server-only";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import {
  movimientoLineas,
  movimientos,
  secaderoContenido,
  secaderos,
  type Movimiento,
} from "../db/schema";
import {
  contenidoAntes,
  inicioDelEstadoAnterior,
  puedeCorregir,
  type LineaGuardada,
  type TipoCorregible,
} from "../correccion";
import { fechaLocal } from "../rangos";
import type { Sesion } from "../session";
import { fallar } from "./comun";
import {
  bloquearSecaderos,
  type Reemplazo,
  type SecaderoConTipo,
} from "./motor";

type Tx = Parameters<
  Parameters<typeof import("../db").db.transaction>[0]
>[0];

/**
 * El ultimo movimiento vigente de un secadero: lo ultimo que le paso y sigue
 * valiendo.
 *
 * Se ordena por id y no por hora a proposito. Un movimiento corregido lleva la
 * hora del original -la carga paso a las 10:14 aunque se corrigiera a las
 * 10:42-, asi que por hora podria quedar "antes" de otro que en realidad paso
 * despues. Los ids en cambio siguen el orden en que se escribieron, y un
 * reemplazo solo se escribe cuando el original era el ultimo: no puede haber
 * nada en el medio.
 *
 * Solo es estable con el secadero bloqueado: todo movimiento bloquea su
 * secadero antes de escribir, asi que con el lock tomado nadie puede agregar
 * uno entre esta lectura y la escritura.
 */
async function ultimoVigente(tx: Tx, secaderoId: number): Promise<number | null> {
  const [fila] = await tx
    .select({ id: max(movimientos.id) })
    .from(movimientos)
    .where(
      and(eq(movimientos.secaderoId, secaderoId), isNull(movimientos.anuladoEn)),
    );
  return fila?.id ?? null;
}

export type Deshecho = {
  /** El movimiento que se anulo, tal como estaba. */
  original: Movimiento & { tipo: TipoCorregible };
  lineas: LineaGuardada[];
  /** El secadero bloqueado, con el estado y el reloj ya restaurados. */
  secadero: SecaderoConTipo;
  /** Lo que un reemplazo tiene que heredar del original. */
  reemplazo: Reemplazo;
};

/**
 * Anula un movimiento y deja el secadero como estaba antes de el.
 *
 * Es la mitad comun de anular y corregir: corregir es esto mas rehacer el mismo
 * movimiento con los datos buenos, adentro de la misma transaccion. Visto desde
 * afuera no hay un instante en que el secadero este restaurado.
 *
 * Valida la regla completa del lado del servidor, aunque la pantalla ya la haya
 * chequeado: la pantalla puede estar abierta desde hace un rato, y en ese rato
 * el hornero pudo haber metido el secadero.
 */
export async function deshacer(
  tx: Tx,
  sesion: Sesion,
  movimientoId: number,
  motivo: string,
): Promise<Deshecho> {
  const [original] = await tx
    .select()
    .from(movimientos)
    .where(eq(movimientos.id, movimientoId))
    .limit(1);
  if (!original) fallar("Ese movimiento ya no existe. Actualizá la pantalla.");

  // Primero el lock, despues la regla: con el secadero bloqueado nadie puede
  // moverlo mientras decidimos si este sigue siendo su ultimo movimiento.
  const [secadero] = await bloquearSecaderos(tx, [original.secaderoId]);
  const ultimo = await ultimoVigente(tx, original.secaderoId);

  const permiso = puedeCorregir(
    {
      tipo: original.tipo,
      usuarioId: original.usuarioId,
      fecha: fechaLocal(original.creadoEn),
      anulado: original.anuladoEn !== null,
      esUltimo: ultimo === original.id,
    },
    { uid: sesion.uid, rol: sesion.rol },
    fechaLocal(),
  );
  if (!permiso.ok) fallar(permiso.motivo);

  // No deberia pasar nunca: si es el ultimo movimiento vigente, el secadero
  // esta donde ese movimiento lo dejo. Si no coincide, algo lo movio por
  // afuera del motor y deshacer a ciegas empeoraria las cosas.
  if (secadero.estado !== original.estadoHasta) {
    fallar(
      `El secadero ${secadero.numero} no está donde este movimiento lo dejó. ` +
        "Pedile al administrador que lo revise.",
    );
  }
  if (!secadero.activo) {
    fallar(`El secadero ${secadero.numero} está dado de baja.`);
  }

  const lineas = await tx
    .select({
      productoId: movimientoLineas.productoId,
      cantidad: movimientoLineas.cantidad,
      desperdicio: movimientoLineas.desperdicio,
      motivoId: movimientoLineas.motivoId,
    })
    .from(movimientoLineas)
    .where(eq(movimientoLineas.movimientoId, original.id))
    .orderBy(asc(movimientoLineas.id));

  // `puedeCorregir` ya descarto los tipos que no son del piso.
  const tipo = original.tipo as TipoCorregible;

  await tx
    .update(movimientos)
    .set({
      anuladoEn: new Date(),
      anuladoPorId: sesion.uid,
      anuladoPorNombre: sesion.nombre,
      motivoAnulacion: motivo,
    })
    .where(eq(movimientos.id, original.id));

  // El secadero vuelve al estado del que partio, con su reloj y su contenido.
  const estado = original.estadoDesde;
  const estadoDesde = inicioDelEstadoAnterior(
    original.creadoEn,
    original.duracionMin,
  );
  const antes = contenidoAntes(tipo, lineas);

  await tx
    .delete(secaderoContenido)
    .where(eq(secaderoContenido.secaderoId, secadero.id));
  if (antes.size > 0) {
    await tx.insert(secaderoContenido).values(
      [...antes.entries()].map(([productoId, cantidad]) => ({
        secaderoId: secadero.id,
        productoId,
        cantidad,
      })),
    );
  }
  await tx
    .update(secaderos)
    .set({ estado, estadoDesde })
    .where(eq(secaderos.id, secadero.id));

  return {
    original: { ...original, tipo },
    lineas,
    secadero: { ...secadero, estado, estadoDesde },
    reemplazo: {
      creadoEn: original.creadoEn,
      autor: { uid: original.usuarioId, nombre: original.usuarioNombre },
      reemplazaA: original.id,
    },
  };
}

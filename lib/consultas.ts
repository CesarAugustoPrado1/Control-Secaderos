import "server-only";
import { and, asc, desc, eq, inArray, gte, lte, sql } from "drizzle-orm";
import { db } from "./db";
import {
  CONFIG_POR_DEFECTO,
  type ClaveConfig,
  type Configuracion,
} from "./configuracion";
import {
  config,
  motivosDesperdicio,
  movimientoLineas,
  movimientos,
  productos,
  secaderoContenido,
  secaderos,
  usuarios,
  type Estado,
  type Tamano,
} from "./db/schema";

/**
 * Lee los parametros de la base y completa con los valores por defecto lo que
 * falte, asi el sistema arranca funcionando aunque la tabla este vacia.
 */
export async function leerConfig(): Promise<Configuracion> {
  const filas = await db.select().from(config);
  const resultado = { ...CONFIG_POR_DEFECTO } as Configuracion;
  for (const fila of filas) {
    if (fila.clave in resultado) {
      const n = Number(fila.valor);
      if (Number.isFinite(n) && n > 0) resultado[fila.clave as ClaveConfig] = n;
    }
  }
  return resultado;
}

export type LineaContenido = {
  productoId: number;
  nombre: string;
  cantidad: number;
};

export type SecaderoVista = {
  id: number;
  numero: number;
  tamano: Tamano;
  estado: Estado;
  activo: boolean;
  estadoDesde: Date;
  contenido: LineaContenido[];
  total: number;
};

/**
 * Secaderos activos con su contenido vivo, ordenados por numero.
 * Es la consulta que alimenta casi todas las pantallas, asi que resuelve el
 * contenido en una sola query extra en vez de una por secadero.
 */
export async function secaderosConContenido(
  estados?: Estado[],
): Promise<SecaderoVista[]> {
  const filtros = [eq(secaderos.activo, true)];
  if (estados?.length) filtros.push(inArray(secaderos.estado, estados));

  const filas = await db
    .select()
    .from(secaderos)
    .where(and(...filtros))
    .orderBy(asc(secaderos.numero));

  if (filas.length === 0) return [];

  const contenidos = await db
    .select({
      secaderoId: secaderoContenido.secaderoId,
      productoId: secaderoContenido.productoId,
      cantidad: secaderoContenido.cantidad,
      nombre: productos.nombre,
    })
    .from(secaderoContenido)
    .innerJoin(productos, eq(productos.id, secaderoContenido.productoId))
    .where(
      inArray(
        secaderoContenido.secaderoId,
        filas.map((f) => f.id),
      ),
    )
    .orderBy(asc(productos.nombre));

  const porSecadero = new Map<number, LineaContenido[]>();
  for (const c of contenidos) {
    const lista = porSecadero.get(c.secaderoId) ?? [];
    lista.push({
      productoId: c.productoId,
      nombre: c.nombre,
      cantidad: c.cantidad,
    });
    porSecadero.set(c.secaderoId, lista);
  }

  return filas.map((f) => {
    const contenido = porSecadero.get(f.id) ?? [];
    return {
      id: f.id,
      numero: f.numero,
      tamano: f.tamano,
      estado: f.estado,
      activo: f.activo,
      estadoDesde: f.estadoDesde,
      contenido,
      total: contenido.reduce((a, c) => a + c.cantidad, 0),
    };
  });
}

export async function secaderoPorId(id: number): Promise<SecaderoVista | null> {
  const [fila] = await db
    .select()
    .from(secaderos)
    .where(eq(secaderos.id, id))
    .limit(1);
  if (!fila) return null;

  const contenido = await db
    .select({
      productoId: secaderoContenido.productoId,
      cantidad: secaderoContenido.cantidad,
      nombre: productos.nombre,
    })
    .from(secaderoContenido)
    .innerJoin(productos, eq(productos.id, secaderoContenido.productoId))
    .where(eq(secaderoContenido.secaderoId, id))
    .orderBy(asc(productos.nombre));

  return {
    id: fila.id,
    numero: fila.numero,
    tamano: fila.tamano,
    estado: fila.estado,
    activo: fila.activo,
    estadoDesde: fila.estadoDesde,
    contenido,
    total: contenido.reduce((a, c) => a + c.cantidad, 0),
  };
}

export async function productosActivos(tamano?: Tamano) {
  const filtros = [eq(productos.activo, true)];
  if (tamano) filtros.push(eq(productos.tamano, tamano));
  return db
    .select()
    .from(productos)
    .where(and(...filtros))
    .orderBy(asc(productos.nombre));
}

export async function todosLosProductos() {
  return db
    .select()
    .from(productos)
    .orderBy(asc(productos.tamano), asc(productos.nombre));
}

export async function motivosActivos() {
  return db
    .select()
    .from(motivosDesperdicio)
    .where(eq(motivosDesperdicio.activo, true))
    .orderBy(asc(motivosDesperdicio.nombre));
}

export async function todosLosMotivos() {
  return db
    .select()
    .from(motivosDesperdicio)
    .orderBy(asc(motivosDesperdicio.nombre));
}

export async function todosLosSecaderos() {
  return db.select().from(secaderos).orderBy(asc(secaderos.numero));
}

export async function todosLosUsuarios() {
  return db
    .select({
      id: usuarios.id,
      usuario: usuarios.usuario,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      activo: usuarios.activo,
      creadoEn: usuarios.creadoEn,
    })
    .from(usuarios)
    .orderBy(asc(usuarios.nombre));
}

/** Conteo de secaderos activos por estado, para los contadores del tablero. */
export async function conteoPorEstado(): Promise<Record<Estado, number>> {
  const filas = await db
    .select({ estado: secaderos.estado, n: sql<number>`count(*)::int` })
    .from(secaderos)
    .where(eq(secaderos.activo, true))
    .groupBy(secaderos.estado);

  const base: Record<Estado, number> = { vacio: 0, humedo: 0, horno: 0, seco: 0 };
  for (const f of filas) base[f.estado] = f.n;
  return base;
}

export type MovimientoVista = Awaited<
  ReturnType<typeof listarMovimientos>
>["items"][number];

export type FiltroMovimientos = {
  secaderoId?: number;
  usuarioId?: number;
  tipo?: string;
  desde?: Date;
  hasta?: Date;
  pagina?: number;
  porPagina?: number;
};

export async function listarMovimientos(filtro: FiltroMovimientos = {}) {
  const porPagina = filtro.porPagina ?? 50;
  const pagina = Math.max(1, filtro.pagina ?? 1);

  const condiciones = [];
  if (filtro.secaderoId)
    condiciones.push(eq(movimientos.secaderoId, filtro.secaderoId));
  if (filtro.usuarioId)
    condiciones.push(eq(movimientos.usuarioId, filtro.usuarioId));
  if (filtro.tipo)
    condiciones.push(
      eq(movimientos.tipo, filtro.tipo as (typeof movimientos.tipo.enumValues)[number]),
    );
  if (filtro.desde) condiciones.push(gte(movimientos.creadoEn, filtro.desde));
  if (filtro.hasta) condiciones.push(lte(movimientos.creadoEn, filtro.hasta));
  const where = condiciones.length ? and(...condiciones) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(movimientos)
    .where(where);

  const filas = await db
    .select()
    .from(movimientos)
    .where(where)
    .orderBy(desc(movimientos.creadoEn), desc(movimientos.id))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina);

  const lineas = filas.length
    ? await db
        .select()
        .from(movimientoLineas)
        .where(
          inArray(
            movimientoLineas.movimientoId,
            filas.map((f) => f.id),
          ),
        )
        .orderBy(asc(movimientoLineas.productoNombre))
    : [];

  const porMovimiento = new Map<number, typeof lineas>();
  for (const l of lineas) {
    const lista = porMovimiento.get(l.movimientoId) ?? [];
    lista.push(l);
    porMovimiento.set(l.movimientoId, lista);
  }

  return {
    total,
    pagina,
    porPagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
    items: filas.map((m) => ({
      ...m,
      lineas: porMovimiento.get(m.id) ?? [],
    })),
  };
}

/** Ultimos movimientos de un secadero, para el detalle. */
export async function historialDeSecadero(secaderoId: number, limite = 20) {
  const { items } = await listarMovimientos({
    secaderoId,
    porPagina: limite,
  });
  return items;
}

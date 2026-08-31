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
  tipos,
  usuarios,
  type Estado,
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
  tipoId: number;
  tipoNombre: string;
  capacidad: number;
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
    .select({
      id: secaderos.id,
      numero: secaderos.numero,
      tipoId: secaderos.tipoId,
      tipoNombre: tipos.nombre,
      capacidad: tipos.capacidad,
      estado: secaderos.estado,
      activo: secaderos.activo,
      estadoDesde: secaderos.estadoDesde,
    })
    .from(secaderos)
    .innerJoin(tipos, eq(tipos.id, secaderos.tipoId))
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
      ...f,
      contenido,
      total: contenido.reduce((a, c) => a + c.cantidad, 0),
    };
  });
}

export async function secaderoPorId(id: number): Promise<SecaderoVista | null> {
  const [fila] = await db
    .select({
      id: secaderos.id,
      numero: secaderos.numero,
      tipoId: secaderos.tipoId,
      tipoNombre: tipos.nombre,
      capacidad: tipos.capacidad,
      estado: secaderos.estado,
      activo: secaderos.activo,
      estadoDesde: secaderos.estadoDesde,
    })
    .from(secaderos)
    .innerJoin(tipos, eq(tipos.id, secaderos.tipoId))
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
    ...fila,
    contenido,
    total: contenido.reduce((a, c) => a + c.cantidad, 0),
  };
}

export async function productosActivos(tipoId?: number) {
  const filtros = [eq(productos.activo, true)];
  if (tipoId) filtros.push(eq(productos.tipoId, tipoId));
  return db
    .select()
    .from(productos)
    .where(and(...filtros))
    .orderBy(asc(productos.nombre));
}

export async function todosLosProductos() {
  return db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      tipoId: productos.tipoId,
      tipoNombre: tipos.nombre,
      activo: productos.activo,
    })
    .from(productos)
    .innerJoin(tipos, eq(tipos.id, productos.tipoId))
    .orderBy(asc(tipos.orden), asc(tipos.nombre), asc(productos.nombre));
}

export async function tiposActivos() {
  return db
    .select()
    .from(tipos)
    .where(eq(tipos.activo, true))
    .orderBy(asc(tipos.orden), asc(tipos.nombre));
}

export async function todosLosTipos() {
  return db.select().from(tipos).orderBy(asc(tipos.orden), asc(tipos.nombre));
}

/** Cuantos secaderos y modelos usa cada tipo, para avisar antes de desactivarlo. */
export async function usoDeTipos() {
  const [porSecadero, porProducto] = await Promise.all([
    db
      .select({ tipoId: secaderos.tipoId, n: sql<number>`count(*)::int` })
      .from(secaderos)
      .groupBy(secaderos.tipoId),
    db
      .select({ tipoId: productos.tipoId, n: sql<number>`count(*)::int` })
      .from(productos)
      .groupBy(productos.tipoId),
  ]);

  const uso = new Map<number, { secaderos: number; productos: number }>();
  const asegurar = (id: number) =>
    uso.get(id) ?? uso.set(id, { secaderos: 0, productos: 0 }).get(id)!;
  for (const f of porSecadero) asegurar(f.tipoId).secaderos = f.n;
  for (const f of porProducto) asegurar(f.tipoId).productos = f.n;
  return uso;
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
  return db
    .select({
      id: secaderos.id,
      numero: secaderos.numero,
      tipoId: secaderos.tipoId,
      tipoNombre: tipos.nombre,
      capacidad: tipos.capacidad,
      estado: secaderos.estado,
      activo: secaderos.activo,
    })
    .from(secaderos)
    .innerJoin(tipos, eq(tipos.id, secaderos.tipoId))
    .orderBy(asc(secaderos.numero));
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

/**
 * Secaderos en reproceso: los que no secaron bien y volvieron a la cola.
 *
 * La marca dura desde la devolucion hasta que el secadero se descargue y se
 * vuelva a cargar, no solo mientras espera. Eso importa porque el hornero
 * necesita saber que ese secadero es un rehorneado TAMBIEN cuando ya esta
 * adentro: lo ubica donde pueda sacarlo rapido, porque si se pasa se quema.
 *
 * Se resuelve preguntando si hubo una devolucion posterior a la ultima carga.
 * Como los ids son seriales, comparar ids alcanza para ordenar en el tiempo.
 */
export async function secaderosEnReproceso(): Promise<Set<number>> {
  const filas = await db.execute<{ secadero_id: number }>(sql`
    select d.secadero_id
    from movimientos d
    where d.tipo = 'devolucion_horno'
      and d.id > coalesce((
        select max(c.id) from movimientos c
        where c.secadero_id = d.secadero_id and c.tipo = 'carga'
      ), 0)
    group by d.secadero_id
  `);
  return new Set([...filas].map((f) => Number(f.secadero_id)));
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
  /**
   * `desc` (por defecto) para el historial, donde interesa lo ultimo que paso.
   * `asc` para la actividad del dia del operario, que se lee en el orden en que
   * fueron saliendo del carrusel: primero el primero.
   */
  orden?: "asc" | "desc";
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

  const ordenar =
    filtro.orden === "asc"
      ? [asc(movimientos.creadoEn), asc(movimientos.id)]
      : [desc(movimientos.creadoEn), desc(movimientos.id)];

  const filas = await db
    .select()
    .from(movimientos)
    .where(where)
    .orderBy(...ordenar)
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

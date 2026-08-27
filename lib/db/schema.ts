import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const rolEnum = pgEnum("rol", [
  "admin",
  "carrusel",
  "horno",
  "paletizado",
  "auditor",
]);

export const tamanoEnum = pgEnum("tamano", ["grande", "chico"]);

export const estadoEnum = pgEnum("estado_secadero", [
  "vacio",
  "humedo",
  "horno",
  "seco",
]);

/**
 * Los tipos de movimiento describen QUE paso, no solo la transicion de estado.
 * `ajuste` no cambia de estado: corrige cantidades o modelos de una carga viva.
 * `correccion` es la valvula de escape del admin para arreglar un error operativo.
 */
export const tipoMovimientoEnum = pgEnum("tipo_movimiento", [
  "carga",
  "ajuste",
  "entrada_horno",
  "salida_horno",
  "descarga",
  "correccion",
]);

/* -------------------------------------------------------------------------- */
/* Tablas                                                                     */
/* -------------------------------------------------------------------------- */

export const usuarios = pgTable(
  "usuarios",
  {
    id: serial("id").primaryKey(),
    usuario: text("usuario").notNull(),
    nombre: text("nombre").notNull(),
    pinHash: text("pin_hash").notNull(),
    rol: rolEnum("rol").notNull(),
    activo: boolean("activo").notNull().default(true),
    /**
     * Un PIN de 4 digitos son 10.000 combinaciones: sin freno se prueba entero
     * en minutos. Tras varios fallos seguidos el usuario queda bloqueado un rato.
     */
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("usuarios_usuario_idx").on(t.usuario)],
);

export const productos = pgTable("productos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  tamano: tamanoEnum("tamano").notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const motivosDesperdicio = pgTable("motivos_desperdicio", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
});

export const secaderos = pgTable(
  "secaderos",
  {
    id: serial("id").primaryKey(),
    numero: integer("numero").notNull(),
    tamano: tamanoEnum("tamano").notNull(),
    estado: estadoEnum("estado").notNull().default("vacio"),
    activo: boolean("activo").notNull().default(true),
    /**
     * Momento en que el secadero entro al estado actual. Se usa para mostrar
     * "hace cuanto" en las pantallas y para calcular la duracion del tramo
     * cuando el secadero cambia de estado.
     */
    estadoDesde: timestamp("estado_desde", { withTimezone: true })
      .notNull()
      .defaultNow(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("secaderos_numero_idx").on(t.numero)],
);

/**
 * Contenido vivo de un secadero: que modelos tiene adentro y cuantas placas de
 * cada uno, ahora mismo. Se reemplaza en cada movimiento y queda vacio cuando
 * el secadero pasa a `vacio`. El historial no vive aca, vive en movimientos.
 */
export const secaderoContenido = pgTable(
  "secadero_contenido",
  {
    id: serial("id").primaryKey(),
    secaderoId: integer("secadero_id")
      .notNull()
      .references(() => secaderos.id, { onDelete: "cascade" }),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    cantidad: integer("cantidad").notNull(),
  },
  (t) => [index("secadero_contenido_secadero_idx").on(t.secaderoId)],
);

export const movimientos = pgTable(
  "movimientos",
  {
    id: serial("id").primaryKey(),
    secaderoId: integer("secadero_id")
      .notNull()
      .references(() => secaderos.id),
    /** Snapshot: el numero de secadero al momento del movimiento. */
    secaderoNumero: integer("secadero_numero").notNull(),
    secaderoTamano: tamanoEnum("secadero_tamano").notNull(),
    tipo: tipoMovimientoEnum("tipo").notNull(),
    estadoDesde: estadoEnum("estado_desde").notNull(),
    estadoHasta: estadoEnum("estado_hasta").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    /** Snapshot: para que el historial siga siendo legible si el usuario cambia. */
    usuarioNombre: text("usuario_nombre").notNull(),
    /**
     * Minutos que el secadero paso en `estadoDesde` antes de este movimiento.
     * Precalculado al escribir para que las estadisticas (sobre todo el tiempo
     * de horno) no tengan que reconstruir la linea de tiempo secadero por secadero.
     */
    duracionMin: integer("duracion_min"),
    nota: text("nota"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("movimientos_secadero_idx").on(t.secaderoId),
    index("movimientos_creado_idx").on(t.creadoEn),
    index("movimientos_tipo_idx").on(t.tipo),
  ],
);

/**
 * Detalle por modelo de un movimiento.
 *
 * Convencion importante y sostenida en todo el sistema:
 *   - `cantidad`   = placas que SIGUEN en el circuito despues del movimiento.
 *                    En una descarga, son las que se fueron a producto terminado.
 *   - `desperdicio` = placas descartadas EN ESTE movimiento (no acumulado).
 */
export const movimientoLineas = pgTable(
  "movimiento_lineas",
  {
    id: serial("id").primaryKey(),
    movimientoId: integer("movimiento_id")
      .notNull()
      .references(() => movimientos.id, { onDelete: "cascade" }),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    /** Snapshot: nombre y tamano del modelo al momento del movimiento. */
    productoNombre: text("producto_nombre").notNull(),
    cantidad: integer("cantidad").notNull().default(0),
    desperdicio: integer("desperdicio").notNull().default(0),
    motivoId: integer("motivo_id").references(() => motivosDesperdicio.id),
    motivoNombre: text("motivo_nombre"),
  },
  (t) => [index("movimiento_lineas_movimiento_idx").on(t.movimientoId)],
);

/** Parametros editables por el admin. Valores guardados como texto. */
export const config = pgTable("config", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
});

/* -------------------------------------------------------------------------- */
/* Relaciones                                                                 */
/* -------------------------------------------------------------------------- */

export const secaderosRelations = relations(secaderos, ({ many }) => ({
  contenido: many(secaderoContenido),
  movimientos: many(movimientos),
}));

export const secaderoContenidoRelations = relations(
  secaderoContenido,
  ({ one }) => ({
    secadero: one(secaderos, {
      fields: [secaderoContenido.secaderoId],
      references: [secaderos.id],
    }),
    producto: one(productos, {
      fields: [secaderoContenido.productoId],
      references: [productos.id],
    }),
  }),
);

export const movimientosRelations = relations(movimientos, ({ one, many }) => ({
  secadero: one(secaderos, {
    fields: [movimientos.secaderoId],
    references: [secaderos.id],
  }),
  usuario: one(usuarios, {
    fields: [movimientos.usuarioId],
    references: [usuarios.id],
  }),
  lineas: many(movimientoLineas),
}));

export const movimientoLineasRelations = relations(
  movimientoLineas,
  ({ one }) => ({
    movimiento: one(movimientos, {
      fields: [movimientoLineas.movimientoId],
      references: [movimientos.id],
    }),
    producto: one(productos, {
      fields: [movimientoLineas.productoId],
      references: [productos.id],
    }),
  }),
);

/* -------------------------------------------------------------------------- */
/* Tipos                                                                      */
/* -------------------------------------------------------------------------- */

export type Rol = (typeof rolEnum.enumValues)[number];
export type Tamano = (typeof tamanoEnum.enumValues)[number];
export type Estado = (typeof estadoEnum.enumValues)[number];
export type TipoMovimiento = (typeof tipoMovimientoEnum.enumValues)[number];

export type Usuario = typeof usuarios.$inferSelect;
export type Producto = typeof productos.$inferSelect;
export type Secadero = typeof secaderos.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type MovimientoLinea = typeof movimientoLineas.$inferSelect;
export type MotivoDesperdicio = typeof motivosDesperdicio.$inferSelect;

import {
  boolean,
  date,
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

/**
 * `administrativo` no opera nada: mira el resumen de produccion del dia. Es un
 * rol de oficina, no de piso, asi que no tiene ninguna pantalla de carga.
 */
export const rolEnum = pgEnum("rol", [
  "admin",
  "carrusel",
  "llenado_manual",
  "horno",
  "paletizado",
  "administrativo",
  "auditor",
]);

/**
 * Sectores a los que se les puede dictar una orden de produccion. No es lo
 * mismo que el rol: horno no recibe orden porque no decide que secar, procesa
 * lo que le llega.
 */
export const sectorEnum = pgEnum("sector", ["carrusel", "paletizado"]);

export const estadoEnum = pgEnum("estado_secadero", [
  "vacio",
  "humedo",
  "horno",
  "seco",
]);

/**
 * Que hacer con las placas de un secadero una vez descargado.
 *
 * Un secadero no da una cantidad exacta de palets, asi que lo que sobra de
 * armar palets va siempre a placas sueltas: eso es una regla fija del oficio,
 * no un dato que se cargue. Lo que se elige aca es el destino principal.
 *
 * La app no cuenta palets ni placas sueltas: solo transmite la instruccion.
 */
export const destinoEnum = pgEnum("destino_paletizado", [
  "palet_estandar",
  "palet_optimizado",
  "placa_suelta",
]);

/**
 * Los tipos de movimiento describen QUE paso, no solo la transicion de estado.
 *
 * `ajuste` ya no se genera. Existio para corregir cantidades de una carga viva
 *   sin cambiar de estado, pero nunca se conecto a ninguna pantalla y no quedo
 *   ni una fila con ese tipo. El valor se mantiene en el enum igual: sacarlo de
 *   un enum de Postgres obliga a recrear el tipo y a tocar la columna de una
 *   tabla que ya tiene historial, y no vale ese riesgo por un valor que no
 *   molesta. Para corregir una carga esta `correccion`, que ademas exige nota.
 * `correccion` es la valvula de escape del admin para arreglar un error operativo.
 * `devolucion_horno` es un secadero que salio del horno sin secar bien y vuelve
 *   a la cola: es un hecho productivo, no un error de carga, y por eso tiene su
 *   propio tipo. Mezclarlo con `correccion` haria imposible distinguir un error
 *   humano de un problema de secado.
 */
export const tipoMovimientoEnum = pgEnum("tipo_movimiento", [
  "carga",
  "ajuste",
  "entrada_horno",
  "salida_horno",
  "devolucion_horno",
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

/**
 * Tipos de secadero: grande, chico, guarda, especial... y los que vengan.
 *
 * Empezo siendo un enum de dos valores y en la practica ya aparecieron dos
 * tipos mas, asi que vive en una tabla: agregar uno nuevo es cargarlo desde
 * el panel, sin migracion ni deploy. La capacidad en placas es propia de cada
 * tipo, por eso vive aca y no en la configuracion general.
 */
export const tipos = pgTable("tipos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  capacidad: integer("capacidad").notNull(),
  activo: boolean("activo").notNull().default(true),
  /** Para controlar en que orden aparecen en los selectores. */
  orden: integer("orden").notNull().default(0),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const productos = pgTable("productos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  tipoId: integer("tipo_id")
    .notNull()
    .references(() => tipos.id),
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
    tipoId: integer("tipo_id")
      .notNull()
      .references(() => tipos.id),
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
    /** Snapshot: numero y tipo del secadero al momento del movimiento. */
    secaderoNumero: integer("secadero_numero").notNull(),
    secaderoTipoId: integer("secadero_tipo_id").references(() => tipos.id),
    secaderoTipoNombre: text("secadero_tipo_nombre").notNull(),
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

/**
 * Roturas del carrusel: las placas que se rompen ANTES de entrar al secadero.
 *
 * No son un movimiento. Un movimiento describe algo que le pasa a un secadero,
 * y estas roturas ocurren en la linea, antes de que la placa llegue a uno: el
 * carrusel siempre trata de sacar secaderos completos, asi que lo roto se
 * descarta y el secadero se llena igual. Meterlas en `movimiento_lineas`
 * obligaria a inventarles un secadero, y despues toda estadistica por secadero
 * estaria contaminada por placas que nunca estuvieron adentro de uno.
 *
 * Por eso viven aparte, con su propia fecha y hora, atadas al producto y a
 * quien las reporto. Es la tabla que responde "cuanto se rompio de tal modelo
 * en tal periodo".
 */
export const roturasCarrusel = pgTable(
  "roturas_carrusel",
  {
    id: serial("id").primaryKey(),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    /** Snapshot: el historial se lee aunque despues se renombre el producto. */
    productoNombre: text("producto_nombre").notNull(),
    cantidad: integer("cantidad").notNull(),
    motivoId: integer("motivo_id").references(() => motivosDesperdicio.id),
    motivoNombre: text("motivo_nombre"),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    usuarioNombre: text("usuario_nombre").notNull(),
    nota: text("nota"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("roturas_carrusel_creado_idx").on(t.creadoEn),
    index("roturas_carrusel_producto_idx").on(t.productoId),
  ],
);

export const motivosDesvio = pgTable("motivos_desvio", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  activo: boolean("activo").notNull().default(true),
});

/**
 * Orden de produccion de un dia para un sector.
 *
 * La fecha es un `date` y no un timestamp: el plan es "el lunes", no "el lunes
 * a las 00:00 de tal huso". Se guarda como la fecha local argentina y asi no
 * hay que corregir husos al compararla.
 *
 * Un dia sin plan no es un plan de cero: es "sin plan", y se mide distinto.
 * Por eso la ausencia de fila significa algo y no se rellena con nada.
 */
export const planes = pgTable(
  "planes",
  {
    id: serial("id").primaryKey(),
    fecha: date("fecha").notNull(),
    sector: sectorEnum("sector").notNull(),
    nota: text("nota"),
    creadoPor: integer("creado_por").references(() => usuarios.id),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("planes_fecha_sector_idx").on(t.fecha, t.sector)],
);

/**
 * Cuantos secaderos de cada producto se piden ese dia.
 *
 * El motivo del desvio vive aca y no en una tabla aparte: el desvio no se
 * carga, se calcula comparando con los movimientos reales. Lo unico que hace
 * falta guardar es la explicacion, y es una por linea.
 */
export const planLineas = pgTable(
  "plan_lineas",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => planes.id, { onDelete: "cascade" }),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    secaderos: integer("secaderos").notNull(),
    /**
     * Que hacer con esos secaderos y para quien. Solo aplican al sector
     * paletizado; en carrusel quedan nulos, porque cargar un secadero no tiene
     * destino ni cliente.
     */
    destino: destinoEnum("destino"),
    cliente: text("cliente"),
    motivoDesvioId: integer("motivo_desvio_id").references(
      () => motivosDesvio.id,
    ),
    notaDesvio: text("nota_desvio"),
    explicadoPor: integer("explicado_por").references(() => usuarios.id),
    explicadoPorNombre: text("explicado_por_nombre"),
    explicadoEn: timestamp("explicado_en", { withTimezone: true }),
  },
  (t) => [index("plan_lineas_plan_idx").on(t.planId)],
);

/** Parametros editables por el admin. Valores guardados como texto. */
export const config = pgTable("config", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
});

/* -------------------------------------------------------------------------- */
/* Relaciones                                                                 */
/* -------------------------------------------------------------------------- */

export const tiposRelations = relations(tipos, ({ many }) => ({
  secaderos: many(secaderos),
  productos: many(productos),
}));

export const secaderosRelations = relations(secaderos, ({ one, many }) => ({
  tipo: one(tipos, {
    fields: [secaderos.tipoId],
    references: [tipos.id],
  }),
  contenido: many(secaderoContenido),
  movimientos: many(movimientos),
}));

export const productosRelations = relations(productos, ({ one }) => ({
  tipo: one(tipos, {
    fields: [productos.tipoId],
    references: [tipos.id],
  }),
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
export type Estado = (typeof estadoEnum.enumValues)[number];
export type TipoMovimiento = (typeof tipoMovimientoEnum.enumValues)[number];

export type Tipo = typeof tipos.$inferSelect;
export type Usuario = typeof usuarios.$inferSelect;
export type Producto = typeof productos.$inferSelect;
export type Secadero = typeof secaderos.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type MovimientoLinea = typeof movimientoLineas.$inferSelect;
export type MotivoDesperdicio = typeof motivosDesperdicio.$inferSelect;
export type MotivoDesvio = typeof motivosDesvio.$inferSelect;
export type Plan = typeof planes.$inferSelect;
export type PlanLinea = typeof planLineas.$inferSelect;
export type Sector = (typeof sectorEnum.enumValues)[number];
export type Destino = (typeof destinoEnum.enumValues)[number];
export type RoturaCarrusel = typeof roturasCarrusel.$inferSelect;

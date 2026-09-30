import {
  type AnyPgColumn,
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
 * `secado_natural` es humedo -> seco sin pasar por el horno, tipicamente al
 *   sol. Tiene tipo propio y no se anota como `salida_horno` por una razon que
 *   no es cosmetica: toda la estadistica de horno mide `duracion_min` de las
 *   salidas, y estos secaderos nunca estuvieron adentro. Contarlos ahi meteria
 *   esperas de un dia entero en el promedio de un ciclo de cinco horas y
 *   arruinaria el unico numero que dice cuanto hay que hornear de verdad.
 */
export const tipoMovimientoEnum = pgEnum("tipo_movimiento", [
  "carga",
  "ajuste",
  "entrada_horno",
  "salida_horno",
  "devolucion_horno",
  "secado_natural",
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
 *
 * `capacidad` en null significa SIN TOPE FIJO, y no es lo mismo que cero ni que
 * un numero grande. Hay tipos -guarda, especial- donde no existe un "secadero
 * lleno": entra lo que ese dia haya, y la cantidad cambia carga a carga. Ponerles
 * un numero inventado hace que el sistema rechace cargas validas y, peor, que
 * marque como INCOMPLETA una carga que estaba perfecta. Con null el sistema
 * simplemente no opina sobre la cantidad: no valida tope, no marca incompleto y
 * los deja afuera de la adherencia al flujo.
 */
export const tipos = pgTable("tipos", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  capacidad: integer("capacidad"),
  /**
   * Lugares propios en el horno, para los tipos que no compiten por el cupo
   * general. Las guardas van en su propia estructura: entran 4 y no ocupan
   * ninguno de los lugares de los grandes y chicos.
   *
   * En null el tipo comparte el cupo general (`capacidad_horno` en la config),
   * que es el caso de la mayoria. Vive por tipo y no como un segundo parametro
   * global porque el nombre "Guarda" es editable y los tipos se agregan en
   * caliente: atar la regla a un nombre la rompe el dia que alguien lo cambie.
   */
  cupoHorno: integer("cupo_horno"),
  /**
   * El tipo se llena y se descarga por fuera del circuito principal.
   *
   * Las guardas no las hace el carrusel: las carga a mano el operario de
   * guardas, y el mismo las descarga en paletizado. Solo el paso por el horno
   * es compartido, porque ahi las mete y las saca el hornero como a todo lo
   * demas.
   *
   * Marcado, el tipo desaparece de las listas de carrusel y de paletizado y
   * aparece en la pantalla de llenado manual. No bloquea la accion del
   * servidor: en la planta las guardas las puede sacar quien las cargo o
   * cualquier otro, y lo que el sistema garantiza es la atribucion del
   * movimiento, no una ruta rigida. Lo que cambia es que cada pantalla muestra
   * solo lo que le toca.
   *
   * Es una bandera por tipo y no una regla por nombre, por lo mismo que
   * `cupoHorno`: "Guarda" es editable desde el panel y atar la logica al nombre
   * la rompe en silencio el dia que alguien lo cambie.
   */
  llenadoManual: boolean("llenado_manual").notNull().default(false),
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
  /**
   * Moldes de este modelo que hay en la planta, montados o no.
   *
   * Es el techo de lo que se puede pedir en el plan: nunca se pide poner mas
   * moldes de los que existen. Cambia con el tiempo -se dan de baja los
   * deteriorados, se compran nuevos, se discontinua un modelo- y se edita
   * desde Administracion -> Moldes.
   *
   * Nace en 0 para todo lo que ya existia: hasta que se cargue el inventario
   * no se puede pedir ningun molde de ese modelo, que es mas honesto que
   * inventar un numero.
   */
  moldes: integer("moldes").notNull().default(0),
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

    /**
     * Anulacion: el movimiento se registro mal y quien lo hizo lo deshizo.
     *
     * La fila NO se borra ni se edita. Sus datos siguen siendo lo que se
     * registro en su momento, y estas columnas agregan quien lo anulo, cuando
     * y por que. Es la regla de toda la app: el historial no miente, y un
     * error corregido tambien es un dato -cuantos hay, en que puesto, de que
     * tipo- que se pierde si se pisa el numero.
     *
     * Toda consulta que SUME -produccion, plan, estadisticas, reproceso-
     * tiene que ignorar los anulados (ver `vigente` en consultas). Las que
     * MUESTRAN historia -el listado de movimientos, el CSV- los traen
     * marcados.
     *
     * Quien anula no siempre es el autor: el admin puede anular el de otro.
     * Por eso va aparte de `usuarioId`, que sigue siendo quien hizo el trabajo.
     */
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    anuladoPorId: integer("anulado_por_id").references(() => usuarios.id),
    anuladoPorNombre: text("anulado_por_nombre"),
    motivoAnulacion: text("motivo_anulacion"),

    /**
     * En una correccion, el movimiento anulado al que este reemplaza.
     *
     * Corregir es anular y rehacer en un solo paso: el original queda anulado
     * y este ocupa su lugar con los datos correctos. Lleva el mismo tipo, el
     * mismo autor y la misma hora que el original -la carga paso a las 10:14,
     * aunque se haya corregido a las 10:42-, asi que para cualquier reporte es
     * sencillamente la carga de ese dia. La hora de la correccion queda en el
     * `anuladoEn` del original.
     */
    reemplazaA: integer("reemplaza_a").references(
      (): AnyPgColumn => movimientos.id,
    ),
  },
  (t) => [
    index("movimientos_secadero_idx").on(t.secaderoId),
    index("movimientos_creado_idx").on(t.creadoEn),
    index("movimientos_tipo_idx").on(t.tipo),
    index("movimientos_reemplaza_idx").on(t.reemplazaA),
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

/**
 * Yeso: los bolsones que entran a la linea y los baldes que se tiran.
 *
 * No cuelga de ningun secadero, igual que las roturas del carrusel. El yeso se
 * consume antes de que exista una placa: un bolson abierto no le pasa a un
 * secadero, le pasa al dia. Atarlo a uno obligaria a inventar cual, y despues
 * toda estadistica por secadero quedaria contaminada.
 *
 * Tampoco se ata a un producto. El yeso entra a granel y el carrusel cambia de
 * modelo durante el dia: repartir un bolson entre modelos seria pedirle al
 * operario que adivine, y un dato adivinado ensucia mas de lo que aporta.
 *
 * Cada fila guarda su propio `kgPorUnidad` en vez de multiplicar por el
 * parametro al momento de leer. Si manana cambia el proveedor y el bolson pasa
 * a 900 kg, los kilos de los meses anteriores tienen que seguir dando lo mismo
 * que daban: un parametro global aplicado hacia atras reescribe el historial.
 *
 * Ojo con como se leen esos kilos: son una conversion, no una medicion. Nadie
 * pesa el balde. Sirven para comparar un periodo contra otro, no para una
 * liquidacion ni para discutir con un proveedor.
 */
export const tipoYesoEnum = pgEnum("tipo_yeso", [
  "bolson",
  "balde_desperdicio",
]);

export const consumoYeso = pgTable(
  "consumo_yeso",
  {
    id: serial("id").primaryKey(),
    tipo: tipoYesoEnum("tipo").notNull(),
    /** Unidades enteras: bolsones abiertos o baldes tirados. */
    cantidad: integer("cantidad").notNull(),
    /** Peso vigente al registrar. Ver el comentario de arriba. */
    kgPorUnidad: integer("kg_por_unidad").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    /** Snapshot: el historial se lee aunque despues se renombre el usuario. */
    usuarioNombre: text("usuario_nombre").notNull(),
    nota: text("nota"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("consumo_yeso_creado_idx").on(t.creadoEn),
    index("consumo_yeso_tipo_idx").on(t.tipo),
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
    /**
     * Palets pedidos a paletizado, por tipo. Solo en paletizado.
     *
     * Reemplazan a `destino` en los planes nuevos: en vez de "este modelo va a
     * palet estandar" se pide "arma 1 palet estandar", que es algo que se
     * puede confirmar y medir. `destino` queda para leer los planes viejos.
     *
     * Una linea puede pedir palets sin pedir secaderos (`secaderos` = 0): las
     * placas pueden estar ya descargadas, en un cajon.
     */
    paletsEstandar: integer("palets_estandar"),
    paletsOptimizados: integer("palets_optimizados"),
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

/**
 * Moldes pedidos en el carrusel para un dia: cuantos de cada modelo.
 *
 * No cuelga de `planes` porque vive con independencia de los secaderos: se
 * puede pedir un cambio de moldes un dia sin plan de secaderos, y borrar el
 * plan de secaderos no puede llevarse puesto el de moldes.
 *
 * Un dia SIN filas significa "sin cambios": siguen los moldes que esten
 * montados. No es lo mismo que pedir cero moldes, que no tiene sentido.
 */
export const planMoldes = pgTable(
  "plan_moldes",
  {
    id: serial("id").primaryKey(),
    fecha: date("fecha").notNull(),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    moldes: integer("moldes").notNull(),
  },
  (t) => [
    uniqueIndex("plan_moldes_fecha_producto_idx").on(t.fecha, t.productoId),
  ],
);

/**
 * Por que el carrusel no tiene todos sus lugares con molde.
 *
 * Lo normal es que esten todos; menos que eso es una excepcion que tiene que
 * quedar explicada, porque cada lugar vacio es produccion que no sale.
 */
export const motivoMoldesIncompletosEnum = pgEnum(
  "motivo_moldes_incompletos",
  ["mesa_mantenimiento", "falta_moldes", "otro"],
);

/**
 * Cambio de moldes en el carrusel: el historial de que moldes hubo montados.
 *
 * Cada fila guarda el SET COMPLETO que quedo montado despues del cambio, no
 * solo lo que entro y salio. Asi "que habia montado a tal hora" es leer una
 * sola fila -la ultima vigente antes de esa hora- y no reconstruir una suma de
 * diferencias desde el principio de los tiempos. Lo que salio y lo que entro
 * se calcula comparando con el cambio anterior.
 *
 * Lo registra el operario del carrusel, que tiene la ultima palabra: el plan
 * dice que moldes se quieren, pero si en el momento no se puede, el operario
 * monta lo que corresponde y queda asentado lo que realmente se hizo.
 *
 * Se anula igual que un movimiento: la fila queda, marcada. Solo se puede
 * anular el ultimo vigente, porque cada set se apoya en el anterior.
 */
export const cambiosMoldes = pgTable(
  "cambios_moldes",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    usuarioNombre: text("usuario_nombre").notNull(),
    /** Moldes montados despues del cambio, sumando todos los modelos. */
    total: integer("total").notNull(),
    /** Lugares del carrusel en ese momento. Snapshot del parametro. */
    lugares: integer("lugares").notNull(),
    /** Obligatorio cuando `total` < `lugares`. */
    motivoIncompleto: motivoMoldesIncompletosEnum("motivo_incompleto"),
    nota: text("nota"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    anuladoPorId: integer("anulado_por_id").references(() => usuarios.id),
    anuladoPorNombre: text("anulado_por_nombre"),
    motivoAnulacion: text("motivo_anulacion"),
  },
  (t) => [index("cambios_moldes_creado_idx").on(t.creadoEn)],
);

/** El set montado despues de un cambio, modelo por modelo. Solo filas > 0. */
export const cambioMoldesLineas = pgTable(
  "cambio_moldes_lineas",
  {
    id: serial("id").primaryKey(),
    cambioId: integer("cambio_id")
      .notNull()
      .references(() => cambiosMoldes.id, { onDelete: "cascade" }),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    /** Snapshot: el historial se lee aunque despues se renombre el modelo. */
    productoNombre: text("producto_nombre").notNull(),
    cantidad: integer("cantidad").notNull(),
  },
  (t) => [index("cambio_moldes_lineas_cambio_idx").on(t.cambioId)],
);

/**
 * Palets que paletizado confirma haber armado.
 *
 * Es un registro de movimientos y no un contador: cada toque en + o en "Listo"
 * agrega una fila con quien y cuando, y un toque en - agrega una fila negativa.
 * Lo armado del dia es la suma. Asi el numero nunca se pisa y se sabe quien
 * confirmo cada cosa.
 *
 * Va por fecha del plan y por modelo, no por linea del plan: se pueden armar
 * palets de un modelo del que no se pidieron secaderos -placas que ya estaban
 * en un cajon-, y rehacer el plan borra y reescribe sus lineas, lo que se
 * llevaria puesto lo confirmado.
 */
export const tipoPaletEnum = pgEnum("tipo_palet", ["estandar", "optimizado"]);

export const paletsArmados = pgTable(
  "palets_armados",
  {
    id: serial("id").primaryKey(),
    fecha: date("fecha").notNull(),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    productoNombre: text("producto_nombre").notNull(),
    tipo: tipoPaletEnum("tipo").notNull(),
    /** Positivo al confirmar, negativo al descontar un error. */
    cantidad: integer("cantidad").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    usuarioNombre: text("usuario_nombre").notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("palets_armados_fecha_idx").on(t.fecha)],
);

/**
 * Indicaciones del dia para el hornero: una para cargar y otra para descargar.
 *
 * No es un plan y por eso no vive en `planes`: el horno no recibe orden porque
 * no decide que secar, y nada de esto se mide contra lo hecho. Es texto libre
 * que el admin deja para que el hornero lo lea arriba de su pantalla.
 *
 * La fecha es la clave: hay una sola fila por dia. Si las dos notas quedan
 * vacias la fila se borra, asi que un dia sin fila es un dia sin indicaciones.
 */
export const notasHorno = pgTable("notas_horno", {
  fecha: date("fecha").primaryKey(),
  carga: text("carga"),
  descarga: text("descarga"),
  actualizadoPor: integer("actualizado_por").references(() => usuarios.id, {
    onDelete: "set null",
  }),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
export type NotaHorno = typeof notasHorno.$inferSelect;
export type Sector = (typeof sectorEnum.enumValues)[number];
export type Destino = (typeof destinoEnum.enumValues)[number];
export type RoturaCarrusel = typeof roturasCarrusel.$inferSelect;
export type TipoYeso = (typeof tipoYesoEnum.enumValues)[number];
export type ConsumoYeso = typeof consumoYeso.$inferSelect;
export type MotivoMoldesIncompletos =
  (typeof motivoMoldesIncompletosEnum.enumValues)[number];
export type TipoPalet = (typeof tipoPaletEnum.enumValues)[number];

/**
 * Historial de desarrollo de la app: los hitos importantes, no cada cambio.
 * Se ve en Administracion -> Rumbo.
 *
 * Cada cambio que se publica suma acá su hito, en el mismo pull request, para
 * que la linea de tiempo nunca quede atrasada. Van del mas viejo al mas nuevo.
 * Las fechas son las del primer commit de cada cambio.
 */

export type AreaHito =
  | "Base"
  | "Carrusel"
  | "Horno"
  | "Paletizado"
  | "Plan"
  | "Estadísticas"
  | "Administración";

export type Hito = {
  /** YYYY-MM-DD */
  fecha: string;
  area: AreaHito;
  titulo: string;
  detalle: string;
};

/** Primer registro del proyecto. */
export const INICIO_DESARROLLO = "2026-08-27";

export const HITOS: Hito[] = [
  {
    fecha: "2026-08-27",
    area: "Base",
    titulo: "Primera versión en marcha",
    detalle:
      "El circuito vacío → húmedo → horno → seco, con cada movimiento y su desperdicio registrados.",
  },
  {
    fecha: "2026-08-28",
    area: "Administración",
    titulo: "Tipos de secadero administrables y llenado manual",
    detalle:
      "Tipos con capacidad propia y colores, y la app preparada para trabajar con 250 secaderos.",
  },
  {
    fecha: "2026-08-31",
    area: "Plan",
    titulo: "Orden de producción por día",
    detalle:
      "El plan diario de carrusel y paletizado, con el desvío calculado y su motivo.",
  },
  {
    fecha: "2026-08-31",
    area: "Paletizado",
    titulo: "Devolver al horno un secadero que no secó",
    detalle:
      "Paletizado informa el secadero húmedo y vuelve primero a la cola, marcado.",
  },
  {
    fecha: "2026-09-01",
    area: "Estadísticas",
    titulo: "Aprovechamiento del horno y planillas de Excel",
    detalle:
      "Hornadas medidas contra lo que había esperando; importar y exportar secaderos y productos.",
  },
  {
    fecha: "2026-09-01",
    area: "Carrusel",
    titulo: "Roturas antes del secadero y rol administrativo",
    detalle:
      "Lo que se rompe en la línea queda registrado, y el administrativo tiene su resumen diario.",
  },
  {
    fecha: "2026-09-07",
    area: "Horno",
    titulo: "Secado al sol y cupo de horno por tipo",
    detalle:
      "Secaderos que secan sin horno, y lugares propios en el horno para las guardas.",
  },
  {
    fecha: "2026-09-07",
    area: "Carrusel",
    titulo: "Registro de yeso",
    detalle: "Bolsones consumidos y baldes tirados, convertidos a kilos.",
  },
  {
    fecha: "2026-09-13",
    area: "Horno",
    titulo: "Notas del día y selector de día",
    detalle:
      "Indicaciones para cargar y descargar, y cada pantalla puede mirar otros días.",
  },
  {
    fecha: "2026-09-20",
    area: "Base",
    titulo: "Pantalla propia de llenado manual",
    detalle: "Las guardas salen del carrusel y tienen su circuito aparte.",
  },
  {
    fecha: "2026-09-21",
    area: "Base",
    titulo: "Corregir movimientos desde el piso",
    detalle:
      "Cada operario corrige lo suyo mientras nadie lo haya tocado después; nada se borra.",
  },
  {
    fecha: "2026-09-30",
    area: "Carrusel",
    titulo: "Moldes del carrusel y palets confirmados",
    detalle:
      "Inventario y cambio de moldes, palets armados en paletizado y repetir un día del plan.",
  },
  {
    fecha: "2026-10-01",
    area: "Estadísticas",
    titulo: "Estadísticas por categorías y producción por puesto",
    detalle:
      "Producción, rendimiento, roturas y horno; períodos de calendario; placas o secaderos por tipo y modelo.",
  },
  {
    fecha: "2026-10-11",
    area: "Plan",
    titulo: "Cumplimiento como vaso e informe por Telegram",
    detalle:
      "Cada día del plan se llena hasta lo cumplido, y a las 22 hs llega el informe del día.",
  },
  {
    fecha: "2026-10-12",
    area: "Estadísticas",
    titulo: "Mis estadísticas y estadísticas de operarios",
    detalle:
      "Cada operario ve su propio trabajo con gráficos, y el admin ve el de cada uno.",
  },
  {
    fecha: "2026-10-12",
    area: "Horno",
    titulo: "Horno más ágil",
    detalle:
      "Secciones que se esconden, matriz de secaderos, plan de paletizado a la vista y motivo «Secadero volcado».",
  },
  {
    fecha: "2026-10-12",
    area: "Administración",
    titulo: "Apariencia",
    detalle: "El admin elige el fondo de la app para todos.",
  },
  {
    fecha: "2026-10-12",
    area: "Administración",
    titulo: "Rumbo: objetivos e historial",
    detalle:
      "Esta sección: el propósito, los objetivos y el glosario editables, y la historia de la app.",
  },
  {
    fecha: "2026-10-18",
    area: "Plan",
    titulo: "Plan como hoja del día, con meta",
    detalle:
      "La fecha arriba, la meta de secaderos por día y debajo carrusel, horno y paletizado, como en Control de Estanterías.",
  },
  {
    fecha: "2026-10-18",
    area: "Estadísticas",
    titulo: "Estadísticas en metros cuadrados",
    detalle:
      "Cada producto lleva su medida por placa, y las estadísticas muestran producción, terminado y roturas en m² (las guardas, en metros lineales).",
  },
];

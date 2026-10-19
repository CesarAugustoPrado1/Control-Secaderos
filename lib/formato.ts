export const ZONA = "America/Argentina/Buenos_Aires";

const fmtFechaHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export const fechaHora = (d: Date) => fmtFechaHora.format(d);
export const hora = (d: Date) => fmtHora.format(d);
export const fecha = (d: Date) => fmtFecha.format(d);

/** "3 d 4 h", "5 h 20 min", "12 min". Pensado para leerse de un vistazo. */
export function duracion(minutos: number | null | undefined): string {
  if (minutos == null) return "—";
  const min = Math.max(0, Math.round(minutos));
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  if (horas < 24) return resto ? `${horas} h ${resto} min` : `${horas} h`;
  const dias = Math.floor(horas / 24);
  const hs = horas % 24;
  return hs ? `${dias} d ${hs} h` : `${dias} d`;
}

/** Minutos transcurridos desde `desde` hasta ahora. */
export function minutosDesde(desde: Date): number {
  return Math.round((Date.now() - desde.getTime()) / 60000);
}

export const numero = (n: number) => n.toLocaleString("es-AR");

/**
 * Metros cuadrados para leer de un vistazo: sin decimales desde 100 m2 -en un
 * total de miles, los decimales no dicen nada- y con uno por debajo.
 */
export const m2Numero = (n: number) =>
  n.toLocaleString("es-AR", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 1 });

export const m2 = (n: number) => `${m2Numero(n)} m²`;

/** Metros lineales, con el mismo redondeo que los m2 (las guardas). */
export const ml = (n: number) => `${m2Numero(n)} ml`;

/**
 * Una medida que puede tener las dos partes: m2 de las placas y metros
 * lineales de las guardas. No se suman entre si: van una al lado de la otra.
 */
export function medida(m2Valor: number, mlValor: number): string {
  const partes = [m2Valor > 0 ? m2(m2Valor) : null, mlValor > 0 ? ml(mlValor) : null].filter(
    Boolean,
  );
  return partes.length ? partes.join(" + ") : m2(0);
}

/**
 * Como se nombra la capacidad de un tipo en los encabezados: "hasta 102 placas"
 * o, cuando no tiene tope fijo, "sin tope fijo". Vive aca para que las pantallas
 * digan todas lo mismo; que una sola muestre "hasta 0 placas" seria peor que no
 * mostrar nada.
 */
export const capacidadTexto = (capacidad: number | null) =>
  capacidad === null ? "sin tope fijo" : `hasta ${numero(capacidad)} placas`;

/**
 * Kilos legibles de un vistazo. Arriba de 10 toneladas el numero en kilos deja
 * de decir algo -"192.000 kg" hay que contarlo con el dedo- asi que pasa a
 * toneladas. Se redondea siempre: son kilos estimados a partir de unidades, y
 * mostrar decimales les daria una precision que no tienen.
 */
export function kilos(kg: number): string {
  if (kg < 10000) return `${numero(Math.round(kg))} kg`;
  return `${(kg / 1000).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} t`;
}

export function porcentaje(parte: number, total: number): string {
  if (!total) return "0,0%";
  return `${((parte / total) * 100).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

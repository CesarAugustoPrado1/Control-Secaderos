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

export function porcentaje(parte: number, total: number): string {
  if (!total) return "0,0%";
  return `${((parte / total) * 100).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

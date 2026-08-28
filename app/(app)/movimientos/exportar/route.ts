import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/auth";
import { listarMovimientos } from "@/lib/consultas";
import { ETIQUETA_ESTADO, ETIQUETA_MOVIMIENTO } from "@/lib/estados";
import { ZONA } from "@/lib/formato";

const MAXIMO_FILAS = 20000;

const COLUMNAS = [
  "Fecha",
  "Hora",
  "Secadero",
  "Tipo",
  "Movimiento",
  "Estado desde",
  "Estado hasta",
  "Minutos en estado anterior",
  "Usuario",
  "Modelo",
  "Placas",
  "Desperdicio",
  "Motivo",
  "Nota",
];

function comoFecha(valor: string | null, finDelDia: boolean) {
  if (!valor) return undefined;
  const fecha = new Date(`${valor}T${finDelDia ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

/** Escapa un valor para CSV: comillas dobles duplicadas y campo entrecomillado. */
function celda(valor: string | number | null | undefined): string {
  if (valor == null) return "";
  const texto = String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const sesion = await sesionActual();
  if (!sesion || (sesion.rol !== "admin" && sesion.rol !== "auditor")) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const q = req.nextUrl.searchParams;
  const { items } = await listarMovimientos({
    tipo: q.get("tipo") || undefined,
    secaderoId: q.get("secadero") ? Number(q.get("secadero")) : undefined,
    usuarioId: q.get("usuario") ? Number(q.get("usuario")) : undefined,
    desde: comoFecha(q.get("desde"), false),
    hasta: comoFecha(q.get("hasta"), true),
    porPagina: MAXIMO_FILAS,
  });

  const fmtFecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fmtHora = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Una fila por linea de movimiento: asi se puede tabular por modelo y motivo
  // directamente en una planilla.
  const filas = [COLUMNAS.map(celda).join(";")];

  for (const m of items) {
    const comunes = [
      fmtFecha.format(m.creadoEn),
      fmtHora.format(m.creadoEn),
      m.secaderoNumero,
      m.secaderoTipoNombre,
      ETIQUETA_MOVIMIENTO[m.tipo],
      ETIQUETA_ESTADO[m.estadoDesde],
      ETIQUETA_ESTADO[m.estadoHasta],
      m.duracionMin ?? "",
      m.usuarioNombre,
    ];

    if (m.lineas.length === 0) {
      filas.push([...comunes, "", "", "", "", m.nota].map(celda).join(";"));
      continue;
    }

    for (const l of m.lineas) {
      filas.push(
        [
          ...comunes,
          l.productoNombre,
          l.cantidad,
          l.desperdicio,
          l.motivoNombre ?? "",
          m.nota,
        ]
          .map(celda)
          .join(";"),
      );
    }
  }

  // El BOM hace que Excel reconozca el UTF-8 y no rompa los acentos.
  const csv = `﻿${filas.join("\r\n")}`;
  const nombre = `movimientos-${fmtFecha.format(new Date())}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}

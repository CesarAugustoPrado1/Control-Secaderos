import type { ReactNode } from "react";
import type { Estado, Tamano } from "@/lib/db/schema";
import {
  COLOR_ESTADO,
  ETIQUETA_ESTADO,
  ETIQUETA_TAMANO,
} from "@/lib/estados";

export function ChipEstado({ estado }: { estado: Estado }) {
  return (
    <span className={`chip ${COLOR_ESTADO[estado].chip}`}>
      {ETIQUETA_ESTADO[estado].toUpperCase()}
    </span>
  );
}

export function ChipTamano({ tamano }: { tamano: Tamano }) {
  return (
    <span
      className={`chip ${
        tamano === "grande"
          ? "bg-indigo-100 text-indigo-800"
          : "bg-teal-100 text-teal-800"
      }`}
    >
      {ETIQUETA_TAMANO[tamano]}
    </span>
  );
}

export function Aviso({
  tono = "error",
  children,
}: {
  tono?: "error" | "info" | "exito";
  children: ReactNode;
}) {
  const estilos = {
    error: "bg-red-50 text-red-800 ring-red-200",
    info: "bg-blue-50 text-blue-800 ring-blue-200",
    exito: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  }[tono];
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      className={`rounded-xl px-4 py-3 text-sm font-medium ring-1 ${estilos}`}
    >
      {children}
    </div>
  );
}

export function Vacio({
  titulo,
  detalle,
}: {
  titulo: string;
  detalle?: string;
}) {
  return (
    <div className="tarjeta px-6 py-12 text-center">
      <p className="text-base font-semibold text-slate-700">{titulo}</p>
      {detalle && <p className="mt-1 text-sm text-slate-500">{detalle}</p>}
    </div>
  );
}

export function Titulo({
  children,
  detalle,
  accion,
}: {
  children: ReactNode;
  detalle?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{children}</h1>
        {detalle && <p className="mt-0.5 text-sm text-slate-500">{detalle}</p>}
      </div>
      {accion}
    </div>
  );
}

/** Numero de secadero en grande, con el color de su estado. */
export function NumeroSecadero({
  numero,
  estado,
  tamano,
}: {
  numero: number;
  estado: Estado;
  tamano?: "sm" | "lg";
}) {
  const color = COLOR_ESTADO[estado];
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl font-bold tabular-nums ${color.chip} ${
        tamano === "lg" ? "h-16 w-16 text-2xl" : "h-12 w-12 text-lg"
      }`}
    >
      {numero}
    </div>
  );
}

export function Dato({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {rotulo}
      </dt>
      <dd className="mt-0.5 text-base font-semibold text-slate-900">
        {children}
      </dd>
    </div>
  );
}

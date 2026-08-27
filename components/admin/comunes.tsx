"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Resultado } from "@/lib/acciones/comun";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

/**
 * Boton que dispara una server action y refresca. Muestra el error abajo, en
 * lugar de un alert, para que quede a la vista junto a la fila que fallo.
 */
export function BotonAccion({
  accion,
  children,
  confirmar,
  variante = "suave",
  alTerminar,
}: {
  accion: () => Promise<Resultado>;
  children: ReactNode;
  confirmar?: string;
  variante?: "suave" | "peligro";
  alTerminar?: () => void;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();

  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={async () => {
          if (confirmar && !window.confirm(confirmar)) return;
          await ejecutar(accion, () => {
            router.refresh();
            alTerminar?.();
          });
        }}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition disabled:opacity-40 ${
          variante === "peligro"
            ? "text-red-700 ring-1 ring-red-200 hover:bg-red-50"
            : "text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
        }`}
      >
        {enviando ? "…" : children}
      </button>
      {error && (
        <p className="mt-1 basis-full text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </>
  );
}

/** Contenedor plegable para el formulario de alta de cada seccion. */
export function BloqueNuevo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: (cerrar: () => void) => ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="boton-primario mb-4"
      >
        + {etiqueta}
      </button>
    );
  }

  return (
    <div className="tarjeta mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{etiqueta}</h2>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-sm font-medium text-slate-500"
        >
          Cancelar
        </button>
      </div>
      {children(() => setAbierto(false))}
    </div>
  );
}

/** Formulario chico con estado de envio y error, usado por todos los ABM. */
export function FormularioAbm({
  accion,
  alGuardar,
  children,
  textoBoton = "Guardar",
}: {
  accion: () => Promise<Resultado>;
  alGuardar?: () => void;
  children: ReactNode;
  textoBoton?: string;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await ejecutar(accion, () => {
          router.refresh();
          alGuardar?.();
        });
      }}
      className="space-y-3"
    >
      {children}
      {error && <Aviso>{error}</Aviso>}
      <button type="submit" disabled={enviando} className="boton-primario">
        {enviando ? "Guardando…" : textoBoton}
      </button>
    </form>
  );
}

export function Campo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      {children}
    </label>
  );
}

export function FilaAbm({
  children,
  atenuado,
}: {
  children: ReactNode;
  atenuado?: boolean;
}) {
  return (
    <li
      className={`tarjeta flex flex-wrap items-center gap-3 p-3.5 ${
        atenuado ? "opacity-55" : ""
      }`}
    >
      {children}
    </li>
  );
}

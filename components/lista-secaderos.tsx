"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SecaderoVista } from "@/lib/consultas";
import { COLOR_ESTADO } from "@/lib/estados";
import { duracion, minutosDesde, numero } from "@/lib/formato";

/**
 * Lista de secaderos con buscador por numero.
 *
 * Con ~250 secaderos, encontrar el 200 scrolleando es inviable: el operario ya
 * sabe que numero va a usar, asi que escribirlo es el camino mas corto. El
 * filtro es por prefijo (escribis "2" y aparecen 2, 20 a 29, 200 a 250), que es
 * como uno piensa los numeros, y no por "contiene".
 */
export function ListaSecaderos({
  secaderos,
  hrefBase,
  vacio,
  autoFoco = true,
}: {
  secaderos: SecaderoVista[];
  hrefBase: string;
  vacio: { titulo: string; detalle?: string };
  autoFoco?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Abrir el teclado numerico al entrar ahorra un toque por operacion.
    // Solo cuando hay lista larga: con pocos secaderos molesta mas que ayuda.
    if (autoFoco && secaderos.length > 12) campo.current?.focus();
  }, [autoFoco, secaderos.length]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim();
    if (!q) return secaderos;
    return secaderos.filter((s) => String(s.numero).startsWith(q));
  }, [secaderos, busqueda]);

  if (secaderos.length === 0) {
    return (
      <div className="tarjeta px-6 py-12 text-center">
        <p className="text-base font-semibold text-slate-700">{vacio.titulo}</p>
        {vacio.detalle && (
          <p className="mt-1 text-sm text-slate-500">{vacio.detalle}</p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="mb-3">
        <div className="relative">
          <input
            ref={campo}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value.replace(/\D/g, ""))}
            placeholder="Buscar por número…"
            aria-label="Buscar secadero por número"
            className="campo py-3.5 pr-24 text-lg font-semibold tabular-nums"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                setBusqueda("");
                campo.current?.focus();
              }}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600"
            >
              Borrar
            </button>
          )}
        </div>
        <p className="mt-1.5 text-sm text-slate-500">
          {busqueda
            ? `${filtrados.length} de ${secaderos.length}`
            : `${secaderos.length} ${secaderos.length === 1 ? "disponible" : "disponibles"}`}
        </p>
      </div>

      {filtrados.length === 0 ? (
        <div className="tarjeta px-6 py-10 text-center">
          <p className="text-sm text-slate-500">
            Ningún secadero disponible empieza con{" "}
            <strong className="text-slate-700">{busqueda}</strong>.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((s) => (
            <li key={s.id}>
              <FilaSecadero secadero={s} href={`${hrefBase}/${s.id}`} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilaSecadero({
  secadero,
  href,
}: {
  secadero: SecaderoVista;
  href: string;
}) {
  const color = COLOR_ESTADO[secadero.estado];

  return (
    <Link
      href={href}
      className={`tarjeta flex items-center gap-3 p-3 transition hover:shadow-md active:scale-[0.99] ${color.borde}`}
    >
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold tabular-nums ${color.chip}`}
      >
        {secadero.numero}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">
          {secadero.tipoNombre}
          {secadero.total > 0 && (
            <span className="ml-1.5 tabular-nums">
              · {numero(secadero.total)} placas
            </span>
          )}
        </span>
        {secadero.contenido.length > 0 && (
          <span className="block truncate text-xs text-slate-500">
            {secadero.contenido.map((c) => c.nombre).join(", ")}
          </span>
        )}
        <span className="block text-xs text-slate-400">
          hace {duracion(minutosDesde(secadero.estadoDesde))}
        </span>
      </span>
    </Link>
  );
}

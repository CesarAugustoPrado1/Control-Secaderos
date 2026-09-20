"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarRegistroYeso, registrarYeso } from "@/lib/acciones/yeso";
import type { TipoYeso } from "@/lib/db/schema";
import { fechaHora, hora, kilos, numero, porcentaje } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Plegable } from "@/components/plegable";
import { Aviso } from "@/components/ui";

export type RegistroYesoVista = {
  id: number;
  tipo: TipoYeso;
  cantidad: number;
  kgPorUnidad: number;
  usuarioNombre: string;
  nota: string | null;
  creadoEn: string;
};

const NOMBRE: Record<TipoYeso, { singular: string; plural: string }> = {
  bolson: { singular: "bolsón", plural: "bolsones" },
  balde_desperdicio: { singular: "balde", plural: "baldes" },
};

/**
 * Yeso consumido y tirado, registrado desde el carrusel.
 *
 * El boton grande carga una unidad de un toque, que es como se usa cuando se
 * registra sobre la marcha. El campo de al lado es para el que carga todo junto
 * al final del dia. Las dos formas escriben lo mismo -eventos que se suman-,
 * asi que el numero del dia no depende de con cual se cargo.
 */
export function YesoCarrusel({
  registros,
  puedeCargar,
  puedeBorrar,
  etiquetaRango,
}: {
  registros: RegistroYesoVista[];
  puedeCargar: boolean;
  puedeBorrar: boolean;
  etiquetaRango: string;
}) {
  const totales = useMemo(() => {
    const acc = {
      bolson: { unidades: 0, kg: 0 },
      balde_desperdicio: { unidades: 0, kg: 0 },
    };
    for (const r of registros) {
      acc[r.tipo].unidades += r.cantidad;
      acc[r.tipo].kg += r.cantidad * r.kgPorUnidad;
    }
    return acc;
  }, [registros]);

  const kgEntrado = totales.bolson.kg;
  const kgTirado = totales.balde_desperdicio.kg;

  return (
    <Plegable
      id="yeso-carrusel"
      titulo="Yeso"
      /* Cerrada se leen igual las dos unidades del dia. Van en el encabezado y
         no adentro por lo mismo que en roturas: el numero es lo que se mira de
         paso, el formulario es lo que ocupa lugar. */
      resumen={
        <span className="text-sm font-semibold text-slate-500">
          {totales.bolson.unidades === 0 &&
          totales.balde_desperdicio.unidades === 0 ? (
            <span className="text-slate-400">sin registros · {etiquetaRango}</span>
          ) : (
            <>
              <span className="font-bold tabular-nums text-blue-700">
                {numero(totales.bolson.unidades)}
              </span>{" "}
              {totales.bolson.unidades === 1 ? "bolsón" : "bolsones"} ·{" "}
              <span className="font-bold tabular-nums text-amber-700">
                {numero(totales.balde_desperdicio.unidades)}
              </span>{" "}
              {totales.balde_desperdicio.unidades === 1 ? "balde" : "baldes"} ·{" "}
              {etiquetaRango}
            </>
          )}
        </span>
      }
    >
      <p className="text-xs text-slate-500">
        Lo que entra a la línea y lo que se tira. Se puede cargar en el momento
        o todo junto al final del día.
      </p>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <BloqueYeso
          tipo="bolson"
          titulo="Bolsones consumidos"
          total={totales.bolson}
          puedeCargar={puedeCargar}
          tono="azul"
        />
        <BloqueYeso
          tipo="balde_desperdicio"
          titulo="Baldes de desperdicio"
          total={totales.balde_desperdicio}
          puedeCargar={puedeCargar}
          tono="ambar"
        />
      </div>

      {/* La relacion entre los dos numeros es la lectura que sirve: los kilos
          sueltos suben y bajan con la produccion del periodo, el porcentaje no. */}
      {kgEntrado > 0 && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600 ring-1 ring-slate-200">
          Se tiró el{" "}
          <strong className="text-slate-900">
            {porcentaje(kgTirado, kgEntrado)}
          </strong>{" "}
          del yeso que entró · {kilos(kgTirado)} de {kilos(kgEntrado)}
        </p>
      )}

      {/* Los kilos salen de multiplicar unidades por un peso configurado, no de
          una balanza. Decirlo evita que el numero se cite como si fuera medido. */}
      {(kgEntrado > 0 || kgTirado > 0) && (
        <p className="mt-2 text-xs text-slate-400">
          Los kilos son estimados: unidades por el peso cargado en
          Administración, no pesaje real.
        </p>
      )}

      {registros.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {registros.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-2 py-1.5 text-sm odd:bg-slate-50"
            >
              <span
                className={`font-bold tabular-nums ${
                  r.tipo === "bolson" ? "text-blue-700" : "text-amber-700"
                }`}
              >
                {numero(r.cantidad)}
              </span>
              <span className="font-semibold text-slate-800">
                {r.cantidad === 1
                  ? NOMBRE[r.tipo].singular
                  : NOMBRE[r.tipo].plural}
                {r.tipo === "balde_desperdicio" && " de desperdicio"}
              </span>
              <span className="text-slate-500">
                {kilos(r.cantidad * r.kgPorUnidad)}
              </span>
              {r.nota && (
                <span className="text-xs text-slate-400">— {r.nota}</span>
              )}
              <span
                className="ml-auto text-xs text-slate-400"
                title={fechaHora(new Date(r.creadoEn))}
              >
                {hora(new Date(r.creadoEn))} · {r.usuarioNombre}
              </span>
              {puedeBorrar && <BotonBorrar registro={r} />}
            </li>
          ))}
        </ul>
      )}

      {registros.length === 0 && (
        <p className="mt-3 py-2 text-center text-sm text-slate-400">
          Todavía no se registró yeso en este período.
        </p>
      )}
    </Plegable>
  );
}

const TONOS = {
  azul: {
    caja: "bg-blue-50 ring-blue-200",
    numero: "text-blue-800",
    boton: "bg-blue-600 hover:bg-blue-700",
  },
  ambar: {
    caja: "bg-amber-50 ring-amber-200",
    numero: "text-amber-800",
    boton: "bg-amber-600 hover:bg-amber-700",
  },
} as const;

function BloqueYeso({
  tipo,
  titulo,
  total,
  puedeCargar,
  tono,
}: {
  tipo: TipoYeso;
  titulo: string;
  total: { unidades: number; kg: number };
  puedeCargar: boolean;
  tono: keyof typeof TONOS;
}) {
  const { ejecutar, enviando, error, setError } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const estilo = TONOS[tono];

  async function guardar(n: number) {
    setError(null);
    await ejecutar(
      () => registrarYeso({ tipo, cantidad: n, nota: nota.trim() || undefined }),
      () => {
        setCantidad("");
        setNota("");
        setAbierto(false);
      },
    );
  }

  return (
    <div className={`rounded-xl p-3 ring-1 ${estilo.caja}`}>
      <p className="text-xs font-semibold text-slate-600">{titulo}</p>

      <p className="mt-0.5 flex items-baseline gap-2">
        <span className={`text-2xl font-bold tabular-nums ${estilo.numero}`}>
          {numero(total.unidades)}
        </span>
        <span className="text-sm text-slate-500">{kilos(total.kg)}</span>
      </p>

      {puedeCargar && (
        <div className="mt-2.5">
          {abierto ? (
            <div className="space-y-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                autoFocus
                className="campo py-2.5 text-center text-lg font-bold tabular-nums"
                value={cantidad}
                placeholder="¿Cuántos?"
                disabled={enviando}
                onChange={(e) => {
                  setError(null);
                  setCantidad(e.target.value);
                }}
              />
              <input
                className="campo py-2"
                value={nota}
                maxLength={500}
                disabled={enviando}
                placeholder="Nota (opcional)"
                onChange={(e) => setNota(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => {
                    const n = Number(cantidad);
                    if (!Number.isInteger(n) || n < 1) {
                      return setError("Escribí un número entero de al menos 1.");
                    }
                    void guardar(n);
                  }}
                  className={`boton flex-1 text-white ${estilo.boton}`}
                >
                  {enviando ? "Guardando…" : "Registrar"}
                </button>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => {
                    setCantidad("");
                    setNota("");
                    setError(null);
                    setAbierto(false);
                  }}
                  className="boton-secundario"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={enviando}
                onClick={() => void guardar(1)}
                className={`boton flex-1 text-white ${estilo.boton}`}
              >
                {enviando ? "…" : "+1"}
              </button>
              <button
                type="button"
                disabled={enviando}
                onClick={() => {
                  setError(null);
                  setAbierto(true);
                }}
                className="boton-secundario"
              >
                Varios
              </button>
            </div>
          )}

          {error && (
            <div className="mt-2">
              <Aviso>{error}</Aviso>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Borrar un registro mal cargado es cosa del admin, como con las roturas. */
function BotonBorrar({ registro }: { registro: RegistroYesoVista }) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const nombre =
    registro.cantidad === 1
      ? NOMBRE[registro.tipo].singular
      : NOMBRE[registro.tipo].plural;

  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={async () => {
          if (
            !window.confirm(
              `¿Borrar el registro de ${registro.cantidad} ${nombre}?`,
            )
          )
            return;
          await ejecutar(
            () => eliminarRegistroYeso({ id: registro.id }),
            () => router.refresh(),
          );
        }}
        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-40"
      >
        {enviando ? "…" : "Borrar"}
      </button>
      {error && (
        <span className="basis-full text-xs font-medium text-red-600">
          {error}
        </span>
      )}
    </>
  );
}

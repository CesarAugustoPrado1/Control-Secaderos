"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Resultado } from "@/lib/acciones/comun";
import type { AccionFila, Analisis } from "@/lib/acciones/planillas";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

/**
 * Bloque de importar/exportar Excel, compartido por secaderos y productos.
 *
 * El paso intermedio -elegir archivo, VER que va a pasar, recien despues
 * aplicar- no es adorno: una planilla mal armada puede tocar 250 registros de
 * una, y nadie deberia enterarse de eso despues.
 */

const MAX_FILAS_VISIBLES = 60;

const ESTILO: Record<AccionFila, { clase: string; etiqueta: string }> = {
  crear: { clase: "bg-emerald-100 text-emerald-900", etiqueta: "ALTA" },
  actualizar: { clase: "bg-sky-100 text-sky-900", etiqueta: "CAMBIO" },
  igual: { clase: "bg-slate-100 text-slate-600", etiqueta: "IGUAL" },
  error: { clase: "bg-red-100 text-red-800", etiqueta: "PROBLEMA" },
};

export function PlanillaExcel({
  titulo,
  hrefExportar,
  analizar,
  importar,
  columnas,
  ayuda,
}: {
  titulo: string;
  hrefExportar: string;
  analizar: (fd: FormData) => Promise<Resultado<Analisis>>;
  importar: (fd: FormData) => Promise<Resultado<Analisis>>;
  columnas: string;
  ayuda: ReactNode;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error } = useAccion();
  const entrada = useRef<HTMLInputElement>(null);

  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  function limpiar() {
    setArchivo(null);
    setAnalisis(null);
    setVerTodas(false);
    if (entrada.current) entrada.current.value = "";
  }

  async function alElegir(f: File | null) {
    setAnalisis(null);
    setVerTodas(false);
    setArchivo(f);
    if (!f) return;
    const fd = new FormData();
    fd.set("archivo", f);
    await ejecutar(() => analizar(fd), setAnalisis);
  }

  async function aplicar() {
    if (!archivo) return;
    const fd = new FormData();
    fd.set("archivo", archivo);
    await ejecutar(() => importar(fd), (datos) => {
      setAnalisis(datos);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="boton-secundario mb-4 w-full sm:w-auto"
      >
        {titulo}
      </button>
    );
  }

  const hayCambios =
    analisis !== null && analisis.crear + analisis.actualizar > 0;
  const aplicado = analisis?.aplicado ?? false;

  return (
    <div className="tarjeta mb-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">{titulo}</h2>
        <button
          type="button"
          onClick={() => {
            limpiar();
            setAbierto(false);
          }}
          className="text-sm font-medium text-slate-500"
        >
          Cerrar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="etiqueta">Bajar a Excel</p>
          <a href={hrefExportar} className="boton-secundario inline-block">
            Descargar planilla
          </a>
          <p className="mt-2 text-xs text-slate-500">
            Trae todo lo que hay cargado hoy. Editala y volvé a subirla desde
            acá.
          </p>
        </div>

        <div>
          <p className="etiqueta">Subir desde Excel</p>
          <input
            ref={entrada}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            onChange={(e) => alElegir(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          <p className="mt-2 text-xs text-slate-500">
            Columnas: <strong>{columnas}</strong>.
          </p>
        </div>
      </div>

      {enviando && (
        <p className="mt-3 text-sm font-medium text-slate-500">
          Leyendo la planilla…
        </p>
      )}
      {error && (
        <div className="mt-3">
          <Aviso>{error}</Aviso>
        </div>
      )}

      {analisis && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <Resumen analisis={analisis} />

          {analisis.filas.length > 0 && (
            <>
              <ul className="mt-3 space-y-1">
                {ordenar(analisis.filas)
                  .slice(0, verTodas ? undefined : MAX_FILAS_VISIBLES)
                  .map((f) => (
                    <li
                      key={f.fila}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg px-2 py-1.5 text-sm odd:bg-slate-50"
                    >
                      <span
                        className={`chip shrink-0 ${ESTILO[f.accion].clase}`}
                      >
                        {ESTILO[f.accion].etiqueta}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {f.etiqueta}
                      </span>
                      <span
                        className={
                          f.accion === "error"
                            ? "text-red-700"
                            : "text-slate-500"
                        }
                      >
                        {f.detalle}
                      </span>
                      <span className="text-xs text-slate-400">
                        fila {f.fila}
                      </span>
                    </li>
                  ))}
              </ul>

              {!verTodas && analisis.filas.length > MAX_FILAS_VISIBLES && (
                <button
                  type="button"
                  onClick={() => setVerTodas(true)}
                  className="boton-secundario mt-2 w-full"
                >
                  Ver las {analisis.filas.length - MAX_FILAS_VISIBLES} filas
                  restantes
                </button>
              )}
            </>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {aplicado ? (
              <>
                <Aviso tono="exito">Listo. {resumenAplicado(analisis)}</Aviso>
                <button
                  type="button"
                  onClick={limpiar}
                  className="boton-secundario"
                >
                  Subir otra planilla
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={enviando || !hayCambios || analisis.error > 0}
                  onClick={aplicar}
                  className="boton-primario disabled:opacity-40"
                >
                  {enviando ? "Aplicando…" : textoAplicar(analisis)}
                </button>
                <button
                  type="button"
                  onClick={limpiar}
                  className="text-sm font-medium text-slate-500"
                >
                  Descartar
                </button>
              </>
            )}
          </div>

          {!aplicado && analisis.error > 0 && (
            <p className="mt-2 text-xs font-medium text-red-600">
              Mientras haya filas con problemas no se importa nada. Corregilas
              en el Excel y volvé a subirlo.
            </p>
          )}
          {!aplicado && analisis.error === 0 && !hayCambios && (
            <p className="mt-2 text-xs text-slate-500">
              La planilla coincide con lo que ya está cargado: no hay nada que
              aplicar.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 text-xs text-slate-500">{ayuda}</div>
    </div>
  );
}

function resumenAplicado({ crear, actualizar }: Analisis): string {
  const altas = crear === 1 ? "se dio de alta 1" : `se dieron de alta ${crear}`;
  const cambios =
    actualizar === 1 ? "se actualizó 1" : `se actualizaron ${actualizar}`;
  const partes = [crear > 0 ? altas : null, actualizar > 0 ? cambios : null]
    .filter(Boolean)
    .join(" y ");
  const frase = partes || "no hubo nada que cambiar";
  return frase.charAt(0).toUpperCase() + frase.slice(1) + ".";
}

function textoAplicar(analisis: Analisis): string {
  const n = analisis.crear + analisis.actualizar;
  return n === 1 ? "Aplicar 1 cambio" : `Aplicar ${n} cambios`;
}

/** Problemas primero: es lo unico que obliga a hacer algo antes de seguir. */
function ordenar(filas: Analisis["filas"]) {
  const peso: Record<AccionFila, number> = {
    error: 0,
    crear: 1,
    actualizar: 2,
    igual: 3,
  };
  return [...filas].sort(
    (a, b) => peso[a.accion] - peso[b.accion] || a.fila - b.fila,
  );
}

function Resumen({ analisis }: { analisis: Analisis }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Contador
        n={analisis.crear}
        uno="alta"
        varios="altas"
        clase={ESTILO.crear.clase}
      />
      <Contador
        n={analisis.actualizar}
        uno="cambio"
        varios="cambios"
        clase={ESTILO.actualizar.clase}
      />
      <Contador
        n={analisis.igual}
        uno="sin cambios"
        varios="sin cambios"
        clase={ESTILO.igual.clase}
      />
      {analisis.error > 0 && (
        <Contador
          n={analisis.error}
          uno="con problemas"
          varios="con problemas"
          clase={ESTILO.error.clase}
        />
      )}
      {analisis.sinTocar > 0 && (
        <Contador
          n={analisis.sinTocar}
          uno="no figura en la planilla y queda como está"
          varios="no figuran en la planilla y quedan como están"
          clase="bg-slate-100 text-slate-600"
        />
      )}
    </div>
  );
}

function Contador({
  n,
  uno,
  varios,
  clase,
}: {
  n: number;
  uno: string;
  varios: string;
  clase: string;
}) {
  return (
    <span className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${clase}`}>
      {n} {n === 1 ? uno : varios}
    </span>
  );
}

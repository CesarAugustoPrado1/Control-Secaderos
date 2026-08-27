"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { entrarAHorno, salirDeHorno } from "@/lib/acciones/flujo";
import type { SecaderoVista } from "@/lib/consultas";
import { ETIQUETA_TAMANO } from "@/lib/estados";
import { duracion, minutosDesde, numero } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Aviso, Titulo } from "@/components/ui";
import {
  EditorRoturas,
  convertirRoturas,
  validarRoturas,
  type MapaRoturas,
  type Motivo,
  type OpcionModelo,
} from "@/components/editor-roturas";

type Roturas = Record<number, MapaRoturas>;

const opcionesDe = (s: SecaderoVista): OpcionModelo[] =>
  s.contenido.map((c) => ({
    productoId: c.productoId,
    nombre: c.nombre,
    tope: c.cantidad,
  }));

export function PanelHorno({
  enHorno,
  humedos,
  motivos,
  capacidadHorno,
}: {
  enHorno: SecaderoVista[];
  humedos: SecaderoVista[];
  motivos: Motivo[];
  capacidadHorno: number;
}) {
  const router = useRouter();

  /**
   * El caso normal es vaciar el horno completo, asi que todo arranca marcado.
   *
   * Guardamos los DESmarcados, no los marcados: si guardaramos los marcados,
   * al meter secaderos al horno la lista de arriba se actualizaria pero el
   * estado no, y los recien entrados quedarian sin marcar hasta recargar la
   * pagina. Con los excluidos, todo lo que aparece esta marcado por defecto y
   * ademas se respeta lo que el operario haya destildado.
   */
  const [excluidos, setExcluidos] = useState<Set<number>>(new Set());
  const [aMeter, setAMeter] = useState<Set<number>>(new Set());
  const [roturas, setRoturas] = useState<Roturas>({});

  const salida = useAccion();
  const entrada = useAccion();

  const aSacar = useMemo(
    () =>
      new Set(
        enHorno.filter((s) => !excluidos.has(s.id)).map((s) => s.id),
      ),
    [enHorno, excluidos],
  );

  const lugaresLibres = capacidadHorno - enHorno.length + aSacar.size;

  function alternarSacar(id: number) {
    setExcluidos((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function alternarMeter(id: number) {
    setAMeter((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function armarSeleccion(ids: Set<number>, lista: SecaderoVista[]) {
    return lista
      .filter((s) => ids.has(s.id))
      .map((s) => ({
        secaderoId: s.id,
        roturas: convertirRoturas(roturas[s.id] ?? {}),
      }));
  }

  function primerProblema(ids: Set<number>, lista: SecaderoVista[]) {
    for (const s of lista) {
      if (!ids.has(s.id)) continue;
      const problema = validarRoturas(roturas[s.id] ?? {}, opcionesDe(s));
      if (problema) return `Secadero ${s.numero}: ${problema}`;
    }
    return null;
  }

  async function sacar() {
    const problema = primerProblema(aSacar, enHorno);
    if (problema) return salida.setError(problema);

    await salida.ejecutar(
      () => salirDeHorno({ seleccion: armarSeleccion(aSacar, enHorno) }),
      () => {
        setExcluidos(new Set());
        setRoturas({});
        router.refresh();
      },
    );
  }

  async function meter() {
    const problema = primerProblema(aMeter, humedos);
    if (problema) return entrada.setError(problema);

    if (aMeter.size > lugaresLibres) {
      return entrada.setError(
        `Solo quedan ${lugaresLibres} lugares en el horno y estás metiendo ${aMeter.size}. Sacá los secos primero.`,
      );
    }

    await entrada.ejecutar(
      () => entrarAHorno({ seleccion: armarSeleccion(aMeter, humedos) }),
      () => {
        setAMeter(new Set());
        setRoturas({});
        router.refresh();
      },
    );
  }

  return (
    <div className="space-y-8">
      <Titulo
        detalle={`${enHorno.length} de ${capacidadHorno} lugares ocupados`}
      >
        Horno
      </Titulo>

      {/* ---------------- Sacar ---------------- */}
      <section>
        <EncabezadoSeccion
          titulo="Sacar del horno"
          detalle={
            enHorno.length
              ? "Destildá el que no haya terminado de secar."
              : undefined
          }
          contador={enHorno.length}
        />

        {enHorno.length === 0 ? (
          <p className="tarjeta px-4 py-8 text-center text-sm text-slate-500">
            El horno está vacío.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {enHorno.map((s) => (
                <FilaSecadero
                  key={s.id}
                  secadero={s}
                  elegido={aSacar.has(s.id)}
                  alAlternar={() => alternarSacar(s.id)}
                  motivos={motivos}
                  roturas={roturas[s.id] ?? {}}
                  alCambiarRoturas={(v) =>
                    setRoturas((prev) => ({ ...prev, [s.id]: v }))
                  }
                  deshabilitado={salida.enviando}
                  acento="horno"
                />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <BotonSeleccion onClick={() => setExcluidos(new Set())}>
                Marcar todos
              </BotonSeleccion>
              <BotonSeleccion
                onClick={() => setExcluidos(new Set(enHorno.map((s) => s.id)))}
              >
                Ninguno
              </BotonSeleccion>
            </div>

            {salida.error && (
              <div className="mt-3">
                <Aviso>{salida.error}</Aviso>
              </div>
            )}

            <button
              type="button"
              onClick={() => void sacar()}
              disabled={salida.enviando || aSacar.size === 0}
              className="boton w-full mt-3 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {salida.enviando
                ? "Guardando…"
                : `Sacar ${aSacar.size} ${aSacar.size === 1 ? "secadero" : "secaderos"} → Secos`}
            </button>
          </>
        )}
      </section>

      {/* ---------------- Meter ---------------- */}
      <section>
        <EncabezadoSeccion
          titulo="Meter al horno"
          detalle={
            humedos.length
              ? `${lugaresLibres} ${lugaresLibres === 1 ? "lugar libre" : "lugares libres"} si sacás los marcados arriba`
              : undefined
          }
          contador={humedos.length}
        />

        {humedos.length === 0 ? (
          <p className="tarjeta px-4 py-8 text-center text-sm text-slate-500">
            No hay secaderos húmedos esperando.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {humedos.map((s) => (
                <FilaSecadero
                  key={s.id}
                  secadero={s}
                  elegido={aMeter.has(s.id)}
                  alAlternar={() => alternarMeter(s.id)}
                  motivos={motivos}
                  roturas={roturas[s.id] ?? {}}
                  alCambiarRoturas={(v) =>
                    setRoturas((prev) => ({ ...prev, [s.id]: v }))
                  }
                  deshabilitado={entrada.enviando}
                  acento="humedo"
                />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <BotonSeleccion
                onClick={() =>
                  setAMeter(
                    new Set(
                      humedos.slice(0, Math.max(0, lugaresLibres)).map((s) => s.id),
                    ),
                  )
                }
              >
                Llenar el horno ({Math.min(humedos.length, Math.max(0, lugaresLibres))})
              </BotonSeleccion>
              <BotonSeleccion onClick={() => setAMeter(new Set())}>
                Ninguno
              </BotonSeleccion>
            </div>

            {entrada.error && (
              <div className="mt-3">
                <Aviso>{entrada.error}</Aviso>
              </div>
            )}

            <button
              type="button"
              onClick={() => void meter()}
              disabled={entrada.enviando || aMeter.size === 0}
              className="boton w-full mt-3 bg-orange-600 text-white hover:bg-orange-700"
            >
              {entrada.enviando
                ? "Guardando…"
                : `Meter ${aMeter.size} al horno`}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function EncabezadoSeccion({
  titulo,
  detalle,
  contador,
}: {
  titulo: string;
  detalle?: string;
  contador: number;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">{titulo}</h2>
        <span className="chip bg-slate-200 text-slate-700">{contador}</span>
      </div>
      {detalle && <p className="mt-0.5 text-sm text-slate-500">{detalle}</p>}
    </div>
  );
}

function BotonSeleccion(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
    />
  );
}

function FilaSecadero({
  secadero,
  elegido,
  alAlternar,
  motivos,
  roturas,
  alCambiarRoturas,
  deshabilitado,
  acento,
}: {
  secadero: SecaderoVista;
  elegido: boolean;
  alAlternar: () => void;
  motivos: Motivo[];
  roturas: MapaRoturas;
  alCambiarRoturas: (v: MapaRoturas) => void;
  deshabilitado?: boolean;
  acento: "horno" | "humedo";
}) {
  const [abierto, setAbierto] = useState(false);

  const totalRotas = useMemo(
    () => Object.values(roturas).reduce((a, r) => a + (r.cantidad || 0), 0),
    [roturas],
  );

  const colorElegido =
    acento === "horno"
      ? "bg-orange-50 ring-orange-300"
      : "bg-blue-50 ring-blue-300";

  return (
    <div
      className={`rounded-2xl ring-1 transition ${
        elegido ? colorElegido : "bg-white ring-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={alAlternar}
        disabled={deshabilitado}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold ring-2 transition ${
            elegido
              ? "bg-slate-900 text-white ring-slate-900"
              : "bg-white text-transparent ring-slate-300"
          }`}
          aria-hidden
        >
          ✓
        </span>

        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-base font-bold tabular-nums text-white">
          {secadero.numero}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">
            {numero(secadero.total)} placas ·{" "}
            {ETIQUETA_TAMANO[secadero.tamano].toLowerCase()}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {secadero.contenido.map((c) => c.nombre).join(", ") || "sin placas"}
          </span>
          <span className="block text-xs font-medium text-slate-500">
            hace {duracion(minutosDesde(secadero.estadoDesde))}
          </span>
        </span>
      </button>

      {elegido && (
        <div className="border-t border-slate-200/70 px-3 py-2">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="text-xs font-semibold text-slate-600 underline underline-offset-4"
          >
            {totalRotas > 0
              ? `${totalRotas} placas rotas registradas`
              : abierto
                ? "Ocultar roturas"
                : "+ Registrar roturas"}
          </button>

          {abierto && (
            <div className="mt-3 pb-1">
              <EditorRoturas
                opciones={opcionesDe(secadero)}
                motivos={motivos}
                valor={roturas}
                alCambiar={alCambiarRoturas}
                deshabilitado={deshabilitado}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

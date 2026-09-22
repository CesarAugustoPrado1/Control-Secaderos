"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  anularMovimiento,
  corregirMovimiento,
} from "@/lib/acciones/correcciones";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";
import {
  EditorRoturas,
  convertirRoturas,
  validarRoturas,
  type MapaRoturas,
  type Motivo,
  type OpcionModelo,
} from "@/components/editor-roturas";

/**
 * Las dos formas de arreglar un movimiento que no es una carga: cambiar lo que
 * se rompio, o anularlo entero. La carga se corrige con su propio formulario
 * (`FormularioCarga` en modo correccion), porque ahi lo que cambia es que y
 * cuanto se cargo.
 */

/** El motivo, igual en las dos: obligatorio, corto, en palabras del piso. */
function CampoMotivo({
  id,
  valor,
  alCambiar,
  deshabilitado,
  ejemplo,
}: {
  id: string;
  valor: string;
  alCambiar: (v: string) => void;
  deshabilitado: boolean;
  ejemplo: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="etiqueta">
        ¿Qué pasó?
      </label>
      <textarea
        id={id}
        className="campo min-h-16"
        value={valor}
        maxLength={300}
        disabled={deshabilitado}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={ejemplo}
      />
    </div>
  );
}

/**
 * Corregir las roturas de una entrada, salida, secado al sol, descarga o
 * devolucion.
 *
 * El contenido de partida no se toca: vino del paso anterior, que es de otro.
 * Lo que decidio este operario es que se rompio, y eso es lo que se corrige.
 * Los topes del editor son lo que habia ANTES del movimiento, asi que se
 * puede marcar mas de lo que se habia marcado.
 */
export function CorregirRoturas({
  movimientoId,
  opciones,
  motivos,
  inicial,
  volverA,
}: {
  movimientoId: number;
  opciones: OpcionModelo[];
  motivos: Motivo[];
  inicial: MapaRoturas;
  volverA: string;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();
  const [roturas, setRoturas] = useState<MapaRoturas>(inicial);
  const [motivo, setMotivo] = useState("");

  const total = Object.values(roturas).reduce((a, r) => a + (r.cantidad || 0), 0);

  async function guardar() {
    const problema = validarRoturas(roturas, opciones);
    if (problema) return setError(problema);
    if (motivo.trim().length < 3) {
      return setError("Escribí en pocas palabras qué pasó.");
    }
    await ejecutar(
      () =>
        corregirMovimiento({
          movimientoId,
          motivo: motivo.trim(),
          roturas: convertirRoturas(roturas),
        }),
      () => {
        router.push(volverA);
        router.refresh();
      },
    );
  }

  return (
    <section className="tarjeta space-y-4 p-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">
          Corregir las roturas
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Dejá lo que de verdad se rompió. Si no se rompió nada, borrá las
          cantidades.
        </p>
      </div>

      <EditorRoturas
        opciones={opciones}
        motivos={motivos}
        valor={roturas}
        alCambiar={(v) => {
          setError(null);
          setRoturas(v);
        }}
        deshabilitado={enviando}
      />

      <CampoMotivo
        id="motivo-roturas"
        valor={motivo}
        alCambiar={(v) => {
          setError(null);
          setMotivo(v);
        }}
        deshabilitado={enviando}
        ejemplo="Por ejemplo: eran 5 rotas, no 2"
      />

      {error && <Aviso>{error}</Aviso>}

      <button
        type="button"
        onClick={() => void guardar()}
        disabled={enviando}
        className="boton-primario w-full"
      >
        {enviando
          ? "Guardando…"
          : total === 0
            ? "Guardar corrección: sin roturas"
            : `Guardar corrección: ${total} ${total === 1 ? "rota" : "rotas"}`}
      </button>
    </section>
  );
}

/**
 * Anular el movimiento entero.
 *
 * Es para lo que no se arregla cambiando un numero: cargar el 45 cuando era el
 * 54, meter al horno uno que no iba, marcar como seco uno que nunca salio.
 * Antes de confirmar se dice a donde vuelve el secadero, porque anular no es
 * borrar un renglon: es mover un secadero.
 *
 * Arranca plegado y en rojo suave a proposito. Es la excepcion dentro de la
 * excepcion, y no tiene que ser lo primero que se toca cuando se entra a
 * arreglar una cantidad.
 */
export function AnularMovimiento({
  movimientoId,
  secaderoNumero,
  efecto,
  volverA,
}: {
  movimientoId: number;
  secaderoNumero: number;
  /** "vuelve a quedar vacio, como si no se hubiera cargado". */
  efecto: string;
  volverA: string;
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function anular() {
    if (motivo.trim().length < 3) {
      return setError("Escribí en pocas palabras qué pasó.");
    }
    if (
      !window.confirm(
        `¿Anular este movimiento?\n\nEl secadero ${secaderoNumero} ${efecto}.`,
      )
    ) {
      return;
    }
    await ejecutar(
      () => anularMovimiento({ movimientoId, motivo: motivo.trim() }),
      () => {
        router.push(volverA);
        router.refresh();
      },
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="w-full rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
      >
        Anular el movimiento entero
        <span className="block text-xs font-normal text-red-600/80">
          Si no era este secadero, o no tenía que moverse.
        </span>
      </button>
    );
  }

  return (
    <section className="tarjeta space-y-4 p-4 ring-1 ring-red-200">
      <div>
        <h2 className="text-base font-bold text-red-800">Anular</h2>
        <p className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
          El secadero <strong>{secaderoNumero}</strong> {efecto}. El movimiento
          queda en el historial marcado como anulado, con tu nombre y el motivo.
        </p>
      </div>

      <CampoMotivo
        id="motivo-anular"
        valor={motivo}
        alCambiar={(v) => {
          setError(null);
          setMotivo(v);
        }}
        deshabilitado={enviando}
        ejemplo="Por ejemplo: cargué el 45 y era el 54"
      />

      {error && <Aviso>{error}</Aviso>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          disabled={enviando}
          className="boton-secundario"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void anular()}
          disabled={enviando}
          className="boton flex-1 bg-red-600 text-white hover:bg-red-700"
        >
          {enviando ? "Anulando…" : "Anular"}
        </button>
      </div>
    </section>
  );
}

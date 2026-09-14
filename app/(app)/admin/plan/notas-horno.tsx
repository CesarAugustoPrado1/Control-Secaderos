"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { guardarNotasHorno } from "@/lib/acciones/plan";
import { etiquetaDia } from "@/lib/rangos";
import { useAccion } from "@/components/usar-accion";
import { Aviso } from "@/components/ui";

type NotasDia = { fecha: string; carga: string | null; descarga: string | null };

/**
 * Las dos indicaciones del dia para el hornero.
 *
 * Van separadas porque son dos momentos distintos de su trabajo: la de
 * descargar la lee antes de sacar y la de cargar antes de meter. En la pantalla
 * del horno se muestran en el mismo orden en que hace las dos cosas.
 */
export function EditorNotasHorno({
  fecha,
  carga: cargaInicial,
  descarga: descargaInicial,
  semana,
  notasSemana,
}: {
  fecha: string;
  carga: string | null;
  descarga: string | null;
  semana: string[];
  notasSemana: NotasDia[];
}) {
  const router = useRouter();
  const { ejecutar, enviando, error, setError } = useAccion();
  const [descarga, setDescarga] = useState(descargaInicial ?? "");
  const [carga, setCarga] = useState(cargaInicial ?? "");
  const [aviso, setAviso] = useState<string | null>(null);

  const vacias = !carga.trim() && !descarga.trim();

  // Suele repetirse de un dia al otro: copiar tiene que ser un toque.
  const otrosDias = semana
    .map((f) => notasSemana.find((n) => n.fecha === f))
    .filter((n): n is NotasDia => !!n && n.fecha !== fecha);

  function cambiar(set: (v: string) => void, valor: string) {
    setError(null);
    setAviso(null);
    set(valor);
  }

  async function guardar() {
    await ejecutar(
      () =>
        guardarNotasHorno({
          fecha,
          carga: carga.trim() || null,
          descarga: descarga.trim() || null,
        }),
      () => {
        setAviso(vacias ? "Se borraron las notas de ese día." : "Notas guardadas.");
        router.refresh();
      },
    );
  }

  return (
    <section className="tarjeta p-4">
      <h2 className="mb-3 text-base font-bold text-slate-900">
        Horno · {etiquetaDia(fecha)}
      </h2>

      {otrosDias.length > 0 && (
        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
          <p className="text-xs font-semibold text-slate-600">
            Copiar de otro día
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {otrosDias.map((n) => (
              <button
                key={n.fecha}
                type="button"
                onClick={() => {
                  setDescarga(n.descarga ?? "");
                  setCarga(n.carga ?? "");
                  setError(null);
                  setAviso(`Copiado de ${etiquetaDia(n.fecha)}. Revisá y guardá.`);
                }}
                className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100"
              >
                {etiquetaDia(n.fecha)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <label className="block">
          <span className="etiqueta">Para descargar el horno</span>
          <textarea
            className="campo min-h-24"
            value={descarga}
            maxLength={500}
            disabled={enviando}
            onChange={(e) => cambiar(setDescarga, e.target.value)}
            placeholder="ej: sacar primero las guardas, dejar el 42 una hora más"
          />
        </label>

        <label className="block">
          <span className="etiqueta">Para cargar el horno</span>
          <textarea
            className="campo min-h-24"
            value={carga}
            maxLength={500}
            disabled={enviando}
            onChange={(e) => cambiar(setCarga, e.target.value)}
            placeholder="ej: priorizar Ekos, no mezclar grandes con chicos"
          />
        </label>
      </div>

      {error && (
        <div className="mt-3">
          <Aviso>{error}</Aviso>
        </div>
      )}
      {aviso && !error && (
        <div className="mt-3">
          <Aviso tono="exito">{aviso}</Aviso>
        </div>
      )}

      <button
        type="button"
        onClick={() => void guardar()}
        disabled={enviando}
        className="boton-primario mt-3 w-full"
      >
        {enviando
          ? "Guardando…"
          : vacias
            ? "Guardar (deja el día sin notas)"
            : "Guardar notas"}
      </button>
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  entrarAHorno,
  salirDeHorno,
  secarSinHorno,
} from "@/lib/acciones/flujo";
import type { SecaderoVista } from "@/lib/consultas";
import { duracion, minutosDesde, numero } from "@/lib/formato";
import { useAccion } from "@/components/usar-accion";
import { Aviso, ChipTipo, Titulo } from "@/components/ui";
import { MarcasSecadero } from "@/components/marcas-secadero";
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
  reproceso,
}: {
  enHorno: SecaderoVista[];
  humedos: SecaderoVista[];
  motivos: Motivo[];
  capacidadHorno: number;
  /** Ids de los secaderos que no secaron bien y estan siendo rehorneados. */
  reproceso: number[];
}) {
  const enReproceso = useMemo(() => new Set(reproceso), [reproceso]);
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
  const [productoFiltro, setProductoFiltro] = useState<string | null>(null);

  const salida = useAccion();
  const entrada = useAccion();
  const sol = useAccion();

  const aSacar = useMemo(
    () =>
      new Set(
        enHorno.filter((s) => !excluidos.has(s.id)).map((s) => s.id),
      ),
    [enHorno, excluidos],
  );

  /**
   * El horno no es un solo cupo. Los tipos con estructura propia -las guardas-
   * tienen sus lugares aparte y no compiten con los grandes y chicos, asi que
   * un horno lleno de guardas no puede frenar la entrada de un grande.
   *
   * La clave null es el cupo general, que comparten los tipos sin cupo propio.
   * Los cupos se descubren mirando los secaderos que hay: si de un tipo no hay
   * ninguno ni adentro ni esperando, mostrar su cupo no le sirve a nadie.
   */
  const cupos = useMemo(() => {
    const info = new Map<number | null, { nombre: string; tope: number }>();
    info.set(null, { nombre: "Horno", tope: capacidadHorno });
    for (const s of [...enHorno, ...humedos]) {
      if (s.cupoHorno !== null && !info.has(s.tipoId)) {
        info.set(s.tipoId, { nombre: s.tipoNombre, tope: s.cupoHorno });
      }
    }

    const claveDe = (s: SecaderoVista) =>
      s.cupoHorno === null ? null : s.tipoId;

    return [...info.entries()].map(([clave, { nombre, tope }]) => {
      const dentro = enHorno.filter((s) => claveDe(s) === clave).length;
      const saliendo = enHorno.filter(
        (s) => claveDe(s) === clave && aSacar.has(s.id),
      ).length;
      return {
        clave,
        nombre,
        tope,
        dentro,
        libres: tope - dentro + saliendo,
      };
    });
  }, [enHorno, humedos, aSacar, capacidadHorno]);

  const cupoDe = (s: SecaderoVista) => (s.cupoHorno === null ? null : s.tipoId);
  const lugaresLibres = cupos.reduce((a, c) => a + Math.max(0, c.libres), 0);
  const hayCuposPropios = cupos.length > 1;

  /** Productos que hay esperando, con cuantos secaderos de cada uno. */
  const productosEnEspera = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const s of humedos) {
      for (const c of s.contenido) {
        cuenta.set(c.nombre, (cuenta.get(c.nombre) ?? 0) + 1);
      }
    }
    return [...cuenta.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [humedos]);

  const humedosVisibles = useMemo(
    () =>
      productoFiltro
        ? humedos.filter((s) =>
            s.contenido.some((c) => c.nombre === productoFiltro),
          )
        : humedos,
    [humedos, productoFiltro],
  );

  /**
   * Marca los N mas viejos de lo que se esta viendo, sin pasarse de ningun
   * cupo. Va uno por uno y saltea el que ya no entra en el suyo: si las guardas
   * se llenaron, sigue tomando grandes en vez de cortar la seleccion ahi.
   */
  function elegirMasViejos(cuantos: number) {
    const restante = new Map(cupos.map((c) => [c.clave, Math.max(0, c.libres)]));
    const elegidos = new Set<number>();
    for (const s of humedosVisibles) {
      if (elegidos.size >= cuantos) break;
      const clave = cupoDe(s);
      const libre = restante.get(clave) ?? 0;
      if (libre <= 0) continue;
      elegidos.add(s.id);
      restante.set(clave, libre - 1);
    }
    setAMeter(elegidos);
  }

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

    // Se valida cupo por cupo: meter 4 guardas no consume lugares de grandes.
    for (const c of cupos) {
      const entrando = humedos.filter(
        (s) => aMeter.has(s.id) && cupoDe(s) === c.clave,
      ).length;
      if (entrando > c.libres) {
        return entrada.setError(
          `Para ${c.nombre} quedan ${Math.max(0, c.libres)} ${
            c.libres === 1 ? "lugar" : "lugares"
          } y estás metiendo ${entrando}. Sacá los secos primero.`,
        );
      }
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

  /**
   * humedo -> seco sin pasar por el horno. No consume lugares ni valida cupos:
   * justamente, el secadero nunca entra. Pide confirmacion porque saltea el
   * horno y eso no se deshace desde esta pantalla.
   */
  async function secarAlSol() {
    const problema = primerProblema(aMeter, humedos);
    if (problema) return sol.setError(problema);

    const cuantos = aMeter.size;
    if (
      !window.confirm(
        `¿Pasar ${cuantos} ${cuantos === 1 ? "secadero" : "secaderos"} a secos sin hornear?\n\n` +
          "Usá esto solo si secaron al sol. No van a contar en el tiempo de horno.",
      )
    ) {
      return;
    }

    await sol.ejecutar(
      () => secarSinHorno({ seleccion: armarSeleccion(aMeter, humedos) }),
      () => {
        setAMeter(new Set());
        setRoturas({});
        router.refresh();
      },
    );
  }

  return (
    <div className="space-y-8">
      {/* Con cupos separados, un solo "12 de 19" mentiria: esconderia que las
          guardas pueden estar llenas mientras sobran lugares de grandes. */}
      <Titulo
        detalle={cupos
          .map((c) => `${c.nombre}: ${c.dentro} de ${c.tope}`)
          .join(" · ")}
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
                  reproceso={enReproceso.has(s.id)}
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
              ? hayCuposPropios
                ? `Libres si sacás los marcados arriba — ${cupos
                    .map((c) => `${c.nombre}: ${Math.max(0, c.libres)}`)
                    .join(" · ")}`
                : `${lugaresLibres} ${lugaresLibres === 1 ? "lugar libre" : "lugares libres"} si sacás los marcados arriba`
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
            {/* Filtro por producto: el horno rinde mejor con una hornada de un
                solo producto, asi que se puede acotar la lista antes de elegir.
                Los secaderos ya vienen del mas viejo al mas nuevo. */}
            {productosEnEspera.length > 1 && (
              <div className="-mx-4 mb-3 overflow-x-auto px-4">
                <div className="flex min-w-max gap-1.5">
                  <BotonSeleccion
                    onClick={() => setProductoFiltro(null)}
                    activo={productoFiltro === null}
                  >
                    Todos ({humedos.length})
                  </BotonSeleccion>
                  {productosEnEspera.map((p) => (
                    <BotonSeleccion
                      key={p.nombre}
                      onClick={() => setProductoFiltro(p.nombre)}
                      activo={productoFiltro === p.nombre}
                    >
                      {p.nombre} ({p.cantidad})
                    </BotonSeleccion>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {humedosVisibles.map((s) => (
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
                  reproceso={enReproceso.has(s.id)}
                />
              ))}
              {humedosVisibles.length === 0 && (
                <p className="tarjeta px-4 py-8 text-center text-sm text-slate-500">
                  No hay secaderos húmedos con ese producto.
                </p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <BotonSeleccion onClick={() => elegirMasViejos(lugaresLibres)}>
                Los {Math.min(humedosVisibles.length, Math.max(0, lugaresLibres))} más
                viejos
              </BotonSeleccion>
              {[5, 15].map(
                (n) =>
                  humedosVisibles.length > n &&
                  lugaresLibres > n && (
                    <BotonSeleccion key={n} onClick={() => elegirMasViejos(n)}>
                      Los {n} más viejos
                    </BotonSeleccion>
                  ),
              )}
              <BotonSeleccion onClick={() => setAMeter(new Set())}>
                Ninguno
              </BotonSeleccion>
            </div>

            {(entrada.error || sol.error) && (
              <div className="mt-3">
                <Aviso>{entrada.error ?? sol.error}</Aviso>
              </div>
            )}

            <button
              type="button"
              onClick={() => void meter()}
              disabled={entrada.enviando || sol.enviando || aMeter.size === 0}
              className="boton w-full mt-3 bg-orange-600 text-white hover:bg-orange-700"
            >
              {entrada.enviando
                ? "Guardando…"
                : `Meter ${aMeter.size} al horno`}
            </button>

            {/* Salida por afuera del horno, con la misma seleccion de arriba.
                Va abajo y en secundario porque es la excepcion, no el camino
                de todos los dias. */}
            <button
              type="button"
              onClick={() => void secarAlSol()}
              disabled={entrada.enviando || sol.enviando || aMeter.size === 0}
              className="boton mt-2 w-full bg-yellow-100 text-yellow-900 ring-1 ring-yellow-300 hover:bg-yellow-200"
            >
              {sol.enviando
                ? "Guardando…"
                : `Secaron al sol: pasar ${aMeter.size} a secos sin hornear`}
            </button>
            <p className="mt-1.5 text-center text-xs text-slate-500">
              No ocupan lugar en el horno y no cuentan en el tiempo de horno.
            </p>
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

function BotonSeleccion({
  activo,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { activo?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
        activo
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
      }`}
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
  reproceso,
}: {
  secadero: SecaderoVista;
  elegido: boolean;
  alAlternar: () => void;
  motivos: Motivo[];
  roturas: MapaRoturas;
  alCambiarRoturas: (v: MapaRoturas) => void;
  deshabilitado?: boolean;
  acento: "horno" | "humedo";
  reproceso?: boolean;
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
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">
            {numero(secadero.total)} placas
            <ChipTipo id={secadero.tipoId} nombre={secadero.tipoNombre} />
          </span>
          <span className="block truncate text-xs text-slate-500">
            {secadero.contenido.map((c) => c.nombre).join(", ") || "sin placas"}
          </span>
          <MarcasSecadero
            total={secadero.total}
            capacidad={secadero.capacidad}
            productos={secadero.contenido.length}
          />
          {reproceso && (
            // Visible tambien mientras esta adentro: el hornero tiene que
            // acordarse de sacarlo antes que el resto para que no se queme.
            <span className="mt-1 inline-block rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
              {acento === "horno"
                ? "REHORNEADO · sacarlo antes"
                : "NO SECÓ · va de nuevo al horno"}
            </span>
          )}
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

import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { leerConfig, secaderosConContenido } from "@/lib/consultas";
import type { Estado } from "@/lib/db/schema";
import { COLOR_ESTADO, ORDEN_ESTADOS, TITULO_ESTADO } from "@/lib/estados";
import { duracion, minutosDesde, numero } from "@/lib/formato";
import { rutaInicial } from "@/lib/permisos";
import { Titulo, Vacio } from "@/components/ui";

export const metadata = { title: "Tablero · Secaderos" };

/** Datos siempre frescos: el tablero es la foto del piso de planta. */
export const dynamic = "force-dynamic";

export default async function PaginaTablero() {
  const sesion = await requerirSesion();
  const [secaderos, cfg] = await Promise.all([
    secaderosConContenido(),
    leerConfig(),
  ]);

  const porEstado = Object.fromEntries(
    ORDEN_ESTADOS.map((estado) => [
      estado,
      secaderos
        .filter((s) => s.estado === estado)
        .sort((a, b) => a.estadoDesde.getTime() - b.estadoDesde.getTime()),
    ]),
  ) as Record<Estado, typeof secaderos>;

  const placasEnCircuito = secaderos.reduce((a, s) => a + s.total, 0);

  return (
    <>
      <Titulo
        detalle={`${secaderos.length} secaderos activos · ${numero(placasEnCircuito)} placas en circuito`}
        accion={
          sesion.rol !== "auditor" && sesion.rol !== "admin" ? (
            <Link href={rutaInicial(sesion.rol)} className="boton-secundario">
              Ir a mi pantalla
            </Link>
          ) : undefined
        }
      >
        Tablero
      </Titulo>

      {secaderos.length === 0 ? (
        <Vacio
          titulo="Todavía no hay secaderos cargados"
          detalle="Un administrador tiene que darlos de alta desde Administración."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {ORDEN_ESTADOS.map((estado) => {
            const lista = porEstado[estado];
            const color = COLOR_ESTADO[estado];
            return (
              <section key={estado}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${color.punto}`} />
                    <h2 className="text-sm font-bold text-slate-800">
                      {TITULO_ESTADO[estado]}
                    </h2>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-slate-500">
                    {lista.length}
                    {estado === "horno" && (
                      <span className="font-medium text-slate-400">
                        /{cfg.capacidad_horno}
                      </span>
                    )}
                  </span>
                </div>

                <div className={`space-y-2 rounded-2xl p-2 ${color.fondo}`}>
                  {lista.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">
                      Ninguno
                    </p>
                  ) : (
                    lista.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-xl bg-white p-2.5 shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${color.chip}`}
                          >
                            {s.numero}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700">
                              {s.total > 0
                                ? `${numero(s.total)} placas`
                                : s.tamano}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              hace {duracion(minutosDesde(s.estadoDesde))}
                            </p>
                          </div>
                        </div>
                        {s.contenido.length > 0 && (
                          <p className="mt-1.5 truncate text-[11px] text-slate-500">
                            {s.contenido.map((c) => c.nombre).join(", ")}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

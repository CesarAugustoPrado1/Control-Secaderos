import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { leerConfig, secaderosConContenido } from "@/lib/consultas";
import type { Estado } from "@/lib/db/schema";
import { COLOR_ESTADO, ORDEN_ESTADOS, TITULO_ESTADO } from "@/lib/estados";
import { numero } from "@/lib/formato";
import { rutaInicial } from "@/lib/permisos";
import { Titulo, Vacio } from "@/components/ui";
import { BuscadorTablero } from "./buscador";

export const metadata = { title: "Tablero · Secaderos" };

/** Datos siempre frescos: el tablero es la foto del piso de planta. */
export const dynamic = "force-dynamic";

export default async function PaginaTablero() {
  const sesion = await requerirSesion();
  const [secaderos, cfg] = await Promise.all([
    secaderosConContenido(),
    leerConfig(),
  ]);

  const conteo = { vacio: 0, humedo: 0, horno: 0, seco: 0 } as Record<
    Estado,
    number
  >;
  const placas = { vacio: 0, humedo: 0, horno: 0, seco: 0 } as Record<
    Estado,
    number
  >;
  for (const s of secaderos) {
    conteo[s.estado]++;
    placas[s.estado] += s.total;
  }

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
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ORDEN_ESTADOS.map((estado) => {
              const color = COLOR_ESTADO[estado];
              return (
                <div key={estado} className={`tarjeta p-4 ${color.borde}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${color.punto}`} />
                    <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      {TITULO_ESTADO[estado]}
                    </span>
                  </div>
                  <p className="mt-2 text-4xl font-bold tabular-nums text-slate-900">
                    {conteo[estado]}
                    {estado === "horno" && (
                      <span className="text-xl font-medium text-slate-400">
                        /{cfg.capacidad_horno}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {placas[estado] > 0
                      ? `${numero(placas[estado])} placas`
                      : "sin placas"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Con ~250 secaderos, listarlos todos no sirve: se consulta el que
              interesa. El buscador reemplaza al scroll infinito. */}
          <BuscadorTablero secaderos={secaderos} />
        </div>
      )}
    </>
  );
}

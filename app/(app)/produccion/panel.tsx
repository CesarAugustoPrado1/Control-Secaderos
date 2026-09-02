"use client";

import Link from "next/link";
import { useState } from "react";
import type { ResumenDelDia } from "@/lib/produccion";
import {
  DETALLE_SECTOR,
  DETALLE_SECTOR_SECADEROS,
  ETIQUETA_SECTOR_RESUMEN,
  SIGNO_ROTURA,
  type SectorResumen,
} from "@/lib/sectores";
import { numero } from "@/lib/formato";
import { etiquetaDia } from "@/lib/rangos";

/**
 * Resumen del dia para el administrativo.
 *
 * Dos modos de mirar lo mismo: en placas, que es la unidad en la que se
 * factura, y en secaderos, que es la unidad en la que trabaja la planta. El
 * cambio es del lado del cliente porque los dos numeros ya vienen calculados:
 * hacer ida y vuelta al servidor para cambiar de unidad seria absurdo.
 */
export function PanelProduccion({
  resumen,
  dias,
  fechaElegida,
  hoy,
}: {
  resumen: ResumenDelDia;
  dias: string[];
  fechaElegida: string;
  hoy: string;
}) {
  const [porSecaderos, setPorSecaderos] = useState(false);

  return (
    <div className="space-y-5">
      <SelectorDeDia dias={dias} elegida={fechaElegida} hoy={hoy} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">
          {etiquetaDia(fechaElegida)}
          {fechaElegida === hoy && (
            <span className="ml-2 text-xs font-bold text-blue-600">HOY</span>
          )}
        </h2>

        <div className="flex gap-1.5">
          <Modo activo={!porSecaderos} onClick={() => setPorSecaderos(false)}>
            Placas
          </Modo>
          <Modo activo={porSecaderos} onClick={() => setPorSecaderos(true)}>
            Secaderos
          </Modo>
        </div>
      </div>

      {!resumen.hayMovimiento ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          No hubo movimiento este día.
        </p>
      ) : (
        <div className="space-y-4">
          {resumen.sectores.map((s) => (
            <section key={s.sector} className="tarjeta p-4">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  {ETIQUETA_SECTOR_RESUMEN[s.sector]}
                </h3>
                <span className="text-sm font-bold tabular-nums text-slate-900">
                  {porSecaderos ? (
                    <EnSecaderos
                      secaderos={s.secaderos}
                      rotas={s.rotas}
                      sector={s.sector}
                    />
                  ) : (
                    <Cuenta total={s.total} buenas={s.buenas} rotas={s.rotas} />
                  )}
                </span>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                {porSecaderos
                  ? DETALLE_SECTOR_SECADEROS[s.sector]
                  : DETALLE_SECTOR[s.sector]}
              </p>

              {s.productos.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">
                  Sin movimiento en este sector.
                </p>
              ) : (
                <ul className="space-y-1">
                  {/* El orden sigue a la unidad que se esta mirando: en placas
                      el mas producido arriba, en secaderos el que ocupo mas
                      secaderos. Ordenar siempre por placas dejaba la lista de
                      secaderos aparentemente desordenada. */}
                  {ordenar(s.productos, porSecaderos).map((p) => (
                    <li
                      key={p.producto}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 odd:bg-slate-50"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
                        {p.producto}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {porSecaderos ? (
                          <EnSecaderos
                            secaderos={p.secaderos}
                            rotas={p.rotas}
                            sector={s.sector}
                          />
                        ) : (
                          <Cuenta
                            total={p.total}
                            buenas={p.buenas}
                            rotas={p.rotas}
                          />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "2 secaderos + 15 placas rotas" en el carrusel, "1 secadero - 3 placas rotas"
 * en horno y paletizado.
 *
 * El signo no es cosmetico: en el carrusel la placa se rompio antes de llenar
 * el secadero, asi que se suma a lo que paso el sector; en los otros dos salio
 * de adentro de esos mismos secaderos, asi que se resta. Escribirlos igual
 * daria a entender que en el carrusel esas placas estaban en los secaderos
 * contados, y no estaban.
 */
function EnSecaderos({
  secaderos,
  rotas,
  sector,
}: {
  secaderos: number;
  rotas: number;
  sector: SectorResumen;
}) {
  return (
    <>
      <span className="font-bold text-slate-900">{numero(secaderos)}</span>{" "}
      <span className="text-xs font-medium text-slate-500">
        {secaderos === 1 ? "secadero" : "secaderos"}
      </span>
      {rotas > 0 && (
        <>
          <span className="text-slate-400"> {SIGNO_ROTURA[sector]} </span>
          <span className="font-bold text-red-600">{numero(rotas)}</span>
          <span className="text-xs font-medium text-red-600">
            {" "}
            {rotas === 1 ? "placa rota" : "placas rotas"}
          </span>
        </>
      )}
    </>
  );
}

function ordenar(productos: ResumenDelDia["sectores"][number]["productos"], porSecaderos: boolean) {
  return [...productos].sort((a, b) =>
    porSecaderos
      ? b.secaderos - a.secaderos || a.producto.localeCompare(b.producto)
      : b.total - a.total || a.producto.localeCompare(b.producto),
  );
}

/**
 * "635 = 631 + 4 rotas".
 *
 * Cuando no hubo roturas se muestra el numero solo: escribir "631 = 631 + 0
 * rotas" hace ruido en la lectura rapida, que es para lo que sirve esta
 * pantalla.
 */
function Cuenta({
  total,
  buenas,
  rotas,
}: {
  total: number;
  buenas: number;
  rotas: number;
}) {
  if (rotas === 0) {
    return <span className="font-bold text-slate-900">{numero(total)}</span>;
  }
  return (
    <>
      <span className="font-bold text-slate-900">{numero(total)}</span>
      <span className="text-slate-400"> = </span>
      <span className="font-semibold text-slate-700">{numero(buenas)}</span>
      <span className="text-slate-400"> + </span>
      <span className="font-bold text-red-600">{numero(rotas)}</span>
      <span className="text-xs font-medium text-red-600"> rotas</span>
    </>
  );
}

function Modo({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        activo
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Solo los dias que tuvieron actividad. En una planta que no trabaja todos los
 * dias, ofrecer catorce botones de los cuales varios estan vacios obliga a
 * probar uno por uno para encontrar el que sirve.
 */
function SelectorDeDia({
  dias,
  elegida,
  hoy,
}: {
  dias: string[];
  elegida: string;
  hoy: string;
}) {
  if (dias.length === 0) return null;

  return (
    <div className="tarjeta p-3">
      <p className="etiqueta">Día</p>
      <div className="-mx-3 overflow-x-auto px-3">
        <div className="flex min-w-max gap-1.5">
          {dias.map((d) => {
            const activo = d === elegida;
            return (
              <Link
                key={d}
                href={d === hoy ? "/produccion" : `/produccion?dia=${d}`}
                scroll={false}
                className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
                  activo
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                }`}
              >
                {d === hoy ? "Hoy" : etiquetaDia(d)}
              </Link>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Últimas dos semanas. Los días sin movimiento no se listan.
      </p>
    </div>
  );
}

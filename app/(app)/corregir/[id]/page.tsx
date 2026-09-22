import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirRol } from "@/lib/auth";
import { datosDeCorreccion, motivosActivos } from "@/lib/consultas";
import {
  EFECTO_ANULAR,
  cantidadesCargadas,
  contenidoAntes,
  esCorregible,
  roturasRegistradas,
} from "@/lib/correccion";
import { ETIQUETA_MOVIMIENTO } from "@/lib/estados";
import { hora, numero } from "@/lib/formato";
import { rutaInicial } from "@/lib/permisos";
import { etiquetaDia, fechaLocal } from "@/lib/rangos";
import { AnularMovimiento, CorregirRoturas } from "@/components/correccion";
import { FormularioCarga } from "@/components/formulario-carga";
import type { MapaRoturas } from "@/components/editor-roturas";
import { Aviso, Modelos } from "@/components/ui";

export const metadata = { title: "Corregir · Secaderos" };
export const dynamic = "force-dynamic";

/**
 * A donde se puede volver despues de corregir. Lista cerrada: el destino viene
 * en la URL, y aceptar cualquiera convertiria la pantalla en una redireccion
 * abierta hacia afuera de la app.
 */
const VUELTAS = [
  "/carrusel",
  "/llenado-manual",
  "/horno",
  "/paletizado",
  "/movimientos",
  "/tablero",
];

/**
 * Corregir un movimiento: una sola pantalla para los seis tipos del piso.
 *
 * Arriba lo que quedo registrado, para que el operario vea que es lo que esta
 * por cambiar. Abajo, la forma de arreglarlo: en una carga, las cantidades; en
 * todo lo demas, las roturas. Y al final, plegado, anularlo entero.
 */
export default async function PaginaCorregir({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ volver?: string }>;
}) {
  const sesion = await requerirRol(
    "carrusel",
    "llenado_manual",
    "horno",
    "paletizado",
    "admin",
  );
  const { id } = await params;
  const { volver } = await searchParams;
  const volverA =
    volver && VUELTAS.includes(volver) ? volver : rutaInicial(sesion.rol);

  const datos = await datosDeCorreccion(Number(id), {
    uid: sesion.uid,
    rol: sesion.rol,
  });
  if (!datos) notFound();

  const { movimiento: m, lineas, secadero, permiso, modelos } = datos;
  const placas = lineas.reduce((a, l) => a + l.cantidad, 0);
  const conRotura = lineas.filter((l) => l.desperdicio > 0);
  const fecha = fechaLocal(m.creadoEn);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link
        href={volverA}
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500"
      >
        ← Volver
      </Link>

      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Corregir · secadero {m.secaderoNumero}
        </h1>
        <p className="text-sm text-slate-500">
          {ETIQUETA_MOVIMIENTO[m.tipo]}
          {fecha !== fechaLocal() && ` · ${etiquetaDia(fecha)}`} ·{" "}
          {hora(m.creadoEn)} · {m.usuarioNombre}
        </p>
      </div>

      {/* Lo que quedo registrado, con el mismo peso visual que en las listas:
          numero y modelo grandes, el resto chico. */}
      <section className="tarjeta p-4">
        <p className="etiqueta">Lo que quedó registrado</p>
        <Modelos
          nombres={lineas.filter((l) => l.cantidad > 0).map((l) => l.productoNombre)}
          vacio="Sin placas"
        />
        <p className="mt-1 text-sm text-slate-600">
          {numero(placas)} placas
          {lineas.filter((l) => l.cantidad > 0).length > 1 &&
            ` · ${lineas
              .filter((l) => l.cantidad > 0)
              .map((l) => `${l.productoNombre} ${numero(l.cantidad)}`)
              .join(", ")}`}
        </p>
        {conRotura.length > 0 && (
          <p className="mt-1 text-sm font-semibold text-red-700">
            Rotas:{" "}
            {conRotura
              .map(
                (l) =>
                  `${numero(l.desperdicio)} de ${l.productoNombre}${
                    l.motivoNombre ? ` (${l.motivoNombre})` : ""
                  }`,
              )
              .join(", ")}
          </p>
        )}
        {m.nota && (
          <p className="mt-2 text-xs text-slate-500 italic">Nota: {m.nota}</p>
        )}
      </section>

      {!permiso.ok || !esCorregible(m.tipo) ? (
        <Aviso tono="info">
          {permiso.ok ? "Este movimiento no se corrige desde acá." : permiso.motivo}
        </Aviso>
      ) : (
        <>
          {m.tipo === "carga" ? (
            <FormularioCarga
              secaderoId={secadero.id}
              secaderoNumero={secadero.numero}
              capacidad={secadero.capacidad}
              modelos={modelos}
              volverA={volverA}
              correccion={{
                movimientoId: m.id,
                inicial: Object.fromEntries(cantidadesCargadas(lineas)),
              }}
            />
          ) : (
            <CorregirRoturas
              movimientoId={m.id}
              opciones={opcionesDeRotura(m.tipo, lineas)}
              motivos={(await motivosActivos()).map((x) => ({
                id: x.id,
                nombre: x.nombre,
              }))}
              inicial={mapaInicial(lineas)}
              volverA={volverA}
            />
          )}

          <AnularMovimiento
            movimientoId={m.id}
            secaderoNumero={m.secaderoNumero}
            efecto={EFECTO_ANULAR[m.tipo]}
            volverA={volverA}
          />
        </>
      )}
    </div>
  );
}

type Linea = NonNullable<Awaited<ReturnType<typeof datosDeCorreccion>>>["lineas"][number];

/**
 * Los topes del editor: lo que habia adentro ANTES del movimiento. Con los de
 * despues no se podria marcar mas rotas de las que se habian marcado, que es
 * justamente uno de los errores a corregir.
 */
function opcionesDeRotura(
  tipo: Parameters<typeof contenidoAntes>[0],
  lineas: Linea[],
) {
  const nombres = new Map(lineas.map((l) => [l.productoId, l.productoNombre]));
  return [...contenidoAntes(tipo, lineas).entries()].map(([productoId, tope]) => ({
    productoId,
    nombre: nombres.get(productoId) ?? `Producto #${productoId}`,
    tope,
  }));
}

/**
 * Las roturas registradas, en la forma del editor: una por modelo. El piso
 * nunca carga dos motivos para el mismo modelo, pero si alguna vez pasa, se
 * suman con el primero en lugar de perder placas en silencio.
 */
function mapaInicial(lineas: Linea[]): MapaRoturas {
  const mapa: MapaRoturas = {};
  for (const r of roturasRegistradas(lineas)) {
    const actual = mapa[r.productoId];
    mapa[r.productoId] = actual
      ? { cantidad: actual.cantidad + r.cantidad, motivoId: actual.motivoId }
      : { cantidad: r.cantidad, motivoId: r.motivoId };
  }
  return mapa;
}

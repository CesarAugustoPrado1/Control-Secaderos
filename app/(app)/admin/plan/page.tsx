import { productosDelCircuito, leerConfig } from "@/lib/consultas";
import {
  compararPlan,
  cumplimientoDeFechas,
  lineasDeSemana,
  notasDelHorno,
  notasHornoDeFechas,
  planesDeFechas,
  type ComparacionPlan,
} from "@/lib/plan";
import type { Sector } from "@/lib/db/schema";
import { numero, porcentaje } from "@/lib/formato";
import { leerMetas, secaderosDelDia, type Metas } from "@/lib/metas";
import { leerPeriodo } from "@/lib/periodos";
import { esFecha, fechaLocal, semanaDesde } from "@/lib/rangos";
import {
  fechasConMoldesPedidos,
  inventarioMoldes,
  moldesDeReferencia,
  moldesPedidos,
} from "@/lib/moldes";
import { Plegable } from "@/components/plegable";
import { BarraDia } from "./barra-dia";
import { EditorNotasHorno } from "./notas-horno";
import { EditorPlan } from "./editor";
import { MetaSector } from "./meta";
import { Semana } from "./semana";
import { RepetirDia, type Parte } from "./repetir";

export const metadata = { title: "Plan · Administración" };
export const dynamic = "force-dynamic";

/** En el orden en que pasa el material por la fabrica. */
const SECCIONES: { sector: Sector; titulo: string; detalle: string }[] = [
  { sector: "carrusel", titulo: "Carrusel · llenado", detalle: "Secaderos a cargar" },
  { sector: "paletizado", titulo: "Paletizado · descarga", detalle: "Secaderos a descargar y palets" },
];

/**
 * La hoja de produccion del dia, como en Control de Estanterias: la fecha
 * arriba, el resumen del dia con la meta, y abajo cada sector en el orden de
 * la fabrica -carrusel, horno, paletizado-, cada uno con su meta y lo pedido
 * por modelo. Al pie, la semana con el cumplimiento de cada dia, para ver la
 * tendencia y saltar a cualquiera.
 *
 * `?desde=` y `?sector=` de la version anterior se ignoran: el dia se ve
 * entero, con sus tres sectores.
 */
export default async function PaginaAdminPlan({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const { dia: pedido } = await searchParams;
  const hoy = fechaLocal();
  const dia = esFecha(pedido) ? pedido : hoy;
  // La semana de abajo es la del dia elegido, de lunes a domingo.
  const inicio = leerPeriodo("semana", dia, hoy).inicio;
  const fechas = semanaDesde(inicio);

  const [
    productos,
    resumen,
    notasSemana,
    carrusel,
    paletizado,
    lineasCarrusel,
    lineasPaletizado,
    notas,
    moldesSemana,
    moldes,
    cumplimiento,
    { metas, sugeridas },
    hechos,
  ] = await Promise.all([
    // Solo los del circuito principal: el plan es del carrusel y de
    // paletizado, y lo que hace el operario de guardas no se compara contra
    // esta orden. Pedir guardas acá dejaría una línea que nunca se cumple.
    productosDelCircuito(false),
    planesDeFechas(fechas),
    notasHornoDeFechas(fechas),
    compararPlan(dia, "carrusel"),
    compararPlan(dia, "paletizado"),
    lineasDeSemana(fechas, "carrusel"),
    lineasDeSemana(fechas, "paletizado"),
    notasDelHorno(dia),
    fechasConMoldesPedidos(fechas),
    Promise.all([
      moldesPedidos(dia),
      moldesDeReferencia(dia, hoy),
      inventarioMoldes(),
      leerConfig(),
    ]).then(([pedidoMoldes, referencia, inventario, config]) => ({
      pedido: pedidoMoldes,
      referencia,
      inventario: inventario
        .filter((p) => p.activo)
        .map((p) => ({ id: p.id, nombre: p.nombre, moldes: p.moldes })),
      lugares: config.moldes_carrusel,
    })),
    cumplimientoDeFechas(fechas, hoy),
    leerMetas(dia),
    secaderosDelDia(dia),
  ]);

  const comparacion: Record<Sector, ComparacionPlan> = { carrusel, paletizado };
  const lineasSemana = { carrusel: lineasCarrusel, paletizado: lineasPaletizado };
  const esFuturo = dia > hoy;
  const listaProductos = productos.map((p) => ({ id: p.id, nombre: p.nombre }));

  /** Las partes que tiene un dia de la semana, para elegir que copiar. */
  function partesDelDia(f: string): { parte: Parte; detalle: string }[] {
    const r = (sector: Sector) =>
      resumen.find((x) => x.fecha === f && x.sector === sector);
    const car = r("carrusel");
    const pal = r("paletizado");
    const partes: { parte: Parte; detalle: string }[] = [];
    if (moldesSemana.includes(f)) {
      partes.push({ parte: "moldes", detalle: "El set de moldes pedido ese día" });
    }
    if (car) {
      partes.push({ parte: "carrusel", detalle: `${car.secaderos} secaderos pedidos` });
    }
    if (notasSemana.some((n) => n.fecha === f)) {
      partes.push({ parte: "horno", detalle: "Indicaciones para cargar y descargar" });
    }
    if (pal) {
      partes.push({
        parte: "paletizado",
        detalle:
          [
            pal.secaderos ? `${pal.secaderos} secaderos` : null,
            pal.palets ? `${pal.palets} palets` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "Plan de paletizado",
      });
    }
    return partes;
  }

  return (
    <div className="space-y-4">
      {/* 1. La fecha. */}
      <BarraDia dia={dia} hoy={hoy} />

      {/* 2. El dia de un vistazo: programa y meta de cada sector. */}
      <ResumenDia
        comparacion={comparacion}
        metas={metas}
        hechos={hechos}
        esFuturo={esFuturo}
      />

      <RepetirDia
        key={`repetir-${dia}`}
        origen={dia}
        hoy={hoy}
        disponibles={partesDelDia(dia)}
      />

      {/* 3. Los sectores, en el orden de la fabrica. */}
      {SECCIONES.map(({ sector, titulo, detalle }, i) => (
        <div key={sector} id={`plan-${sector}`} className="scroll-mt-20 space-y-4">
          <Plegable
            id={`plan-dia-${sector}`}
            abiertoPorDefecto
            titulo={titulo}
            resumen={
              <ResumenSector
                comparacion={comparacion[sector]}
                meta={metas[sector]}
                hechos={hechos[sector]}
                esFuturo={esFuturo}
                detalle={detalle}
              />
            }
          >
            <MetaSector
              key={`meta-${dia}-${sector}`}
              fecha={dia}
              sector={sector}
              meta={metas[sector]}
              sugerida={sugeridas[sector]}
              programados={comparacion[sector].totalPedido}
              hechos={hechos[sector]}
              esFuturo={esFuturo}
            />
            <EditorPlan
              key={`${dia}-${sector}`}
              incrustado
              fecha={dia}
              sector={sector}
              esPasado={dia < hoy}
              productos={listaProductos}
              comparacion={comparacion[sector]}
              semana={fechas}
              lineasSemana={lineasSemana[sector]}
              moldes={sector === "carrusel" ? moldes : undefined}
            />
          </Plegable>

          {/* El horno va entre los dos, que es donde esta en el recorrido.
              No recibe meta ni plan: solo las indicaciones del dia. */}
          {i === 0 && (
            <div id="plan-horno" className="scroll-mt-20">
              <Plegable
                id="plan-dia-horno"
                titulo="Horno · indicaciones"
                resumen={
                  <span className="text-sm font-semibold text-slate-500">
                    {notas.carga || notas.descarga
                      ? [notas.descarga && "para sacar", notas.carga && "para meter"]
                          .filter(Boolean)
                          .join(" y ")
                          .replace(/^/, "Con notas ")
                      : "Sin indicaciones"}
                  </span>
                }
              >
                <EditorNotasHorno
                  key={`${dia}-horno`}
                  incrustado
                  fecha={dia}
                  carga={notas.carga}
                  descarga={notas.descarga}
                  semana={fechas}
                  notasSemana={notasSemana}
                />
              </Plegable>
            </div>
          )}
        </div>
      ))}

      {/* 4. La semana, con los vasos de cumplimiento. */}
      <Semana
        inicio={inicio}
        fechas={fechas}
        hoy={hoy}
        resumen={resumen}
        notasHorno={notasSemana.map((n) => n.fecha)}
        moldes={moldesSemana}
        diaElegido={dia}
        cumplimiento={cumplimiento}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const pct = (hechos: number, total: number) =>
  total > 0 ? Math.round((hechos / total) * 100) : 0;

/**
 * El dia en dos renglones, uno por sector: cuanto del programa se cumplio y
 * cuanto de la meta. Mientras el dia no termino, lo que falta no es
 * incumplimiento: va en gris y no en rojo.
 */
function ResumenDia({
  comparacion,
  metas,
  hechos,
  esFuturo,
}: {
  comparacion: Record<Sector, ComparacionPlan>;
  metas: Metas;
  hechos: Record<Sector, number>;
  esFuturo: boolean;
}) {
  const filas = SECCIONES.map(({ sector, titulo }) => ({
    sector,
    nombre: titulo.split(" ·")[0],
    c: comparacion[sector],
    meta: metas[sector],
    hechos: hechos[sector],
  }));
  const nada = filas.every((f) => f.c.totalPedido === 0 && f.meta === null);

  return (
    <section className="tarjeta p-4">
      <h2 className="text-xs font-bold tracking-wide text-slate-500 uppercase">
        {esFuturo ? "Lo programado" : "Cómo va el día"}
      </h2>
      {nada ? (
        <p className="mt-1 text-sm text-slate-500">
          Todavía no hay plan ni meta para este día. Cargalos abajo, sector por sector.
        </p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {filas.map((f) => (
            <div key={f.sector} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="font-bold text-slate-900">{f.nombre}</p>
              {f.meta !== null && (
                <p className="mt-1 text-sm text-slate-600">
                  Meta{" "}
                  {esFuturo ? (
                    <strong className="text-slate-900">{numero(f.meta)} secaderos</strong>
                  ) : (
                    <>
                      <strong className={f.hechos >= f.meta ? "text-emerald-700" : "text-slate-900"}>
                        {numero(f.hechos)}/{numero(f.meta)}
                      </strong>{" "}
                      <span className={f.hechos >= f.meta ? "text-emerald-700" : "text-blue-700"}>
                        {pct(f.hechos, f.meta)} %
                      </span>
                    </>
                  )}
                </p>
              )}
              {f.c.totalPedido > 0 && (
                <p className="text-sm text-slate-600">
                  Programa{" "}
                  {esFuturo ? (
                    <strong className="text-slate-900">{numero(f.c.totalPedido)} secaderos</strong>
                  ) : (
                    <>
                      <strong className="text-slate-900">
                        {porcentaje(f.c.totalHecho, f.c.totalPedido)}
                      </strong>{" "}
                      · {numero(f.c.totalHecho)} de {numero(f.c.totalPedido)}
                    </>
                  )}
                </p>
              )}
              {f.meta === null && f.c.totalPedido === 0 && (
                <p className="mt-1 text-sm text-slate-400">Sin plan ni meta</p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Lo que se lee en el encabezado de cada sector, abierto o cerrado: si lo
 * programado llega a la meta, y como va lo hecho.
 */
function ResumenSector({
  comparacion,
  meta,
  hechos,
  esFuturo,
  detalle,
}: {
  comparacion: ComparacionPlan;
  meta: number | null;
  hechos: number;
  esFuturo: boolean;
  detalle: string;
}) {
  const programados = comparacion.totalPedido;
  const estado =
    meta === null
      ? null
      : programados === meta
        ? { texto: "Programa completo", clase: "bg-emerald-100 text-emerald-800" }
        : programados < meta
          ? { texto: "Programa incompleto", clase: "bg-red-100 text-red-800" }
          : { texto: "Programa excedido", clase: "bg-amber-100 text-amber-900" };

  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
      {estado && (
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${estado.clase}`}>
          {estado.texto} · {numero(programados)}/{numero(meta!)}
        </span>
      )}
      {meta !== null && !esFuturo && (
        <span>
          Hechos{" "}
          <strong className={hechos >= meta ? "text-emerald-700" : "text-slate-800"}>
            {numero(hechos)}/{numero(meta)}
          </strong>
        </span>
      )}
      {meta === null && (
        <span>
          {programados > 0 ? `${numero(programados)} secaderos pedidos · sin meta` : detalle}
        </span>
      )}
    </span>
  );
}

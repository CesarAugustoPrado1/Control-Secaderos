import { productosDelCircuito } from "@/lib/consultas";
import {
  compararPlan,
  lineasDeSemana,
  notasDelHorno,
  notasHornoDeFechas,
  planesDeFechas,
} from "@/lib/plan";
import type { Sector } from "@/lib/db/schema";
import { fechaLocal, semanaDesde } from "@/lib/rangos";
import { leerConfig } from "@/lib/consultas";
import {
  fechasConMoldesPedidos,
  inventarioMoldes,
  moldesDeReferencia,
  moldesPedidos,
} from "@/lib/moldes";
import { EditorNotasHorno } from "./notas-horno";
import { EditorPlan } from "./editor";
import { Semana, type Fila } from "./semana";
import { RepetirDia } from "./repetir";

export const metadata = { title: "Plan · Administración" };
export const dynamic = "force-dynamic";

const esFecha = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const esFila = (v?: string): v is Fila =>
  v === "carrusel" || v === "paletizado" || v === "horno";

export default async function PaginaAdminPlan({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; dia?: string; sector?: string }>;
}) {
  const { desde, dia, sector } = await searchParams;
  const hoy = fechaLocal();
  const inicio = esFecha(desde) ? desde! : hoy;
  const fechas = semanaDesde(inicio);

  const diaElegido = esFecha(dia) ? dia! : null;
  const filaElegida: Fila = esFila(sector) ? sector : "carrusel";
  // El horno no tiene plan, solo notas. Para las consultas del plan se usa
  // carrusel, que igual no se muestra mientras el horno este elegido.
  const esHorno = filaElegida === "horno";
  const sectorElegido: Sector = esHorno ? "carrusel" : filaElegida;

  const conMoldes = !!diaElegido && filaElegida === "carrusel";

  const [
    productos,
    resumen,
    notasSemana,
    comparacion,
    semanaDelSector,
    notas,
    moldesSemana,
    moldes,
  ] = await Promise.all([
      // Solo los del circuito principal: el plan es del carrusel y de
      // paletizado, y lo que hace el operario de guardas no se compara contra
      // esta orden. Pedir guardas acá dejaría una línea que nunca se cumple.
      productosDelCircuito(false),
      planesDeFechas(fechas),
      notasHornoDeFechas(fechas),
      diaElegido && !esHorno
        ? compararPlan(diaElegido, sectorElegido)
        : Promise.resolve(null),
      lineasDeSemana(fechas, sectorElegido),
      diaElegido && esHorno
        ? notasDelHorno(diaElegido)
        : Promise.resolve(null),
      fechasConMoldesPedidos(fechas),
      conMoldes
        ? Promise.all([
            moldesPedidos(diaElegido!),
            moldesDeReferencia(diaElegido!, hoy),
            inventarioMoldes(),
            leerConfig(),
          ]).then(([pedido, referencia, inventario, config]) => ({
            pedido,
            referencia,
            inventario: inventario
              .filter((p) => p.activo)
              .map((p) => ({ id: p.id, nombre: p.nombre, moldes: p.moldes })),
            lugares: config.moldes_carrusel,
          }))
        : Promise.resolve(undefined),
    ]);

  /** Lo que tiene un dia de la semana, en renglones cortos para "Repetir". */
  function contenidoDelDia(f: string): string[] {
    const r = (sector: Sector) =>
      resumen.find((x) => x.fecha === f && x.sector === sector);
    const car = r("carrusel");
    const pal = r("paletizado");
    const partes: string[] = [];
    if (car || moldesSemana.includes(f)) {
      partes.push(
        "Carrusel" +
          (car ? ` ${car.secaderos} sec.` : "") +
          (moldesSemana.includes(f) ? " + moldes" : ""),
      );
    }
    if (notasSemana.some((n) => n.fecha === f)) partes.push("Horno notas");
    if (pal) {
      partes.push(
        "Paletizado" +
          (pal.secaderos ? ` ${pal.secaderos} sec.` : "") +
          (pal.palets ? ` ${pal.palets} palets` : ""),
      );
    }
    return partes;
  }

  return (
    <div className="space-y-5">
      <Semana
        inicio={inicio}
        fechas={fechas}
        hoy={hoy}
        resumen={resumen}
        notasHorno={notasSemana.map((n) => n.fecha)}
        moldes={moldesSemana}
        diaElegido={diaElegido}
        filaElegida={filaElegida}
      />

      {diaElegido && (
        <RepetirDia
          key={`repetir-${diaElegido}`}
          origen={diaElegido}
          hoy={hoy}
          contenido={contenidoDelDia(diaElegido)}
        />
      )}

      {comparacion && (
        <EditorPlan
          key={`${diaElegido}-${sectorElegido}`}
          fecha={diaElegido!}
          sector={sectorElegido}
          esPasado={diaElegido! < hoy}
          productos={productos.map((p) => ({ id: p.id, nombre: p.nombre }))}
          comparacion={comparacion}
          semana={fechas}
          lineasSemana={semanaDelSector}
          moldes={moldes}
        />
      )}

      {notas && (
        <EditorNotasHorno
          key={`${diaElegido}-horno`}
          fecha={diaElegido!}
          carga={notas.carga}
          descarga={notas.descarga}
          semana={fechas}
          notasSemana={notasSemana}
        />
      )}
    </div>
  );
}

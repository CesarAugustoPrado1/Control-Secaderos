import { requerirRol } from "@/lib/auth";
import { listarMovimientos, secaderosConContenido } from "@/lib/consultas";
import {
  esFecha,
  etiquetaRelativa,
  fechaLocal,
  rangoDeFecha,
} from "@/lib/rangos";
import { Actividad } from "@/components/actividad";
import { BuscadorAccion, aBuscable } from "@/components/buscador-accion";
import { SelectorDia } from "@/components/selector-dia";
import { Titulo } from "@/components/ui";

export const metadata = { title: "Llenado manual · Secaderos" };
export const dynamic = "force-dynamic";

/**
 * El puesto de las guardas: las dos puntas del circuito en una sola pantalla.
 *
 * El operario llena el secadero a mano y mas tarde, cuando el horno se lo
 * devuelve seco, lo descarga el mismo. Son dos operaciones distintas pero de
 * una sola persona, asi que van juntas y no en dos secciones de la barra: en
 * el celular eso serian dos toques y dos iconos para un unico puesto. Es la
 * misma forma que tiene la pantalla del horno, que mete y saca en un solo
 * lugar.
 *
 * Solo se ven los secaderos de tipos marcados como de llenado manual. El resto
 * del circuito -carrusel y paletizado- no los ve, y esta pantalla no ve los de
 * ellos. El horno es la unica parte compartida: ahi entran y salen todos.
 */
export default async function PaginaLlenadoManual({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  await requerirRol("llenado_manual", "admin");
  const { dia } = await searchParams;
  const hoy = fechaLocal();
  const fecha = esFecha(dia) ? dia : hoy;
  const { desde, hasta } = rangoDeFecha(fecha);
  const etiqueta = etiquetaRelativa(fecha, hoy);
  const esFuturo = fecha > hoy;

  const [secaderos, cargas, descargas] = await Promise.all([
    secaderosConContenido(),
    listarMovimientos({
      tipo: "carga",
      llenadoManual: true,
      desde,
      hasta,
      porPagina: 200,
      orden: "asc",
    }),
    listarMovimientos({
      tipo: "descarga",
      llenadoManual: true,
      desde,
      hasta,
      porPagina: 200,
      orden: "asc",
    }),
  ]);

  /**
   * El buscador busca sobre TODOS los secaderos que le pasen, no solo los
   * disponibles: asi puede decir por que un numero no se puede usar. Acotarlo
   * al circuito manual es lo que hace que un numero del carrusel figure como
   * inexistente, que es exactamente lo que este operario tiene que entender.
   */
  const mios = secaderos.filter((s) => s.llenadoManual).map(aBuscable);

  return (
    <div className="space-y-6">
      <Titulo detalle="Llenás el secadero y, cuando vuelve seco del horno, lo descargás vos mismo">
        Llenado manual
      </Titulo>

      <SelectorDia rutaBase="/llenado-manual" fecha={fecha} hoy={hoy} />

      {mios.length === 0 ? (
        <p className="tarjeta px-4 py-10 text-center text-sm text-slate-500">
          No hay ningún secadero de llenado manual. Un administrador tiene que
          marcar el tipo como “se llena y se descarga a mano” desde
          Administración → Tipos.
        </p>
      ) : (
        <>
          <section>
            <Encabezado titulo="Llenar" />
            <BuscadorAccion
              secaderos={mios}
              estadoObjetivo="vacio"
              hrefBase="/llenado-manual/cargar"
              verbo="Llenar"
              etiquetaDisponibles="secaderos vacíos para llenar"
              autoFoco={false}
            />
          </section>

          <section>
            <Encabezado titulo="Descargar" />
            <BuscadorAccion
              secaderos={mios}
              estadoObjetivo="seco"
              hrefBase="/llenado-manual/descargar"
              verbo="Descargar"
              etiquetaDisponibles="secaderos secos esperando"
              autoFoco={false}
            />
          </section>
        </>
      )}

      {!esFuturo && (
        <>
          <Actividad
            titulo="Llenado"
            dia={etiqueta}
            movimientos={cargas.items}
            vacio={
              fecha === hoy
                ? "Todavía no llenaste ningún secadero hoy."
                : "Ese día no se llenó ningún secadero a mano."
            }
          />

          <Actividad
            titulo="Descargado"
            dia={etiqueta}
            movimientos={descargas.items}
            vacio={
              fecha === hoy
                ? "Todavía no descargaste ningún secadero hoy."
                : "Ese día no se descargó ningún secadero a mano."
            }
          />
        </>
      )}
    </div>
  );
}

/**
 * Los dos bloques necesitan titulo propio: sin el, dos buscadores identicos uno
 * abajo del otro se confunden, y equivocarse de campo es cargar la operacion
 * contraria.
 */
function Encabezado({ titulo }: { titulo: string }) {
  return <h2 className="mb-2 text-base font-bold text-slate-900">{titulo}</h2>;
}

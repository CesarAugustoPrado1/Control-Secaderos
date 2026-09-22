import Link from "next/link";
import { requerirRol } from "@/lib/auth";
import {
  corregiblesPara,
  listarMovimientos,
  secaderosConContenido,
} from "@/lib/consultas";
import {
  esFecha,
  etiquetaRelativa,
  fechaLocal,
  rangoDeFecha,
} from "@/lib/rangos";
import { Actividad } from "@/components/actividad";
import { aBuscable } from "@/lib/buscables";
import { BuscadorAccion } from "@/components/buscador-accion";
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
  const sesion = await requerirRol("llenado_manual", "admin");
  const { dia } = await searchParams;
  const hoy = fechaLocal();
  const fecha = esFecha(dia) ? dia : hoy;
  const { desde, hasta } = rangoDeFecha(fecha);
  const etiqueta = etiquetaRelativa(fecha, hoy);
  const esFuturo = fecha > hoy;

  const [secaderos, cargas, descargas, devoluciones] = await Promise.all([
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
    listarMovimientos({
      tipo: "devolucion_horno",
      llenadoManual: true,
      desde,
      hasta,
      porPagina: 200,
      orden: "asc",
    }),
  ]);

  const corregibles = await corregiblesPara(
    [...cargas.items, ...descargas.items, ...devoluciones.items],
    { uid: sesion.uid, rol: sesion.rol },
  );

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
        <SinSecaderos esAdmin={sesion.rol === "admin"} />
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
            corregibles={corregibles}
            volverA="/llenado-manual"
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
            corregibles={corregibles}
            volverA="/llenado-manual"
            vacio={
              fecha === hoy
                ? "Todavía no descargaste ningún secadero hoy."
                : "Ese día no se descargó ningún secadero a mano."
            }
          />

          {devoluciones.items.length > 0 && (
            <Actividad
              titulo="Devueltos al horno"
              dia={etiqueta}
              movimientos={devoluciones.items}
              corregibles={corregibles}
              volverA="/llenado-manual"
              vacio=""
            />
          )}
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

/**
 * Que hacer cuando no hay ningun secadero en el circuito manual.
 *
 * No es un error ni una pantalla vacia cualquiera: es una pantalla sin
 * configurar, y quien la mira puede o no ser quien la configura. Al admin se le
 * dice que lo tiene que hacer EL y se le deja el link; al operario, a quien
 * pedirselo. Un solo texto que hable de "un administrador" en tercera persona
 * deja al admin leyendo una instruccion para otro y buscando un boton que no
 * existe.
 */
function SinSecaderos({ esAdmin }: { esAdmin: boolean }) {
  return (
    <div className="tarjeta space-y-3 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-slate-700">
        Todavía no hay ningún secadero de llenado manual.
      </p>
      {esAdmin ? (
        <>
          <p className="text-sm text-slate-500">
            Entrá al tipo de secadero que se llena a mano —las guardas— y
            marcale <strong className="text-slate-700">“se llena y se
            descarga a mano”</strong>. Desde ese momento sus secaderos
            desaparecen de Cargar y de Descargar y se operan acá.
          </p>
          <Link href="/admin/tipos" className="boton-primario inline-block">
            Ir a Administración → Tipos
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">
          Pedile al administrador que marque el tipo como “se llena y se
          descarga a mano” desde Administración → Tipos.
        </p>
      )}
    </div>
  );
}

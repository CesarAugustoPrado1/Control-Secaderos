import Link from "next/link";
import { requerirSesion } from "@/lib/auth";
import { leerConfig, secaderosConContenido } from "@/lib/consultas";
import { numero } from "@/lib/formato";
import { rutaInicial } from "@/lib/permisos";
import { Titulo, Vacio } from "@/components/ui";
import { PanelTablero } from "./panel";

export const metadata = { title: "Tablero · Secaderos" };

/** Datos siempre frescos: el tablero es la foto del piso de planta. */
export const dynamic = "force-dynamic";

export default async function PaginaTablero() {
  const sesion = await requerirSesion();
  const [secaderos, cfg] = await Promise.all([
    secaderosConContenido(),
    leerConfig(),
  ]);

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
        <PanelTablero secaderos={secaderos} capacidadHorno={cfg.capacidad_horno} />
      )}
    </>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Seccion que arranca cerrada y se abre de un toque.
 *
 * En la pantalla del carrusel lo importante son los secaderos: las roturas y
 * el yeso son datos que se cargan de a ratos y que, desplegados, empujaban la
 * lista de secaderos fuera de la primera pantalla del celular. Cerrados ocupan
 * un renglon.
 *
 * Cerrado NO significa escondido: el `resumen` viaja en el encabezado, asi que
 * el numero del dia -cuantas placas rotas, cuantos bolsones- se lee sin abrir
 * nada. Lo que se pliega es el detalle y el formulario, no el dato.
 *
 * El contenido se oculta con CSS y no se desmonta. Es a proposito: adentro hay
 * formularios con lo que el operario esta tipeando, y un toque accidental en
 * el encabezado no puede costarle la carga a medio escribir.
 */
export function Plegable({
  id,
  titulo,
  resumen,
  children,
  abiertoPorDefecto = false,
}: {
  /** Clave con la que se recuerda abierto o cerrado en este celular. */
  id: string;
  titulo: string;
  /** Lo que se ve en el encabezado, abierto o cerrado. */
  resumen?: ReactNode;
  children: ReactNode;
  abiertoPorDefecto?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);

  /**
   * Se recuerda por celular: el que carga roturas todo el dia no tiene que
   * abrirlas cada vez que vuelve a la pantalla.
   *
   * La lectura va en un efecto y no en el estado inicial porque el servidor no
   * tiene localStorage: arrancar distinto en las dos puntas rompe la
   * hidratacion. Y va envuelta en try porque en una ventana privada o con los
   * datos del sitio bloqueados el solo hecho de leer tira excepcion.
   */
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(`plegable:${id}`);
      if (guardado !== null) setAbierto(guardado === "1");
    } catch {
      // Sin localStorage la seccion funciona igual, solo que no recuerda.
    }
  }, [id]);

  function alternar() {
    const v = !abierto;
    setAbierto(v);
    try {
      localStorage.setItem(`plegable:${id}`, v ? "1" : "0");
    } catch {
      // Ídem: no poder recordarlo no puede impedir abrir la sección.
    }
  }

  const cuerpoId = `plegable-cuerpo-${id}`;

  return (
    <section className="tarjeta">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-controls={cuerpoId}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        {/* Dibujado y no un caracter: el ▶ de texto lo renderiza como emoji
            azul el Android de la planta, y quedaba un boton de "play" en el
            medio de una pantalla que no reproduce nada. */}
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          className={`h-5 w-5 shrink-0 text-slate-400 transition ${
            abierto ? "rotate-90" : ""
          }`}
        >
          <path
            d="M7.5 4.5 13 10l-5.5 5.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-slate-900">
            {titulo}
          </span>
          {resumen && <span className="mt-0.5 block">{resumen}</span>}
        </span>
      </button>

      {/* El atributo `hidden` y la clase dicen lo mismo a proposito: el
          atributo es lo que entiende el lector de pantalla, y la clase no
          depende de que el preflight de Tailwind siga trayendo la regla de
          `[hidden]`. */}
      <div
        id={cuerpoId}
        hidden={!abierto}
        className={abierto ? "px-4 pb-4" : "hidden"}
      >
        {children}
      </div>
    </section>
  );
}

import { z } from "zod";

/**
 * El rumbo de la app: para que existe, sus objetivos y un glosario. Lo edita
 * el admin en Administracion -> Rumbo. Modulo puro: lo usan la pagina, el
 * editor del cliente y la accion que lo guarda.
 *
 * Se guarda como JSON en la tabla `config` (clave "rumbo"): es un solo
 * documento chico, y asi no hace falta tocar el esquema de la base.
 */

export const CLAVE_RUMBO = "rumbo";

export const esquemaRumbo = z.object({
  proposito: z.string().trim().max(600),
  objetivos: z
    .array(
      z.object({
        titulo: z.string().trim().min(1, "Cada objetivo necesita un título.").max(80),
        detalle: z.string().trim().max(300),
      }),
    )
    .max(20),
  glosario: z
    .array(
      z.object({
        termino: z.string().trim().min(1, "Cada término necesita un nombre.").max(40),
        definicion: z.string().trim().max(300),
      }),
    )
    .max(40),
});

export type Rumbo = z.infer<typeof esquemaRumbo>;

/** Primera version, para que la seccion no arranque vacia. El admin la cambia. */
export const RUMBO_POR_DEFECTO: Rumbo = {
  proposito:
    "Que cada secadero esté rastreado desde que se carga hasta que se paletiza, y medir lo que pasa en el medio para producir más y romper menos.",
  objetivos: [
    {
      titulo: "Trazabilidad completa",
      detalle:
        "Cada movimiento queda registrado con quién lo hizo y cuándo. Nada se borra: lo corregido también es un dato.",
    },
    {
      titulo: "Medir el horno de verdad",
      detalle:
        "Tiempo real de cada ciclo y cuánto hace falta para que las placas sequen, medido y no estimado.",
    },
    {
      titulo: "Bajar las roturas",
      detalle:
        "Saber dónde, por qué y de qué modelo se rompe cada placa, para atacar la causa.",
    },
    {
      titulo: "Cumplir el plan del día",
      detalle:
        "Que cada sector vea lo pedido y lo hecho, y que los desvíos queden explicados.",
    },
    {
      titulo: "Todo desde el celular",
      detalle:
        "Pantallas simples, de pocos toques, pensadas para usar en planta y con guantes.",
    },
  ],
  glosario: [
    { termino: "Secadero", definicion: "El carro donde se cargan las placas para secar." },
    {
      termino: "Circuito",
      definicion: "El recorrido de un secadero: vacío → húmedo → horno → seco → vacío.",
    },
    { termino: "Hornada", definicion: "Los secaderos que entran juntos al horno." },
    {
      termino: "Rehorneado",
      definicion: "Un secadero que salió sin secar bien y vuelve al horno, marcado.",
    },
    {
      termino: "Secado al sol",
      definicion: "Un secadero que secó sin entrar al horno; no cuenta en el tiempo de horno.",
    },
    {
      termino: "Guardas",
      definicion: "Tipo de secadero que se llena y descarga a mano, fuera del carrusel.",
    },
    {
      termino: "Cumplimiento",
      definicion: "Lo hecho contra lo pedido en el plan del día, en porcentaje.",
    },
    {
      termino: "Desvío",
      definicion: "La diferencia entre el plan y lo hecho; no se carga, se calcula. Solo se explica el motivo.",
    },
  ],
};

/** Lee el JSON guardado; si falta o esta roto, vuelve la version por defecto. */
export function parsearRumbo(valor: string | null | undefined): Rumbo {
  if (!valor) return RUMBO_POR_DEFECTO;
  try {
    const r = esquemaRumbo.safeParse(JSON.parse(valor));
    return r.success ? r.data : RUMBO_POR_DEFECTO;
  } catch {
    return RUMBO_POR_DEFECTO;
  }
}

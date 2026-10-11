import "server-only";

/**
 * Envio de WhatsApp por CallMeBot.
 *
 * Es un servicio gratuito pensado para mandarse avisos a uno mismo: el dueño
 * del numero le escribe al bot una vez, recibe una clave, y con esa clave la
 * app puede mandarle mensajes a ese numero y a ningun otro. Alcanza para un
 * informe diario a una persona sin cuenta de empresa en Meta.
 *
 * Configuracion, en las variables de entorno:
 *   WHATSAPP_TELEFONO   el numero con codigo de pais, ej. +5493511234567
 *   CALLMEBOT_APIKEY    la clave que manda el bot
 */
export async function enviarWhatsApp(texto: string): Promise<void> {
  const telefono = process.env.WHATSAPP_TELEFONO;
  const clave = process.env.CALLMEBOT_APIKEY;
  if (!telefono || !clave) {
    throw new Error(
      "Faltan WHATSAPP_TELEFONO o CALLMEBOT_APIKEY en las variables de entorno.",
    );
  }

  const url = new URL("https://api.callmebot.com/whatsapp.php");
  url.searchParams.set("phone", telefono);
  url.searchParams.set("text", texto);
  url.searchParams.set("apikey", clave);

  const r = await fetch(url, { cache: "no-store" });
  const cuerpo = await r.text();
  // CallMeBot contesta 200 aun cuando rechaza el pedido (clave mala, numero
  // sin activar) y lo dice en el texto. Por eso se exige la confirmacion
  // ("Message queued") en vez de buscar palabras de error.
  if (!r.ok || !/queued/i.test(cuerpo)) {
    throw new Error(`CallMeBot rechazó el envío (${r.status}): ${cuerpo.slice(0, 300)}`);
  }
}

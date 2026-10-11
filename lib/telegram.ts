import "server-only";

/**
 * Envio de mensajes por un bot de Telegram.
 *
 * Es la API oficial de Telegram: gratis, sin cupo y sin intermediarios. El
 * bot lo crea el dueño con @BotFather, y solo puede escribirle a quien antes
 * le haya escrito a el, asi que no hay forma de que mande mensajes a otros.
 *
 * Configuracion, en las variables de entorno:
 *   TELEGRAM_BOT_TOKEN  el token que da @BotFather al crear el bot
 *   TELEGRAM_CHAT_ID    a quien se le manda: el Id que da @userinfobot
 *
 * El texto va en el HTML de Telegram (<b>, <i>): lo que no sea etiqueta
 * tiene que llegar escapado con `escaparHtml`.
 */
export async function enviarTelegram(html: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error(
      "Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en las variables de entorno.",
    );
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" }),
    cache: "no-store",
  });

  // Telegram contesta {"ok":true,...} o {"ok":false,"description":"..."}, y
  // la descripcion dice que fallo: chat inexistente, bot sin iniciar, etc.
  const cuerpo = (await r.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;
  if (!r.ok || !cuerpo?.ok) {
    throw new Error(
      `Telegram rechazó el envío (${r.status}): ${cuerpo?.description ?? "sin detalle"}`,
    );
  }
}

/** Escapa lo que Telegram leeria como HTML. */
export const escaparHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

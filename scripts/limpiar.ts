/**
 * Deja la base como recien instalada, para arrancar con los datos reales.
 *
 *   npm run db:limpiar              -> muestra que se va a borrar, sin tocar nada
 *   npm run db:limpiar -- --confirmar  -> borra de verdad
 *
 * Borra: movimientos, contenido de secaderos, secaderos, modelos y usuarios de
 * prueba. Conserva: el usuario admin, los motivos de desperdicio y los
 * parametros de configuracion.
 */
import { config as cargarEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ne, sql as raw } from "drizzle-orm";
import {
  movimientoLineas,
  movimientos,
  productos,
  secaderoContenido,
  secaderos,
  usuarios,
} from "../lib/db/schema";

cargarEnv({ path: [".env.local", ".env"], quiet: true });

const confirmado = process.argv.includes("--confirmar");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en el entorno.");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  const contar = async (nombre: string) => {
    const [r] = await db.execute<{ n: number }>(
      raw`select count(*)::int as n from ${raw.identifier(nombre)}`,
    );
    return Number(r.n);
  };

  console.log("Estado actual:");
  for (const t of [
    "movimientos",
    "movimiento_lineas",
    "secadero_contenido",
    "secaderos",
    "productos",
    "usuarios",
    "motivos_desperdicio",
  ]) {
    console.log(`  ${t.padEnd(20)} ${await contar(t)}`);
  }

  if (!confirmado) {
    console.log(
      "\nSimulacion: no se borro nada.\n" +
        "Para borrar de verdad: npm run db:limpiar -- --confirmar",
    );
    await client.end();
    return;
  }

  await db.transaction(async (tx) => {
    // El orden respeta las claves foraneas.
    await tx.delete(movimientoLineas);
    await tx.delete(movimientos);
    await tx.delete(secaderoContenido);
    await tx.delete(secaderos);
    await tx.delete(productos);
    // El admin se conserva: si no, quedas sin poder entrar al panel.
    await tx.delete(usuarios).where(ne(usuarios.usuario, "admin"));
  });

  // Los contadores vuelven a empezar de 1, asi el primer secadero real es el 1.
  await db.execute(
    raw`alter sequence secaderos_id_seq restart with 1`,
  );
  await db.execute(raw`alter sequence productos_id_seq restart with 1`);
  await db.execute(raw`alter sequence movimientos_id_seq restart with 1`);

  console.log("\nListo. Quedaron:");
  console.log(`  usuarios              ${await contar("usuarios")} (solo admin)`);
  console.log(`  motivos_desperdicio   ${await contar("motivos_desperdicio")}`);
  console.log("\nCarga tus secaderos y modelos reales desde Administracion.");

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Deja la base lista para arrancar en limpio, con dos alcances posibles.
 *
 *   npm run db:limpiar                    -> muestra que hay, sin tocar nada
 *   npm run db:limpiar -- --movimientos   -> borra solo el historial y pone
 *                                            todos los secaderos en vacio
 *   npm run db:limpiar -- --todo          -> ademas borra secaderos, productos
 *                                            y usuarios de prueba
 *
 * El modo `--movimientos` es el que conviene cuando ya cargaste los secaderos
 * y los productos reales y solo querés tirar los movimientos de prueba.
 * El modo `--todo` es para volver a foja cero.
 *
 * En los dos casos se conservan los tipos de secadero, los motivos de
 * desperdicio y los parametros: eso es configuracion, no dato de prueba.
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

const soloMovimientos = process.argv.includes("--movimientos");
const todo = process.argv.includes("--todo");

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

  const TABLAS = [
    "movimientos",
    "movimiento_lineas",
    "secadero_contenido",
    "secaderos",
    "productos",
    "tipos",
    "usuarios",
    "motivos_desperdicio",
  ];

  console.log("Estado actual:");
  for (const t of TABLAS) {
    console.log(`  ${t.padEnd(20)} ${await contar(t)}`);
  }

  if (!soloMovimientos && !todo) {
    console.log(`
Simulacion: no se borro nada. Elegi un alcance:

  npm run db:limpiar -- --movimientos
      Borra el historial de movimientos y deja todos los secaderos vacios.
      CONSERVA los secaderos, los productos y los usuarios que ya cargaste.
      Es el que conviene si ya tenes los datos reales adentro.

  npm run db:limpiar -- --todo
      Ademas borra los secaderos, los productos y los usuarios de prueba
      (menos el admin). Deja la base como recien instalada.

Los tipos de secadero, los motivos de desperdicio y los parametros se
conservan en los dos casos.`);
    await client.end();
    return;
  }

  if (soloMovimientos && todo) {
    throw new Error("Elegi un solo alcance: --movimientos o --todo.");
  }

  await db.transaction(async (tx) => {
    // El orden respeta las claves foraneas.
    await tx.delete(movimientoLineas);
    await tx.delete(movimientos);
    await tx.delete(secaderoContenido);

    if (todo) {
      await tx.delete(secaderos);
      await tx.delete(productos);
      // El admin se conserva: si no, quedas sin poder entrar al panel.
      await tx.delete(usuarios).where(ne(usuarios.usuario, "admin"));
    } else {
      /**
       * Sin movimientos ni contenido, un secadero que quedara en `humedo`
       * seria una inconsistencia: la app lo mostraria con placas que ya no
       * existen y fallaria al intentar moverlo. Se los devuelve a vacio.
       */
      await tx
        .update(secaderos)
        .set({ estado: "vacio", estadoDesde: new Date() });
    }
  });

  if (todo) {
    // Los contadores vuelven a empezar de 1, asi el primer secadero real es el 1.
    await db.execute(raw`alter sequence secaderos_id_seq restart with 1`);
    await db.execute(raw`alter sequence productos_id_seq restart with 1`);
  }
  await db.execute(raw`alter sequence movimientos_id_seq restart with 1`);

  console.log("\nListo. Quedaron:");
  for (const t of TABLAS) {
    console.log(`  ${t.padEnd(20)} ${await contar(t)}`);
  }
  console.log(
    todo
      ? "\nCarga los tipos, los secaderos y los productos desde Administracion."
      : "\nTodos los secaderos quedaron vacios, listos para empezar a cargar.",
  );

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

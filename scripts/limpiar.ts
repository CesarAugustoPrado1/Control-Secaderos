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
  planLineas,
  planes,
  productos,
  roturasCarrusel,
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
    "roturas_carrusel",
    "secadero_contenido",
    "secaderos",
    "productos",
    "planes",
    "plan_lineas",
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
      Borra los movimientos y las roturas del carrusel, y deja todos los
      secaderos vacios. CONSERVA los secaderos, los productos, los usuarios
      y los planes de produccion que ya cargaste.
      Es el que conviene si ya tenes los datos reales adentro.

  npm run db:limpiar -- --todo
      Ademas borra los secaderos, los productos, los planes y los usuarios
      de prueba (menos el admin). Deja la base como recien instalada.

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
    // Las roturas del carrusel son hechos registrados, igual que un
    // movimiento: si se tira el historial, se tiran con el.
    await tx.delete(roturasCarrusel);

    if (todo) {
      // Los planes solo se borran en --todo. Son ordenes hacia adelante, no
      // historial: alguien puede tener la semana que viene ya cargada y
      // querer limpiar los movimientos de prueba sin perderla.
      await tx.delete(planLineas);
      await tx.delete(planes);
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

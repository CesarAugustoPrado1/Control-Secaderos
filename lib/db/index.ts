import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * En desarrollo el hot reload vuelve a evaluar el modulo, asi que ademas del
 * cache de modulo guardamos el cliente en globalThis para no ir dejando
 * conexiones colgadas en cada recarga.
 */
const global_ = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
  drizzleDb?: Db;
};

/**
 * Cache de modulo. Es lo que evita abrir una conexion nueva por cada query:
 * sin esto, cada acceso a `db` levantaria un TCP+TLS contra Supabase (~250 ms)
 * y lo dejaria abierto hasta agotar el pooler.
 */
let cache: Db | undefined;

function conectar(): Db {
  if (cache) return cache;
  if (global_.drizzleDb) return (cache = global_.drizzleDb);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta la variable DATABASE_URL. En local: copiá .env.example a .env.local " +
        "y completala. En Vercel: cargala en Settings > Environment Variables " +
        "(marcando Production) y volvé a desplegar, porque las variables nuevas " +
        "no se aplican al deploy que ya estaba hecho.",
    );
  }

  const client =
    global_.pgClient ??
    postgres(connectionString, {
      /**
       * IMPORTANTE: DATABASE_URL tiene que apuntar al pooler en modo SESION
       * (puerto 5432), no al de transaccion (6543).
       *
       * postgres-js hace pipelining: manda varias consultas por la misma
       * conexion sin esperar la respuesta anterior. Supavisor en modo
       * transaccion no lo tolera y las consultas mueren por statement timeout o
       * quedan colgadas para siempre. Se reprodujo con solo dos consultas
       * concurrentes. En modo sesion funciona bien: 10 consultas en paralelo
       * sobre una conexion resuelven en ~36 ms.
       *
       * Como las pantallas usan Promise.all en todos lados, esto no es
       * evitable desde el codigo.
       */
      prepare: false,
      // Con pipelining andando, una conexion alcanza y sobra para este volumen.
      max: 1,
      // En serverless cada instancia ociosa retiene una conexion del pooler;
      // cerrarla al minuto libera el cupo sin penalizar el uso normal.
      idle_timeout: 60,
      // Que un pooler caido falle rapido en vez de colgar la pantalla.
      connect_timeout: 15,
    });

  cache = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    global_.pgClient = client;
    global_.drizzleDb = cache;
  }
  return cache;
}

/**
 * La conexion se abre en el primer uso, no al importar el modulo: asi
 * `next build` puede recorrer las rutas sin necesitar la base configurada.
 */
export const db = new Proxy({} as Db, {
  get: (_, prop: keyof Db) => conectar()[prop],
});

export { schema };

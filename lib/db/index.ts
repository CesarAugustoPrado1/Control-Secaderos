import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/**
 * En serverless cada invocacion puede levantar el modulo de nuevo, asi que
 * cacheamos el cliente en globalThis para no abrir una conexion por request
 * durante el desarrollo con hot reload.
 */
const global_ = globalThis as unknown as {
  pgClient?: ReturnType<typeof postgres>;
  drizzleDb?: Db;
};

function conectar(): Db {
  if (global_.drizzleDb) return global_.drizzleDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta la variable DATABASE_URL. Copiá .env.example a .env.local y completala.",
    );
  }

  const client =
    global_.pgClient ??
    postgres(connectionString, {
      // El pooler de Supabase en modo transaccion no soporta prepared statements.
      prepare: false,
      max: 1,
    });

  const db = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    global_.pgClient = client;
    global_.drizzleDb = db;
  }
  return db;
}

/**
 * La conexion se abre en el primer uso, no al importar el modulo: asi
 * `next build` puede recorrer las rutas sin necesitar la base configurada.
 */
export const db = new Proxy({} as Db, {
  get: (_, prop: keyof Db) => conectar()[prop],
});

export { schema };

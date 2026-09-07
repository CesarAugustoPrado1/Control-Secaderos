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
      /**
       * En modo sesion cada conexion ocupa un lugar del pool de Supabase
       * mientras viva, y en serverless cada instancia de Vercel abre la suya.
       * Con el pool en 15, una rafaga de 25 requests llega al techo: las que
       * quedan sin cupo agotan el connect_timeout y devuelven 500, no una
       * pantalla lenta.
       *
       * Cuantas fallan depende de cuantas instancias frias hay, no del codigo.
       * Medido sobre la misma version: contra un deploy ya caliente pasaron las
       * 25; repitiendo la rafaga recien desplegado -cada instancia arranca fria
       * y pide su propia conexion- pasaron 12. El "22 de 25" que decia antes
       * este comentario era un punto intermedio, no el piso, y hacia pensar que
       * el margen era mas grande de lo que es.
       *
       * Al diagnosticar esto, ojo con dos trampas. Repetir la verificacion
       * varias veces seguidas empeora el resultado por si sola, asi que una
       * caida entre corridas no prueba que el ultimo cambio la haya causado. Y
       * el contador de `pg_stat_activity` mide backends de Supavisor, que no
       * bajan apenas se desconecta el cliente: verlo clavado en 15 es el techo
       * del pool, no necesariamente una fuga.
       *
       * Cerrar las ociosas a los 20 segundos devuelve el cupo rapido entre
       * picos. Para el volumen de la planta sobra -unos 50 movimientos por dia
       * desde un punado de celulares, lejisimos de 25 simultaneos- y el unico
       * escenario real que lo toca es un pico justo despues de un deploy. Si
       * alguna vez hiciera falta mas, se sube el pool size en Supabase: la base
       * free tolera cerca de 60 conexiones.
       */
      idle_timeout: 20,
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

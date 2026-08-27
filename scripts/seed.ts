/**
 * Carga inicial de la base.
 *
 *   npm run db:seed                  -> admin, motivos, parametros y datos de ejemplo
 *   npm run db:seed -- --sin-ejemplos -> solo lo imprescindible
 *
 * Es idempotente: se puede correr varias veces sin duplicar nada.
 */
import { config as cargarEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  config,
  motivosDesperdicio,
  productos,
  secaderos,
  usuarios,
  type Rol,
} from "../lib/db/schema";
import { CONFIG_POR_DEFECTO } from "../lib/configuracion";

// El seed corre fuera de Next, que es quien normalmente lee .env.local.
cargarEnv({ path: [".env.local", ".env"], quiet: true });

const conEjemplos = !process.argv.includes("--sin-ejemplos");

const MOTIVOS = [
  "Rotura en manipuleo",
  "Mal secado",
  "Borde dañado",
  "Placa golpeada",
  "Otro",
];

const USUARIOS_EJEMPLO: { usuario: string; nombre: string; rol: Rol }[] = [
  { usuario: "carrusel", nombre: "Operario Carrusel", rol: "carrusel" },
  { usuario: "horno", nombre: "Operario Horno", rol: "horno" },
  { usuario: "paletizado", nombre: "Operario Paletizado", rol: "paletizado" },
  { usuario: "auditor", nombre: "Auditoría", rol: "auditor" },
];

const PRODUCTOS_EJEMPLO = [
  { nombre: "Standard 12,5 mm", tamano: "grande" as const },
  { nombre: "Resistente a la humedad 12,5 mm", tamano: "grande" as const },
  { nombre: "Standard 9,5 mm", tamano: "chico" as const },
  { nombre: "Resistente al fuego 12,5 mm", tamano: "chico" as const },
];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL (o DIRECT_URL) en el entorno.");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  console.log("→ Parámetros por defecto");
  for (const [clave, valor] of Object.entries(CONFIG_POR_DEFECTO)) {
    await db
      .insert(config)
      .values({ clave, valor: String(valor) })
      .onConflictDoNothing();
  }

  console.log("→ Motivos de desperdicio");
  for (const nombre of MOTIVOS) {
    const existe = await db
      .select({ id: motivosDesperdicio.id })
      .from(motivosDesperdicio)
      .where(eq(motivosDesperdicio.nombre, nombre))
      .limit(1);
    if (existe.length === 0) {
      await db.insert(motivosDesperdicio).values({ nombre });
    }
  }

  const pinAdmin = process.env.ADMIN_PIN ?? "1234";
  const yaHayAdmin = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(eq(usuarios.usuario, "admin"))
    .limit(1);

  if (yaHayAdmin.length === 0) {
    await db.insert(usuarios).values({
      usuario: "admin",
      nombre: "Administrador",
      rol: "admin",
      pinHash: await bcrypt.hash(pinAdmin, 10),
    });
    console.log(`→ Usuario admin creado (usuario: admin / PIN: ${pinAdmin})`);
  } else {
    console.log("→ El usuario admin ya existía, no se toca");
  }

  if (conEjemplos) {
    console.log("→ Datos de ejemplo");

    for (const u of USUARIOS_EJEMPLO) {
      const existe = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.usuario, u.usuario))
        .limit(1);
      if (existe.length === 0) {
        await db.insert(usuarios).values({
          ...u,
          pinHash: await bcrypt.hash("1111", 10),
        });
      }
    }

    for (const p of PRODUCTOS_EJEMPLO) {
      const existe = await db
        .select({ id: productos.id })
        .from(productos)
        .where(eq(productos.nombre, p.nombre))
        .limit(1);
      if (existe.length === 0) await db.insert(productos).values(p);
    }

    // 6 secaderos de muestra: 1 a 4 grandes, 5 y 6 chicos.
    for (let numero = 1; numero <= 6; numero++) {
      const existe = await db
        .select({ id: secaderos.id })
        .from(secaderos)
        .where(eq(secaderos.numero, numero))
        .limit(1);
      if (existe.length === 0) {
        await db.insert(secaderos).values({
          numero,
          tamano: numero <= 4 ? "grande" : "chico",
        });
      }
    }

    console.log("   Operarios de prueba con PIN 1111:");
    for (const u of USUARIOS_EJEMPLO) console.log(`   · ${u.usuario}`);
    console.log(
      "   Borralos desde Administración cuando cargues los usuarios reales.",
    );
  }

  await client.end();
  console.log("\nListo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

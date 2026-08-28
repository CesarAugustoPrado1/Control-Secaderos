/**
 * Carga inicial de la base.
 *
 *   npm run db:seed                    -> admin, tipos, motivos y datos de ejemplo
 *   npm run db:seed -- --sin-ejemplos  -> solo lo imprescindible
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
  tipos,
  usuarios,
  type Rol,
} from "../lib/db/schema";
import { CONFIG_POR_DEFECTO } from "../lib/configuracion";

cargarEnv({ path: [".env.local", ".env"], quiet: true });

const conEjemplos = !process.argv.includes("--sin-ejemplos");

/**
 * Los cuatro tipos que hay hoy en la planta. Son un punto de partida: el admin
 * los renombra, les cambia la capacidad o agrega otros desde el panel.
 */
const TIPOS = [
  { nombre: "Grande", capacidad: 102, orden: 10 },
  { nombre: "Chico", capacidad: 204, orden: 20 },
  { nombre: "Guarda", capacidad: 50, orden: 30 },
  { nombre: "Especial", capacidad: 50, orden: 40 },
];

const MOTIVOS = [
  "Rotura en manipuleo",
  "Mal secado",
  "Borde dañado",
  "Placa golpeada",
  "Otro",
];

const USUARIOS_EJEMPLO: { usuario: string; nombre: string; rol: Rol }[] = [
  { usuario: "carrusel", nombre: "Operario Carrusel", rol: "carrusel" },
  { usuario: "llenado", nombre: "Operario Llenado Manual", rol: "llenado_manual" },
  { usuario: "horno", nombre: "Operario Horno", rol: "horno" },
  { usuario: "paletizado", nombre: "Operario Paletizado", rol: "paletizado" },
  { usuario: "auditor", nombre: "Auditoría", rol: "auditor" },
];

const PRODUCTOS_EJEMPLO: { nombre: string; tipo: string }[] = [
  { nombre: "Standard 12,5 mm", tipo: "Grande" },
  { nombre: "Resistente a la humedad 12,5 mm", tipo: "Grande" },
  { nombre: "Standard 9,5 mm", tipo: "Chico" },
  { nombre: "Resistente al fuego 12,5 mm", tipo: "Chico" },
  { nombre: "Guarda estándar", tipo: "Guarda" },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en el entorno.");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  console.log("→ Parámetros por defecto");
  for (const [clave, valor] of Object.entries(CONFIG_POR_DEFECTO)) {
    await db
      .insert(config)
      .values({ clave, valor: String(valor) })
      .onConflictDoNothing();
  }

  console.log("→ Tipos de secadero");
  const idsTipo = new Map<string, number>();
  for (const t of TIPOS) {
    const [existe] = await db
      .select({ id: tipos.id })
      .from(tipos)
      .where(eq(tipos.nombre, t.nombre))
      .limit(1);
    if (existe) {
      idsTipo.set(t.nombre, existe.id);
    } else {
      const [creado] = await db.insert(tipos).values(t).returning({ id: tipos.id });
      idsTipo.set(t.nombre, creado.id);
    }
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
      if (existe.length === 0) {
        await db
          .insert(productos)
          .values({ nombre: p.nombre, tipoId: idsTipo.get(p.tipo)! });
      }
    }

    // Unos pocos secaderos de muestra. Los reales se cargan por rango desde
    // Administracion, que es lo practico cuando son 250.
    const muestra = [
      { numero: 1, tipo: "Grande" },
      { numero: 2, tipo: "Grande" },
      { numero: 3, tipo: "Chico" },
      { numero: 4, tipo: "Chico" },
      { numero: 5, tipo: "Guarda" },
      { numero: 6, tipo: "Especial" },
    ];
    for (const s of muestra) {
      const existe = await db
        .select({ id: secaderos.id })
        .from(secaderos)
        .where(eq(secaderos.numero, s.numero))
        .limit(1);
      if (existe.length === 0) {
        await db
          .insert(secaderos)
          .values({ numero: s.numero, tipoId: idsTipo.get(s.tipo)! });
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

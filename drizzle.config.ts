import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Las migraciones necesitan la conexion directa, no el pooler en modo transaccion.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});

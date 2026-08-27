/**
 * Verifica que un deploy este sano, de punta a punta.
 *
 *   npm run verificar-deploy
 *   npm run verificar-deploy -- https://otra-url.vercel.app
 *
 * Recorre las pantallas protegidas y despues manda una rafaga de 25 requests en
 * paralelo, que es lo que fuerza a Vercel a levantar varias instancias: ahi es
 * donde se notan las fugas de conexiones, que en un server local de una sola
 * instancia no aparecen nunca.
 *
 * Para entrar sin pasar por el login, firma una cookie de sesion con el
 * SESSION_SECRET del .env.local, que tiene que ser el mismo que el de Vercel.
 * Si las rutas redirigen a login, es justamente que no coinciden.
 */
import { config as cargarEnv } from "dotenv";
import { SignJWT } from "jose";
import postgres from "postgres";

cargarEnv({ path: [".env.local"], quiet: true });

const BASE = process.argv[2] ?? "https://control-secaderos.vercel.app";
const RUTAS = [
  "/tablero",
  "/carrusel",
  "/horno",
  "/paletizado",
  "/movimientos",
  "/estadisticas",
  "/admin/secaderos",
  "/admin/usuarios",
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 1,
    connection: { application_name: "verificacion" },
  });

  const [u] = await sql.unsafe<{ id: number; usuario: string; nombre: string }[]>(
    "select id, usuario, nombre from usuarios where rol = 'admin' limit 1",
  );

  const token = await new SignJWT({
    uid: u.id,
    usuario: u.usuario,
    nombre: u.nombre,
    rol: "admin",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(new TextEncoder().encode(process.env.SESSION_SECRET!));

  const headers = { cookie: `secaderos_sesion=${token}` };

  const backends = async () => {
    const [r] = await sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from pg_stat_activity
       where usename = current_user and application_name = 'Supavisor'`,
    );
    return r.n;
  };

  const pedir = async (ruta: string, ms = 25000) => {
    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), ms);
    const t = Date.now();
    try {
      const r = await fetch(BASE + ruta, {
        headers,
        redirect: "manual",
        signal: ctrl.signal,
      });
      await r.text();
      return { ok: r.status === 200, estado: r.status, texto: `${r.status} ${Date.now() - t}ms` };
    } catch {
      return { ok: false, estado: 0, texto: "COLGADO" };
    } finally {
      clearTimeout(corte);
    }
  };

  // Espera a que el deploy nuevo este arriba: mientras las variables no se
  // apliquen, la cookie no se valida y todo redirige a login.
  process.stdout.write("esperando el deploy nuevo");
  let listo = false;
  for (let i = 0; i < 40; i++) {
    const r = await pedir("/tablero", 15000);
    if (r.ok) {
      listo = true;
      break;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 8000));
  }
  console.log(listo ? " listo\n" : " se agoto la espera\n");
  if (!listo) {
    console.log("Las rutas siguen redirigiendo a login. Revisa el estado del deploy en Vercel.");
    await sql.end();
    return;
  }

  console.log("conexiones antes:", await backends());
  let fallas = 0;

  for (const ruta of RUTAS) {
    const r = [await pedir(ruta), await pedir(ruta)];
    if (r.some((x) => !x.ok)) fallas++;
    console.log(`${ruta.padEnd(20)} ${r.map((x) => x.texto).join("  ")}`);
  }

  // Rafaga: fuerza a Vercel a levantar varias instancias, que es donde vivia
  // la fuga de conexiones.
  const t = Date.now();
  const carga = await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      pedir(i % 2 ? "/movimientos" : "/tablero", 40000),
    ),
  );
  const buenos = carga.filter((x) => x.ok).length;
  console.log(`\n25 en paralelo: ${buenos}/25 OK en ${Date.now() - t}ms`);
  if (buenos < 25) fallas++;

  await new Promise((r) => setTimeout(r, 3000));
  console.log("conexiones despues:", await backends());
  console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} con problemas`);

  await sql.end();
}

main().catch((e) => {
  console.error("error:", (e as Error).message);
  process.exit(1);
});

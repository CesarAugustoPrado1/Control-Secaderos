# Control de Secaderos

App web para el control de secaderos de placas de yeso: seguimiento del circuito
**vacío → húmedo → horno → seco → vacío**, registro de cada movimiento con su
desperdicio, y estadísticas de tiempo de horno y roturas.

Pensada para que carrusel, horno y paletizado trabajen desde el celular, y que
administración y auditoría miren todo desde la PC.

---

## Cómo funciona el circuito

| Estado | Quién lo mueve | Qué pasa |
| --- | --- | --- |
| **Vacío** | Carrusel | Elige un secadero vacío, le carga uno o varios modelos con sus cantidades. Pasa a **húmedo**. |
| **Húmedo** | Horno | Selecciona los secaderos que entran al horno (respetando su capacidad). Pasan a **horno**. |
| **Horno** | Horno | Saca los secaderos —normalmente todos, pero puede dejar adentro el que no secó—. Pasan a **seco**. |
| **Seco** | Paletizado | Descarga las placas: las sanas van a producto terminado, las rotas a desperdicio. Vuelve a **vacío**. |

Reglas que el sistema hace cumplir:

- Un secadero **grande** solo lleva modelos de placa grande (hasta 102 por
  defecto); uno **chico**, solo modelos chicos (hasta 204). Ambos límites son
  configurables.
- En el horno entran 15 secaderos por defecto, también configurable.
- En **cada** cambio de estado se pueden registrar placas rotas con su motivo.
  El desperdicio se descuenta del contenido y queda asentado en el movimiento.
- Si dos personas tocan el mismo secadero a la vez, la segunda recibe un aviso
  claro en lugar de pisar el movimiento de la primera.
- Nada se borra: los modelos y secaderos se suspenden o se dan de baja, y los
  errores se arreglan con una **corrección** de admin que queda registrada con
  su motivo.

## Roles

- **admin** — todo: ABM de secaderos, modelos, usuarios, motivos de desperdicio
  y parámetros. Puede corregir el estado y el contenido de cualquier secadero.
- **carrusel** — carga secaderos vacíos.
- **horno** — mete y saca secaderos del horno.
- **paletizado** — descarga secaderos secos a producto terminado.
- **auditor** — ve todo, no modifica nada.

Cada usuario entra con **usuario + PIN numérico**. Tras 5 PIN incorrectos
seguidos queda bloqueado 5 minutos (un PIN de 4 dígitos son solo 10.000
combinaciones).

---

## Puesta en marcha

### 1. Base de datos en Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com) (el plan gratuito
   sobra para este volumen). Elegir la región más cercana — `South America (São
   Paulo)` si estás en Argentina.
2. Anotar la contraseña de la base que te pide al crear el proyecto.
3. Ir a **Project Settings → Database → Connection string** y copiar dos cadenas:
   - **Transaction pooler** (puerto `6543`) → va en `DATABASE_URL`
   - **Session pooler** o conexión directa (puerto `5432`) → va en `DIRECT_URL`

### 2. Configuración local

```bash
npm install
cp .env.example .env.local     # en PowerShell: copy .env.example .env.local
```

Completar `.env.local` con las dos cadenas de conexión y generar el secreto de
sesión:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Crear las tablas y los datos iniciales

```bash
npm run db:push     # crea las tablas en Supabase
npm run db:seed     # usuario admin, motivos, parámetros y datos de ejemplo
```

El seed crea el usuario **admin** con el PIN de `ADMIN_PIN` (por defecto
`1234` — cambialo apenas entres). También deja 6 secaderos, 4 modelos y un
usuario por rol con PIN `1111`, todo de ejemplo y borrable desde el panel.

Si preferís arrancar sin nada de eso:

```bash
npm run db:seed -- --sin-ejemplos
```

### 4. Levantar en local

```bash
npm run dev
```

---

## Despliegue en Vercel

1. Subir el repo a GitHub.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importar el repo.
   Vercel detecta Next.js solo, no hay que tocar la configuración de build.
3. En **Environment Variables** cargar, para *Production* y *Preview*:

   | Variable | Valor |
   | --- | --- |
   | `DATABASE_URL` | Transaction pooler de Supabase (puerto 6543) |
   | `DIRECT_URL` | Conexión directa de Supabase (puerto 5432) |
   | `SESSION_SECRET` | La cadena aleatoria que generaste |

   `ADMIN_PIN` no hace falta en Vercel: solo lo usa el seed.

4. **Deploy**. Cada push a la rama principal vuelve a desplegar.

En los celulares conviene abrir la URL y usar *Agregar a pantalla de inicio*:
la app queda como un ícono y se abre en pantalla completa.

---

## Estadísticas y datos

La pantalla de **Estadísticas** (admin y auditor) muestra, para 7 / 30 / 90 días
o un año:

- Tiempo de horno promedio, mínimo y máximo, abierto por tipo de placa, más el
  detalle de los últimos ciclos uno por uno.
- Tiempo promedio en cada etapa del circuito, que sirve para ver dónde se hacen
  colas.
- Desperdicio por motivo, por etapa del proceso, por modelo y por operario.
- Producción diaria de placas terminadas.

En **Movimientos** se puede filtrar por tipo, secadero, usuario y fechas, y
exportar el resultado a **CSV** (una fila por modelo y motivo, listo para
tabular en una planilla).

El tiempo que cada secadero pasa en un estado se calcula y se guarda en el
momento del movimiento (`duracion_min`), así las estadísticas no dependen de
reconstruir la línea de tiempo hacia atrás.

---

## Estructura

```
app/
  (app)/            pantallas con sesión iniciada
    carrusel/       carga de secaderos vacíos
    horno/          entrada y salida del horno
    paletizado/     descarga a producto terminado
    tablero/        foto del piso de planta
    movimientos/    historial filtrable + export CSV
    estadisticas/   tiempos y desperdicio
    admin/          ABM y parámetros
  login/            ingreso con usuario + PIN
lib/
  db/schema.ts      tablas y enums (Drizzle)
  acciones/
    flujo.ts        server actions del circuito de secaderos
    motor.ts        reglas de negocio y escritura de movimientos
    admin.ts        ABM
  consultas.ts      lecturas para las pantallas
  estadisticas.ts   agregaciones
components/         UI compartida
scripts/seed.ts     carga inicial
```

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run db:push` | Sincroniza el esquema con la base |
| `npm run db:studio` | Explorador de datos de Drizzle |
| `npm run db:seed` | Datos iniciales |

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
| **Vacío** | Carrusel o llenado manual | Elige un secadero vacío, le carga uno o varios modelos con sus cantidades. Pasa a **húmedo**. |
| **Húmedo** | Horno | Selecciona los secaderos que entran al horno (respetando su capacidad). Pasan a **horno**. |
| **Horno** | Horno | Saca los secaderos —normalmente todos, pero puede dejar adentro el que no secó—. Pasan a **seco**. |
| **Seco** | Paletizado o llenado manual | Descarga las placas: las sanas van a producto terminado, las rotas a desperdicio. Vuelve a **vacío**. |

Si al descargar se detecta que un secadero **no secó bien**, paletizado lo deja
en el patio y lo informa desde la misma pantalla. El secadero vuelve a
**húmedo** y aparece primero en la cola, marcado.

Paletizado nunca mete ni saca secaderos del horno: eso es responsabilidad del
hornero, y la app lo hace cumplir —la pantalla de horno no está disponible para
ese rol y la operación se rechaza en el servidor—. Lo que informa paletizado es
un hecho, no una acción sobre el horno.

La marca de rehorneado **sigue visible mientras el secadero está adentro del
horno**, no sólo en la cola: el hornero lo ubica donde pueda sacarlo rápido,
porque si se pasa se quema.

Queda registrado como un movimiento propio y no como una corrección: una
corrección señala un error de carga y esto es un hecho productivo. Mezclarlos
haría imposible distinguir un error humano de un problema de secado.

Todos los tipos de secadero recorren el mismo circuito. **No se restringe por
tipo quién carga o descarga qué**: en la planta las guardas las puede sacar
quien las cargó o cualquier otra persona, así que lo que el sistema garantiza
no es una ruta rígida sino que cada movimiento quede atribuido a quien lo hizo.
Con eso las estadísticas se pueden abrir por persona y por tipo.

Reglas que el sistema hace cumplir:

- Cada secadero es de un **tipo** (grande, chico, guarda, especial… los que
  hagan falta) y solo lleva modelos de ese mismo tipo, hasta la capacidad en
  placas que el tipo tenga definida. Los tipos se administran desde el panel:
  agregar uno nuevo no requiere tocar código ni desplegar.
- La capacidad puede quedar **sin definir**, que es lo normal en guarda y
  especial: ahí no existe un secadero “lleno”, entra lo que ese día haya. En
  esos tipos el sistema no controla la cantidad, no marca cargas incompletas y
  no los mide contra el flujo óptimo. No es lo mismo que capacidad cero.
- En el horno entran 15 secaderos por defecto, también configurable.
- En **cada** cambio de estado se pueden registrar placas rotas con su motivo.
  El desperdicio se descuenta del contenido y queda asentado en el movimiento.
- Si dos personas tocan el mismo secadero a la vez, la segunda recibe un aviso
  claro en lugar de pisar el movimiento de la primera.
- Nada se borra: los modelos y secaderos se suspenden o se dan de baja, y los
  errores se arreglan con una **corrección** de admin que queda registrada con
  su motivo.

## Roles

- **admin** — todo: ABM de secaderos, tipos, modelos, usuarios, motivos de
  desperdicio y parámetros. Puede corregir el estado y el contenido de
  cualquier secadero.
- **carrusel** — carga secaderos vacíos.
- **llenado manual** — carga y descarga secaderos. Es el sector donde se arman
  las guardas, pero puede operar cualquier tipo.
- **horno** — mete y saca secaderos del horno.
- **paletizado** — descarga secaderos secos a producto terminado.
- **auditor** — ve todo, no modifica nada.

Se pueden crear tantos usuarios por rol como haga falta: si dos personas
distintas paletizan guardas, son dos usuarios con rol *llenado manual*, y cada
movimiento queda a nombre de quien lo hizo.

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
3. Botón **Connect** (arriba, junto al nombre del proyecto) → copiar la cadena
   del **Session pooler**, puerto `5432`. Esa va en `DATABASE_URL`.

> **No uses el Transaction pooler (puerto 6543).** El driver `postgres-js` hace
> *pipelining*: manda varias consultas por la misma conexión sin esperar la
> respuesta anterior. Supavisor en modo transacción no lo soporta y las
> pantallas quedan colgadas —se reprodujo con apenas dos consultas
> concurrentes—. En modo sesión funciona bien: 10 consultas en paralelo sobre
> una conexión resuelven en ~36 ms. El detalle está comentado en
> `lib/db/index.ts`.

### 2. Configuración local

```bash
npm install
cp .env.example .env.local     # en PowerShell: copy .env.example .env.local
```

Completar `.env.local` con la cadena de conexión y generar el secreto de
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
`1234` — cambialo apenas entres), los cuatro tipos de secadero y los motivos de
desperdicio. También deja 6 secaderos, 5 modelos y un usuario por rol con PIN
`1111`, todo de ejemplo y borrable desde el panel.

Para cargar los secaderos reales —que son unos 250— no los des de alta de a
uno: en **Administración → Secaderos** hay un **alta por rango** que crea del N
al M con un tipo, salteando los números que ya existan. Así podés hacer el
grueso en dos o tres operaciones y después corregir a mano los que sean de otro
tipo.

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
   | `DATABASE_URL` | Session pooler de Supabase (puerto 5432) |
   | `SESSION_SECRET` | La cadena aleatoria que generaste |

   `ADMIN_PIN` no hace falta en Vercel: solo lo usa el seed.

4. **Deploy**. Cada push a la rama principal vuelve a desplegar.

El `vercel.json` fija la región de las funciones en `gru1` (São Paulo), la misma
que la base. Si creaste el proyecto de Supabase en otra región, cambiá ese valor:
tener las funciones lejos de la base suma más de 100 ms por consulta.

En los celulares conviene abrir la URL y usar *Agregar a pantalla de inicio*:
la app queda como un ícono y se abre en pantalla completa.

---

## Estadísticas y datos

La pantalla de **Estadísticas** (admin y auditor) muestra, para 7 / 30 / 90 días
o un año:

- Tiempo de horno promedio, mínimo y máximo, abierto por tipo de placa, más el
  detalle de los últimos ciclos uno por uno.
- Secaderos que no secaron bien, comparando cuánto duró el horneado de los
  ciclos que no alcanzaron contra el de los que sí. Esa diferencia es la que
  indica el tiempo mínimo real de horno, medido y no estimado.
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
| `npm run db:limpiar` | Muestra qué hay en cada tabla y explica los alcances. No toca nada |
| `npm run db:limpiar -- --movimientos` | Borra sólo el historial y deja todos los secaderos vacíos. **Conserva secaderos, productos y usuarios** |
| `npm run db:limpiar -- --todo` | Además borra secaderos, productos y usuarios de prueba (menos el admin) |
| `npm run verificar-deploy` | Recorre las pantallas del deploy y le manda una ráfaga en paralelo |

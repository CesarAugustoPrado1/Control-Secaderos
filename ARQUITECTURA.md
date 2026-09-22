# Control de Secaderos — documento de arquitectura

Documento de referencia para reconstruir esta aplicación o construir una
parecida. No es un tutorial: es el registro de **qué hace, cómo está armado y
por qué se tomó cada decisión**, con foco en las que no son obvias y en las que
costaron caro.

Está escrito para que otra IA lo use como base de diseño. Las secciones de
“trampas” y “decisiones” valen más que las de estructura: la estructura se
deduce del código, las razones no.

---

## 1. Qué resuelve

Una fábrica de placas de yeso. Las placas recién formadas están húmedas y hay
que secarlas. Se cargan en **secaderos** (carros/bastidores de unas 250
unidades), que recorren siempre el mismo circuito:

```
vacío → húmedo → horno → seco → vacío
```

El sistema registra cada cambio de estado, con quién lo hizo, cuándo, qué
modelos y cuántas placas, y cuántas se rompieron en el camino. Con eso responde:
cuánto tarda el horno de verdad, dónde se hacen colas, cuánto se desperdicia y
por qué, y si lo que se produjo coincide con lo que se pidió.

**Contexto de uso, que condiciona todo el diseño:**

- Los operarios trabajan **desde el celular, en el piso de planta**, con WiFi
  irregular y a veces con guantes.
- Administración y auditoría miran desde la PC.
- Volumen real: ~250 secaderos, ~50 movimientos por día, un puñado de usuarios
  concurrentes. **Es una app de bajo volumen y alta exigencia de claridad**, no
  al revés. Optimizar throughput sería resolver el problema equivocado.

---

## 2. Stack

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) | Server Components + Server Actions evitan escribir una API REST para un CRUD con reglas |
| UI | React 19 + Tailwind v4 | — |
| ORM | Drizzle | Tipado real contra el esquema; `drizzle-kit push` sin archivos de migración |
| Base | PostgreSQL en Supabase | Plan gratuito alcanza de sobra para este volumen |
| Driver | `postgres` (postgres-js) | Ver §9: la elección del modo de pooler es crítica |
| Sesión | JWT firmado con `jose`, en cookie | Sin tabla de sesiones |
| Hash de PIN | `bcryptjs` | — |
| Excel | `exceljs` | Import/export de secaderos y productos |
| Deploy | Vercel, región `gru1` (São Paulo) | Misma región que la base: estar lejos suma +100 ms por consulta |

Idioma: **todo en español rioplatense**, incluidos nombres de tablas, columnas,
funciones y variables. Los comentarios de código van **sin tildes** (evita
problemas de codificación en terminales Windows); los textos de UI **con
tildes**. Los mensajes de commit, en español sin tildes.

---

## 3. Modelo de dominio

### 3.1 El circuito

| Estado | Quién lo mueve | Qué pasa |
| --- | --- | --- |
| **Vacío** | Carrusel / Llenado manual | Elige un secadero vacío y le carga modelos con cantidades → **húmedo** |
| **Húmedo** | Horno | Selecciona los que entran al horno, respetando cupos → **horno** |
| **Horno** | Horno | Saca los que terminaron; puede dejar adentro el que no secó → **seco** |
| **Seco** | Paletizado / Llenado manual | Descarga: sanas a producto terminado, rotas a desperdicio → **vacío** |

**Dos circuitos, un solo horno.** El carril principal lo llena el carrusel y lo
descarga paletizado: dos puestos distintos en las dos puntas. El circuito
manual —hoy las guardas— tiene **un solo operario que hace las dos puntas**:
llena el secadero a mano y, cuando el horno se lo devuelve seco, lo descarga él
mismo. El tramo del horno es el único compartido: el hornero mete y saca todo.

Qué secaderos van por cada circuito lo define `tipos.llenado_manual`, no el
nombre del tipo ni el rol del usuario. Ver 4.4.

Dos salidas del carril principal, y **cada una tiene su propio tipo de
movimiento**, no una nota ni una corrección:

- **Devolución de horno** (`devolucion_horno`): salió sin secar bien y vuelve a
  húmedos, marcado y primero en la cola. Es un hecho productivo, no un error
  humano. Mezclarlo con `correccion` haría imposible distinguir un problema de
  secado de un error de carga.
- **Secado natural** (`secado_natural`): húmedo → seco **sin pasar por el
  horno**, típicamente al sol. Lo decide el hornero.

### 3.2 Regla de oro sobre los tipos de movimiento

> **Si dos cosas se van a medir distinto, son dos tipos de movimiento
> distintos.**

Es la decisión más importante del modelo. Toda la estadística de horno mide
`duracion_min` de los movimientos `salida_horno`. Si el secado al sol se
registrara como una salida de horno, esperas de un día entero entrarían al
promedio de un ciclo de cinco horas y romperían el único número que dice cuánto
hay que hornear de verdad.

Corolario práctico: las consultas de estadística **filtran explícitamente por
tipo de movimiento**. Agregar un tipo nuevo lo deja fuera de los cálculos viejos
automáticamente, que es el comportamiento correcto por defecto.

### 3.3 Corregir un error: quién, cuándo, cómo

Todo movimiento del piso se puede corregir, con **una sola regla**, que es la
que se le explica al operario:

> **Cada uno puede corregir lo último que hizo con un secadero, mientras nadie
> lo haya tocado después, y en el mismo día.**

- **Solo el autor.** Si dos operarios comparten turno y uno corrige la carga
  del otro, la responsabilidad se diluye.
- **Mientras nadie lo tocó después.** La ventana se cierra sola cuando el
  siguiente puesto trabaja encima: si el hornero ya metió el secadero, registró
  roturas sobre ese contenido, y cambiar la carga es reescribir su trabajo. Se
  mide como "es el último movimiento **vigente** del secadero", por id y con el
  secadero bloqueado.
- **Mismo día.** Cambiar los números de ayer después de que el administrativo
  leyó el resumen es justo lo que no hay que permitir.
- **El admin** no tiene las restricciones de autor ni de día. La de "nadie lo
  tocó después" no la saltea nadie: no es un permiso, es lo que hace que
  deshacer un paso tenga sentido. Pasado ese punto queda la corrección forzada
  de Administración (`correccion`), que arregla el secadero pero **no** los
  reportes.

Vale para los seis tipos del piso: carga, entrada y salida de horno, secado al
sol, descarga y devolución. En la carga se corrige qué y cuánto se cargó; en
todos los demás, las roturas (el contenido de entrada vino del paso anterior,
que es de otro). Y cualquiera se puede **anular** entero: es para lo que no se
arregla cambiando un número, como cargar el 45 cuando era el 54.

**Cómo funciona.** Corregir es anular y rehacer en una sola transacción:

1. El original **no se borra ni se edita**: queda con `anulado_en`,
   `anulado_por` y `motivo_anulacion`. Sus datos siguen diciendo lo que se
   registró (el 36), porque el error también es un dato.
2. El secadero se restaura a como estaba **antes** de ese movimiento. No hace
   falta mirar nada más que el propio movimiento, gracias a la convención de
   `movimiento_lineas`: lo que había antes es `cantidad + desperdicio`, producto
   por producto. El reloj se restaura con `creado_en − duracion_min`.
3. Si es una corrección, se rehace el mismo movimiento con los datos buenos,
   pasando por las **mismas validaciones** que la primera vez. El reemplazo
   lleva el mismo tipo, **la hora y el autor del original**, y `reemplaza_a`
   apuntando a él.

Por el punto 3, para cualquier reporte el reemplazo es sencillamente la carga
de ese día, de esa persona. Por eso **toda consulta que sume movimientos filtra
los anulados** con `vigente()` (`lib/vigencia.ts`), o con `anulado_en is null`
en el SQL crudo. Si una consulta nueva se lo olvida, una carga corregida cuenta
dos veces. Las que muestran historia —el listado del admin, el CSV— los traen
marcados, con `incluirAnulados`.

Anular una salida de horno valida el cupo, porque devuelve el secadero al
horno. Una corrección que no cambia nada se rechaza, para no dejar en el
historial un error que no existió.

**Prevenir antes que corregir.** Una carga incompleta pide confirmación con el
número grande (*"Vas a cargar 36 de 204 en el secadero 3. ¿Es correcto?"*). La
completa, que es casi todo el día, no pregunta: una confirmación en cada
movimiento se termina tocando sin leer. El botón lleva siempre el total y el
número de secadero.

La regla vive en `lib/correccion.ts` (puro, sin base), la mecánica en
`lib/acciones/motor-correccion.ts` y las acciones en
`lib/acciones/correcciones.ts`.

### 3.4 Roles

| Rol | Qué hace |
| --- | --- |
| `admin` | Todo. ABM completo y corrección de estado/contenido de cualquier secadero |
| `carrusel` | Carga secaderos vacíos |
| `llenado_manual` | Carga **y** descarga, en una sola pantalla. Es el puesto de las guardas |
| `horno` | Mete y saca del horno; decide el secado al sol |
| `paletizado` | Descarga secaderos secos |
| `administrativo` | Ve el resumen de producción del día. No opera |
| `auditor` | Ve todo, no modifica nada |

**Lo que se separa es la navegación, no el permiso de mover un secadero.** Cada
pantalla lista solo los secaderos de su circuito —carrusel y paletizado no ven
las guardas, llenado manual no ve el resto—, pero las server actions de carga y
descarga **no miran el tipo**. En la planta las guardas las saca quien las cargó
o cualquier otro, y el sistema no garantiza una ruta rígida sino que **cada
movimiento quede atribuido a quien lo hizo**; con eso las estadísticas se abren
por persona y por tipo. Filtrar las listas alcanza para que nadie se equivoque
de pantalla sin convertir un imprevisto de piso en un error del sistema.

Sí se restringe una cosa, porque es responsabilidad y no preferencia:
**paletizado nunca mete ni saca del horno**. Si detecta que algo no secó, lo
informa desde su pantalla y el sistema lo devuelve a húmedo; la operación sobre
el horno la hace el hornero.

---

## 4. Esquema de base

### 4.1 Tablas

```
usuarios              usuario, nombre, pin_hash, rol, activo,
                      intentos_fallidos, bloqueado_hasta
tipos                 nombre, capacidad, cupo_horno, llenado_manual,
                      activo, orden
productos             nombre, tipo_id, activo
secaderos             numero, tipo_id, estado, activo, estado_desde
secadero_contenido    secadero_id, producto_id, cantidad     (snapshot vivo)
movimientos           secadero_id + snapshots, tipo, estado_desde, estado_hasta,
                      usuario_id + nombre, duracion_min, nota, creado_en,
                      anulado_en + anulado_por + motivo_anulacion, reemplaza_a
movimiento_lineas     movimiento_id, producto_id + nombre,
                      cantidad, desperdicio, motivo_id + nombre
roturas_carrusel      producto_id + nombre, cantidad, motivo, usuario, creado_en
consumo_yeso          tipo (bolson|balde_desperdicio), cantidad,
                      kg_por_unidad, usuario, nota, creado_en
motivos_desperdicio   nombre, activo
motivos_desvio        nombre, activo
planes                fecha (date), sector, nota
plan_lineas           plan_id, producto_id, secaderos, destino, cliente,
                      motivo_desvio_id, nota_desvio, explicado_por
notas_horno           fecha (date, PK), carga, descarga, actualizado_por
                      (texto libre para el hornero; no es un plan ni se mide)
config                clave (PK), valor (text)
```

### 4.2 Cuatro convenciones que atraviesan todo

**a) Snapshots en el historial.** `movimientos` guarda `secadero_numero`,
`secadero_tipo_nombre`, `usuario_nombre`; `movimiento_lineas` guarda
`producto_nombre` y `motivo_nombre`. El historial se sigue leyendo aunque
después se renombre un producto o un usuario. Las FK se conservan igual, para
poder agrupar por id cuando hace falta.

**b) `null` con significado propio, distinto de cero.** Aparece tres veces y
siempre significa *“el sistema no opina sobre esto”*:

- `tipos.capacidad = null` → **sin tope fijo**. Hay tipos (guarda, especial)
  donde no existe un secadero “lleno”: entra lo que ese día haya. El sistema no
  valida cantidad, no marca cargas incompletas ni mixtas, y las deja fuera de la
  adherencia al flujo. **Cero seguiría siendo inválido** (un secadero donde no
  entra nada).
- `tipos.cupo_horno = null` → comparte el cupo general del horno.
- `planes` sin fila para un día → **“sin plan”**, que no es un plan de cero y se
  mide distinto.

Consecuencia de UI: el campo vacío es el que produce `null`. Nunca usar
`Number("")`, que da `0` y significa otra cosa.

**c) Nada se borra.** Modelos y secaderos se **suspenden** o se dan de baja. Los
errores se arreglan con una **corrección de admin**, que queda registrada como
movimiento con motivo obligatorio. Las únicas bajas físicas son de registros
sueltos mal cargados (una rotura, un registro de yeso) y **solo las hace el
admin**: si el que carga el número puede borrarlo después, el registro deja de
servir para medir.

**d) La duración se calcula al escribir, no al leer.** `movimientos.duracion_min`
guarda cuánto duró el estado **anterior**. Se calcula en el momento del
movimiento contra `secaderos.estado_desde`. Así las estadísticas no reconstruyen
líneas de tiempo hacia atrás secadero por secadero. La lectura es:

```
salida_horno    → tiempo de horno
entrada_horno   → espera del húmedo antes de entrar
descarga        → espera del seco antes de paletizarse
carga           → cuánto estuvo el secadero parado sin usar
```

Excepción: la corrección de admin que no cambia de estado usa
`conservarInicioDeEstado`, para que arreglar un tipeo no se lleve puesto el
tiempo de horno medido de ese secadero.

### 4.3 Capacidad y cupo: dos números distintos, los dos por tipo

- **`tipos.capacidad`** = cuántas placas entran en un secadero de ese tipo
  (Grande 102, Chico 204, Guarda y Especial `null`).
- **`tipos.cupo_horno`** = cuántos secaderos de ese tipo entran al horno **en
  lugares propios**. Las guardas van en su propia estructura: entran 4 y no
  ocupan ninguno de los 15 lugares generales.
- **`config.capacidad_horno`** = los lugares generales, que se reparten los
  tipos con `cupo_horno = null`.

**Por qué el cupo vive en el tipo y no como un segundo parámetro global:** un
`capacidad_horno_guardas` obligaría al código a saber qué tipo se llama
“Guarda”, y ese nombre es editable desde el panel. La regla se rompería en
silencio el día que alguien lo cambie. Con el cupo en la tabla, mañana se le da
cupo propio a otro tipo sin tocar código.

El mismo razonamiento explica por qué las capacidades **no** están en `config`:
son propias del tipo y los tipos se agregan en caliente.

### 4.4 `tipos.llenado_manual`: de qué circuito es el tipo

Bandera por tipo, con el mismo razonamiento que `cupo_horno`: atar la lógica al
nombre “Guarda” la rompe en silencio el día que alguien lo renombre desde el
panel.

Marcado, el tipo sale del circuito del carrusel:

| | Carrusel | Paletizado | Llenado manual | Horno |
| --- | --- | --- | --- | --- |
| Tipos normales | llena | descarga | — | mete y saca |
| Tipos manuales | — | — | llena **y** descarga | mete y saca |

Qué se filtra con la bandera:

- **Buscadores de secadero** de las tres pantallas de piso. Un número del otro
  circuito no aparece ni siquiera como ocupado: para ese operario no existe.
- **Actividad del día** de cada pantalla.
- **Productos** ofrecidos al reportar roturas de línea y al cargar el plan.
- **Comparación contra el plan** (`compararPlan`): el plan es del carrusel y de
  paletizado, así que lo hecho a mano no cuenta ni como cumplido ni como fuera
  de plan. Contarlo le acreditaría al carrusel secaderos que no cargó.
- **Resumen de producción**: sectores propios. Ver abajo.

Qué **no** filtra: el horno, el tablero, el historial de movimientos, las
estadísticas y las server actions de carga y descarga.

**Los sectores del resumen son cinco, no cuatro.** Llenar y descargar son dos
operaciones sobre la misma placa: meterlas en una sola tarjeta “Llenado manual”
contaría cada placa dos veces y el total del sector no querría decir nada. Van
como `llenado_manual` y `descarga_manual`, espejo de carrusel y paletizado. El
horno no se parte porque procesa los dos circuitos. Los dos sectores manuales
**se omiten los días sin movimiento**: las guardas se hacen de vez en cuando y
dos tarjetas vacías todos los días tapan lo que importa.

**De qué lado cae un movimiento lo decide la bandera de HOY**, no un snapshot
en la fila. Es una decisión de cómo está organizada la planta, no un dato del
movimiento: el día que las guardas vuelvan al carrusel, el histórico tiene que
leerse con la organización nueva. Es la excepción deliberada a la convención de
snapshots de 4.2.

---

## 5. Arquitectura del código

```
app/
  (app)/              pantallas con sesión
    carrusel/         carga de secaderos vacíos + roturas + yeso
    horno/            entrada/salida de horno + secado al sol
    paletizado/       descarga a producto terminado
    tablero/          foto del piso (por estado, tipo o modelo)
    produccion/       resumen del día para oficina
    movimientos/      historial filtrable + export CSV
    estadisticas/     tiempos, desperdicio, adherencia
    admin/            ABM y parámetros
  login/
lib/
  db/schema.ts        tablas y enums
  db/index.ts         cliente postgres cacheado (ver §9)
  consultas.ts        TODAS las lecturas para pantallas
  acciones/
    motor.ts          reglas de negocio y escritura de movimientos
    flujo.ts          server actions del circuito
    admin.ts          ABM
    roturas.ts        roturas del carrusel
    yeso.ts           bolsones y baldes
    planillas.ts      import Excel
    comun.ts          Resultado, ErrorDeNegocio, esquemas zod compartidos
  estadisticas.ts     agregaciones
  plan.ts             comparación plan vs. real
  permisos.ts         rol → rutas, navegación
  auth.ts / session.ts
  estados.ts          etiquetas y colores (módulo puro, cliente y servidor)
  formato.ts          fechas, números, kilos, duraciones
components/           UI compartida
scripts/              seed, limpiar, verificar-deploy
middleware.ts
```

### 5.1 El motor

`lib/acciones/motor.ts` concentra lo que no puede estar disperso:

- **`bloquearSecaderos(tx, ids)`** — `SELECT ... FOR UPDATE`. Es lo que evita
  que dos operarios con la pantalla abierta muevan el mismo secadero: el segundo
  espera y después falla la validación de estado.
- **`exigirEstado(secadero, esperado)`** — mensaje concreto:
  *“El secadero 42 ya no está húmedo: alguien lo pasó a horno. Actualizá la
  pantalla.”*
- **`validarCarga`** — un secadero solo lleva modelos de su mismo tipo; el total
  no pasa la capacidad **si el tipo tiene tope**.
- **`aplicarMovida`** — escribe el movimiento y sus líneas, **reemplaza entero**
  el contenido vivo (es un snapshot, no un historial) y actualiza estado +
  `estado_desde`.

Toda operación de flujo corre **dentro de una transacción** y empieza
bloqueando.

### 5.2 Convención de `movimiento_lineas`

Sostenida en todo el sistema, y hay que respetarla o las sumas mienten:

- `cantidad` = placas que **siguen en el circuito** después del movimiento. En
  una descarga, las que se fueron a producto terminado.
- `desperdicio` = placas descartadas **en ese movimiento**, no acumulado.

Si un mismo modelo se rompió por dos motivos distintos, los motivos extra abren
líneas adicionales con `cantidad = 0`, para que sumar `cantidad` y `desperdicio`
por separado siga dando bien.

### 5.3 Resultado uniforme de las acciones

```ts
type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }
```

`ejecutar()` envuelve toda action: traduce `ErrorDeNegocio` (esperable, se
muestra al usuario) y `ZodError` a mensajes legibles, y cualquier otra excepción
a un error genérico + log. `fallar(mensaje)` lanza el error de negocio y aborta
la transacción.

Del lado del cliente, `useAccion()` reintenta **hasta 3 veces solo los fallos de
red** —la conexión en planta se corta— pero **nunca** reintenta un
`{ ok: false }`: eso es un rechazo de negocio y daría siempre lo mismo. Si se
queda sin reintentos, el mensaje dice explícitamente *“El movimiento NO se
guardó”*, que es lo que el operario necesita saber.

### 5.4 Seguridad en dos capas

- **`middleware.ts`** controla la navegación: rutas públicas, redirección a
  login, redirección de la raíz a la pantalla del rol, y `puedeVer(rol, ruta)`.
- **Cada server action revalida por su cuenta** con `autorizar(...roles)`. El
  middleware **no es una frontera de seguridad suficiente**: una action se puede
  invocar directamente.

`requerirSesion()` (páginas) y `autorizar()` (actions) **revalidan contra la
base** que el usuario siga activo, y el rol de la base pisa al de la cookie. Si
el admin da de baja a alguien, la sesión deja de servir en el próximo request en
vez de durar los 30 días del token.

Diferencia importante: en páginas se **redirige**; en actions se **falla con
mensaje**, porque `redirect()` lanza una excepción de control de flujo que se
confundiría con un fallo de negocio.

Login: usuario + PIN numérico (4 a 8 dígitos), bcrypt. **Tras 5 PIN incorrectos,
bloqueo de 5 minutos**: un PIN de 4 dígitos son 10.000 combinaciones y sin freno
se prueba entero en minutos.

---

## 6. Patrones de UI para piso de planta

Son decisiones de producto, no de estética, y explican buena parte del código.

**El caso típico en un toque.** En el carrusel, “Secadero completo” viene
tildado: el operario toca el producto y queda la capacidad entera. El producto
**no** viene preseleccionado a propósito — elegirlo siempre a mano es lo que
evita cargar la tanda equivocada.

**Los controles que necesitan un número desaparecen si ese número no existe.**
En tipos sin tope fijo no se muestran el atajo de completo, la barra de avance
ni el botón de “+lo que falta”. Mostrar “0 / 0” sería peor que no mostrar nada.

**El contador es una puerta, no un número muerto.** En el tablero, tocar
cualquier contador abre la lista de los secaderos que lo componen. Con 250
unidades no se listan todas de entrada (sería un muro de scroll), pero todo
número es navegable.

**Lo más viejo primero.** En cualquier cola, el orden por defecto es por
antigüedad: es lo que espera hace más. Las devoluciones de horno van antes que
todo, porque ya vienen demoradas y retienen un secadero que debería producir.

**Las asimetrías del dominio se dicen en voz alta, no se esconden.** En el
tablero agrupado por modelo no hay columna de vacíos —un secadero vacío no tiene
modelo: no es un cero, es una pregunta que no se puede hacer— y un secadero
mezclado suma en cada modelo que tenga adentro, así que la suma de totales puede
pasarse de la cantidad de secaderos. La pantalla lo aclara al pie en vez de
inventar un reparto a medias.

**Los números derivados se marcan como derivados.** Los kilos de yeso salen de
multiplicar unidades por un peso configurado; nadie pesa el balde. La pantalla lo
dice, porque ese número se va a citar en una reunión.

**El indicador que sirve es el que no se mueve con el volumen.** Junto a los
kilos de yeso se muestra el **porcentaje** tirado sobre el que entró: los kilos
sueltos suben y bajan con la producción del período, la relación no.

---

## 7. Import/export Excel

Dos decisiones que valen más que el código (`lib/acciones/planillas.ts`):

1. **La planilla nunca borra.** Lo que no está en el archivo queda como estaba.
   Subir una planilla recortada por error no puede vaciar la instalación.
2. **O entra todo o no entra nada.** Una sola fila con problema rechaza la
   importación entera: después de un import a medias nadie sabe qué quedó
   aplicado.

Por eso son dos pasos: `analizar*` muestra fila por fila qué va a pasar (crear /
actualizar / sin cambios / error) y `importar*` lo aplica en una transacción.

La lectura es **tolerante**: acentos, mayúsculas, columnas de más, filas en
blanco, separador `,` o `;` autodetectado, alias de encabezados
(`modelo`/`producto` → `nombre`, `tamaño`/`clase` → `tipo`). Los errores dicen
**qué fila y qué columna**, nunca “formato inválido”.

Las columnas no reconocidas **se ignoran en silencio**. El export incluye una
columna informativa (“Placas que entran”) que el import no lee: es un espejo
derivado del tipo, no un dato.

---

## 8. Estadísticas

Lo que se calcula (`lib/estadisticas.ts`), sobre rangos de 7/30/90/365 días:

- Tiempo de horno promedio/mín/máx, **abierto por tipo de placa**, más el
  detalle de los últimos ciclos.
- **Secaderos que no secaron**: compara la duración de los ciclos que
  necesitaron devolución contra los que no. Esa diferencia es el tiempo mínimo
  real de horno, **medido y no estimado**. Es el indicador más valioso del
  sistema.
- Tiempo promedio por etapa del circuito → dónde se hacen colas.
- Desperdicio por motivo, por etapa, por modelo y por operario.
- Producción diaria de placas terminadas.
- **Adherencia al flujo**: qué porcentaje de cargas fue “óptima” (secadero
  completo, un solo producto). Las cargas de tipos sin tope **no son evaluables**
  y se cuentan aparte en `sinNorma`, que se muestra explícitamente: meterlas al
  denominador hundiría el indicador con cargas correctas, y sacarlas en silencio
  haría leer el porcentaje como si cubriera toda la producción.

`plan.ts` compara la orden del día contra lo real. **El desvío no se carga: se
calcula.** Lo único que una persona agrega después es el *motivo* del desvío, y
vive en la línea del plan.

---

## 9. Trampas de infraestructura (las que costaron caro)

### 9.1 Pooler de Supabase: modo sesión, no transacción

`postgres-js` hace **pipelining**: manda varias consultas por la misma conexión
sin esperar la respuesta anterior. Supavisor en **modo transacción (puerto
6543)** no lo tolera: las consultas mueren por statement timeout o quedan
colgadas para siempre. Se reprodujo **con solo dos consultas concurrentes**. Como
las pantallas usan `Promise.all` en todos lados, no es evitable desde el código.

→ **Usar el Session pooler, puerto 5432.** En modo sesión, 10 consultas en
paralelo sobre una conexión resuelven en ~36 ms.

### 9.2 El límite de conexiones es el techo de instancias concurrentes

En modo sesión cada conexión ocupa un lugar del pool **mientras viva**, y en
serverless **cada instancia de Vercel abre la suya**. Con `max: 1` por instancia
y un pool de 15, el sistema tolera ~15 instancias concurrentes; la número 16
falla con:

```
EMAXCONNSESSION: max clients reached in session mode - max clients are limited to pool_size: 15
```

Del lado de la app eso es un **500 determinístico** en toda pantalla que consulte
la base, mientras `/login` (que no consulta) sigue devolviendo 200.

Configuración del cliente (`lib/db/index.ts`), y por qué:

- **Cache de módulo + `globalThis`**: sin esto, cada acceso a `db` levantaría un
  TCP+TLS nuevo (~250 ms) y lo dejaría abierto hasta agotar el pooler. El
  `globalThis` es para que el hot reload de desarrollo no acumule conexiones.
- **`max: 1`**: con pipelining andando, una conexión alcanza y sobra.
- **`idle_timeout: 20`**: devuelve el cupo rápido entre picos.
- **`connect_timeout: 15`**: que un pooler caído falle rápido en vez de colgar la
  pantalla.
- **Lazy**: la conexión se abre en el primer uso, no al importar el módulo, para
  que `next build` pueda recorrer las rutas sin base configurada.

**Recomendación para una app nueva:** poner el pool bastante por encima de 15
desde el principio (40 sobre una base que tolera ~60), y **no correr pruebas de
carga contra producción**.

### 9.3 Verificar un deploy sin romperlo

Un script que dispara 25 requests en paralelo contra un pool de 15 **está
garantizado a agotar el pool**, y si se corre sobre producción deja la planta sin
app. Dos lecciones:

- La ráfaga de prueba debe quedar **por debajo del pool size**.
- Repetir la verificación varias veces seguidas **empeora el resultado por sí
  sola** (instancias frías acumulando conexiones): una caída entre corridas **no
  prueba** que el último cambio la haya causado.
- Un chequeo que espera “el deploy nuevo” pidiendo una ruta hasta que dé 200 **no
  distingue el deploy viejo del nuevo**: el viejo también responde 200. Hay que
  comparar contra algo que identifique la versión.
- El contador de `pg_stat_activity` con `application_name = 'Supavisor'` mide
  backends del pooler, que **no bajan apenas se desconecta el cliente**: verlo
  clavado en el máximo es el techo del pool, no necesariamente una fuga.

### 9.4 Migraciones: `push` no rellena filas

`drizzle-kit push` sincroniza el **esquema**, no los **datos**. Agregar una
columna la deja en `null` para todas las filas existentes; cambiar una columna a
nullable **no vacía** los valores que ya estaban.

Pasó tres veces:
- `capacidad` pasó a nullable, pero Guarda y Especial siguieron con el `50` que
  había puesto el seed. Hubo que vaciarlas desde el panel.
- `cupo_horno` se creó en `null`, así que las guardas siguieron compitiendo por
  el cupo general hasta cargarles el 4 a mano.
- `llenado_manual` se creó en `false` para todos, así que las guardas siguieron
  apareciendo en carrusel y en paletizado hasta marcar el tipo desde el panel.
  Hasta ese momento la pantalla de llenado manual se ve vacía, que es
  exactamente lo que dice el cartel que muestra.

Además el **seed es idempotente y no pisa lo existente**: volver a correrlo no
arregla filas viejas.

→ Después de toda migración, preguntarse explícitamente: *¿qué filas ya
existentes quedan con el valor equivocado?*

Un caso donde la respuesta es "ninguna": las columnas de anulación
(`anulado_en` y compañía) nacen en `null` para todo el historial, y `null`
significa justamente "vigente", que es lo que todos esos movimientos son. Hay
que pensar la pregunta igual: que no haga falta rellenar nada es una propiedad
de cómo se eligió el valor por defecto, no una casualidad.

### 9.5 Orden de despliegue

Para cambios **aditivos** (columna nueva nullable, valor nuevo de enum, tabla
nueva) el orden seguro es:

1. **Migrar la base primero.** El código viejo no conoce lo nuevo, así que no se
   entera.
2. **Después desplegar el código.**

Al revés hay una ventana en la que el código nuevo consulta algo que no existe.
El daño escala con cuántas pantallas usan la consulta afectada: una tabla nueva
usada por una pantalla rompe una pantalla; una columna agregada a la consulta
central rompe casi toda la app.

**Reversibilidad, que hay que evaluar caso por caso:**
- Agregar una columna nullable → revertir el código es seguro (el código viejo la
  ignora).
- Cambiar la semántica de datos existentes (poner `null` donde había números) →
  revertir el código **sin** revertir los datos deja al código viejo frente a
  valores que asume que nunca son nulos. **No es seguro.**

---

## 10. Qué copiaría y qué haría distinto

**Copiaría sin dudar:**

- La regla de §3.2: un tipo de movimiento por cada cosa que se mida distinto.
- `null` con semántica explícita y documentada en el esquema, para “el sistema no
  opina”.
- Snapshots de nombres en el historial.
- `duracion_min` calculado al escribir.
- Import de dos pasos, que nunca borra y es todo-o-nada.
- Bloqueo `FOR UPDATE` + mensaje de conflicto en castellano operativo.
- Reintentos solo para fallos de red, nunca para rechazos de negocio.
- Comentarios largos en el código explicando **por qué**, no qué. Este proyecto
  los tiene y son la razón por la que se pudo diagnosticar rápido.

**Haría distinto:**

- **Pool size dimensionado desde el día uno** y un script de verificación que no
  pueda tumbar producción.
- **Un chequeo de versión desplegada** (leer un commit SHA de una env var y
  exponerlo) para saber si estás mirando el deploy nuevo o el viejo.
- **Migraciones versionadas** (`drizzle-kit generate` + archivos) en vez de solo
  `push`, con un paso explícito de *backfill* al lado de cada una.
- **Logs accesibles**: dejar el proyecto vinculado al CLI del hosting. Sin eso,
  un `Digest: 356848034` en pantalla no lleva a ninguna parte.
- Considerar un pooler en modo transacción con un driver que no haga pipelining,
  si se espera concurrencia alta. Para este volumen, modo sesión es correcto.

---

## 11. Comandos

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run db:push` | Sincroniza el esquema con la base |
| `npm run db:studio` | Explorador de datos |
| `npm run db:seed` | Datos iniciales (idempotente) |
| `npm run db:seed -- --sin-ejemplos` | Solo lo imprescindible |
| `npm run db:limpiar` | Muestra qué hay en cada tabla. No toca nada |
| `npm run db:limpiar -- --movimientos` | Borra historial, deja secaderos vacíos |
| `npm run db:limpiar -- --todo` | Además borra secaderos, productos y usuarios de prueba |
| `npm run db:limpiar -- --todo --conservar-usuarios` | Igual, sin tocar usuarios |
| `npm run verificar-deploy` | Recorre las pantallas del deploy |

Variables de entorno: `DATABASE_URL` (session pooler, 5432), `SESSION_SECRET`,
`DIRECT_URL` (opcional, para migraciones), `ADMIN_PIN` (solo lo usa el seed).

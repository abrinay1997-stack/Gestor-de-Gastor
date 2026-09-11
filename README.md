# Nuestros gastos

Gestor de gastos para dos personas. Libro compartido, en tiempo real, sobre
Cloudflare. Sin Google, sin Firebase, sin servicios de terceros.

- **Un solo libro compartido.** Los dos ven exactamente lo mismo.
- **En vivo.** Lo que carga uno aparece en el teléfono del otro sin refrescar.
- **Vista individual.** Cada movimiento sabe quién lo cargó, y se puede filtrar
  por persona sin partir los datos.
- **Funciona sin señal.** Lo que cargues offline se guarda y sube solo al
  volver la conexión.
- **Instalable.** PWA: se agrega a la pantalla de inicio y abre como app nativa.

## Cómo está armado

| Pieza | Tecnología | Por qué |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind 4 | El caparazón móvil del repo original, reconstruido |
| API + hosting | Cloudflare Workers | Un solo Worker sirve todo; no se paga si nadie lo usa |
| Base de datos | Cloudflare D1 (SQLite) | Relacional, con integridad referencial real |
| Tiempo real | Durable Object + WebSocket | Una única instancia por hogar, en todo el mundo |
| Sesiones | PBKDF2 + cookie firmada | Propio, sin proveedor de identidad externo |

```
shared/     Dominio puro, compartido por cliente y servidor
  types.ts    Fuente única de tipos
  money.ts    Aritmética en enteros + reparto por mayor resto
  domain.ts   Saldos, jarras, resúmenes
  parser.ts   Lectura de "super 12500" sin IA externa
worker/     API, auth y Durable Object
src/        Interfaz React
migrations/ Esquema de D1
```

## Desplegar desde GitHub Actions

El despliegue se lanza a mano desde GitHub y **no publica nada hasta que los
tests pasan**. Hacer merge de un pull request no publica: solo verifica.

```
push / pull request  ──>  Verificar  (tipos + tests + build)
                              │
boton "Run workflow"  ──>  Verificar  ──>  Publicar en Cloudflare
                                            (solo si lo anterior esta en verde)
```

Se configura una vez y despues no volves a tocar una terminal.

### 1. Crear la base de datos

Esto es lo unico que se hace desde tu computadora, una sola vez:

```bash
npm install
npx wrangler login          # abre el navegador para autorizar
npx wrangler d1 create gastos-db
```

Guarda el `database_id` que imprime. Lo vas a necesitar en el paso 3.

### 2. Sacar las credenciales de Cloudflare

**`CLOUDFLARE_ACCOUNT_ID`**

1. Entra a [dash.cloudflare.com](https://dash.cloudflare.com)
2. En el menu de la izquierda, **Compute (Workers)**
3. A la derecha aparece **Account ID**, con un boton para copiarlo

También está en la URL cuando navegás el panel:
`dash.cloudflare.com/`**`<esto es tu account id>`**`/workers`

**`CLOUDFLARE_API_TOKEN`**

1. [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. **Create Token**
3. Busca la plantilla **Edit Cloudflare Workers** y toca **Use template**
4. Agregale un permiso mas, porque la plantilla no siempre lo trae:
   **Account** → **D1** → **Edit**
5. En *Account Resources* elegi tu cuenta; en *Zone Resources*, todas las zonas
   (o ninguna, si no vas a usar dominio propio)
6. **Continue to summary** → **Create Token**
7. **Copialo ahora.** Cloudflare no te lo vuelve a mostrar

Los permisos que necesita, y para que:

| Permiso | Para que |
|---|---|
| Account → Workers Scripts → Edit | publicar el Worker y el Durable Object |
| Account → D1 → Edit | aplicar las migraciones de la base |
| Account → Account Settings → Read | que wrangler identifique la cuenta |
| Zone → Workers Routes → Edit | solo si usas dominio propio |

**`SETUP_KEY`**

Esta la inventas vos. Es la que te habilita a crear el hogar la primera vez.
Que sea larga y no la uses en ningun otro lado. Por ejemplo:

```bash
openssl rand -base64 24
```

### 3. Cargarlas en GitHub

En tu repositorio: **Settings** → **Secrets and variables** → **Actions**.

En la pestaña **Secrets** (valores ocultos), boton *New repository secret*:

| Nombre | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | el token del paso 2 |
| `CLOUDFLARE_ACCOUNT_ID` | el account id del paso 2 |
| `SETUP_KEY` | la clave que inventaste |

En la pestaña **Variables** (valores visibles), boton *New repository variable*:

| Nombre | Valor |
|---|---|
| `CLOUDFLARE_D1_DATABASE_ID` | el `database_id` del paso 1 |

> El id de la base va como *variable* y no como *secret* porque no es
> secreto: sin el token de API no sirve de nada. Si preferis, podes escribirlo
> directamente en `wrangler.toml` y saltear la variable; el workflow acepta
> las dos formas.

### 4. Publicar

1. Pestaña **Actions** del repositorio
2. **Publicar** en la lista de la izquierda
3. **Run workflow** → elegi la rama → **Run workflow**

Corre los tests, y solo si pasan: aplica las migraciones, publica el Worker y
comprueba que la app responda. Al terminar, el resumen de la corrida te muestra
la URL.

### 5. Crear el hogar

Entra a esa URL. Te pide la clave de instalacion (`SETUP_KEY`), tu nombre,
email y contraseña. Despues, en **Ajustes → Sumar a tu pareja**, le creas la
cuenta a ella.

### 6. Instalarla en el telefono

- iPhone: abrir en Safari → Compartir → *Agregar a inicio*
- Android: abrir en Chrome → menu → *Instalar aplicacion*

### Ajustes opcionales del despliegue

**Pedir tu aprobacion antes de publicar.** En **Settings** → **Environments**
→ **produccion** → *Required reviewers*, agregate a vos. A partir de ahi, el
workflow corre los tests y despues se queda esperando que toques *Approve*.

**Publicar solo al mergear a main.** En `.github/workflows/deploy.yml`,
descomenta:

```yaml
  # push:
  #   branches: [main]
```

Los tests van a seguir siendo obligatorios: la barrera es `needs: verificar`,
no el disparador.

**Dominio propio.** Si tenes un dominio en Cloudflare, agrega al final de
`wrangler.toml`:

```toml
[[routes]]
pattern = "gastos.tudominio.com"
custom_domain = true
```

## Desarrollo local

```bash
npm run db:init:local        # crea las tablas en la base local
echo 'SETUP_KEY = "lo-que-quieras"' > .dev.vars
npm run dev                  # http://localhost:8787
```

`npm run dev` levanta el Worker con D1 y Durable Objects simulados. Para
trabajar solo en la interfaz, `npm run dev:web` arranca Vite con recarga en
caliente y redirige `/api` al Worker.

```bash
npm test        # 51 tests del núcleo de dominio
npm run lint    # typecheck de cliente y Worker
```

### Publicar a mano

`npm run deploy` publica directo desde tu maquina, sin pasar por los tests. Es
una salida de emergencia, no la via normal: usa el workflow **Publicar**, que
verifica antes.

Si guardaste el id de la base como variable de GitHub en vez de escribirlo en
`wrangler.toml`, este comando va a fallar porque el archivo todavia tiene el
marcador. Escribi el id en `wrangler.toml` para poder publicar a mano.

## Decisiones que conviene conocer

**La plata se guarda en enteros.** Cada monto es un entero de centavos, nunca
un decimal. En JavaScript `0.1 + 0.2` no da `0.3`, y con plata ese error se
acumula en silencio hasta que los saldos dejan de cuadrar y no hay forma de
saber por qué.

**El reparto de las jarras cierra exacto.** Repartir un ingreso entre
porcentajes deja centavos sueltos: 2,5% de $1.000,00 no es un número redondo.
Se usa el método del mayor resto —el mismo con el que se reparten bancas en una
elección— así que la suma de las jarras siempre da exactamente el ingreso.

**Los saldos no se guardan, se calculan.** El saldo de una cuenta es su saldo
inicial más la suma de sus movimientos, resuelto por SQL en cada lectura. La
alternativa habitual —guardar el saldo e irlo incrementando— se desincroniza
ante cualquier fallo a mitad de camino, y después no se sabe cuál de los dos
números es el correcto.

**Las deudas restan.** Una tarjeta de crédito con consumo tiene saldo negativo
y baja el patrimonio. Suena obvio, pero es fácil que una app te cuente la deuda
como si fuera plata disponible.

**Los ajustes son un tipo de movimiento.** Cuando el saldo real no coincide con
el de la app, se registra un ajuste en lugar de corregir el saldo a mano. Así
el historial explica cada peso.

## Privacidad

Los datos viven en tu propia base de D1, en tu cuenta de Cloudflare. No hay
analítica, ni rastreadores, ni llamadas a servicios externos. La app no se
puede indexar y no tiene registro público: las únicas dos cuentas son las que
creás vos.

Desde **Ajustes → Exportar a CSV** te llevás todo cuando quieras.

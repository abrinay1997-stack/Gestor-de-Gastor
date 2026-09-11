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

## Desplegar

Necesitás una cuenta de Cloudflare (el plan gratuito alcanza de sobra) y Node.

```bash
npm install
npx wrangler login
```

**1. Crear la base**

```bash
npx wrangler d1 create gastos-db
```

Copiá el `database_id` que imprime y pegalo en `wrangler.toml`, reemplazando
`REEMPLAZAR_CON_TU_DATABASE_ID`.

**2. Crear las tablas**

```bash
npm run db:init
```

**3. Definir la clave de instalación**

Es la que te habilita a crear el hogar la primera vez. Elegí algo largo:

```bash
npx wrangler secret put SETUP_KEY
```

**4. Publicar**

```bash
npm run deploy
```

Wrangler imprime la URL (`https://gestor-de-gastos.TU-CUENTA.workers.dev`).

**5. Crear el hogar**

Entrá a esa URL. Te va a pedir la clave de instalación, tu nombre, email y
contraseña. Después, en **Ajustes → Sumar a tu pareja**, le creás la cuenta a
ella y le pasás email y contraseña.

**6. Instalarla en el teléfono**

- iPhone: abrir en Safari → Compartir → *Agregar a inicio*
- Android: abrir en Chrome → menú → *Instalar aplicación*

### Dominio propio (opcional)

Si tenés un dominio en Cloudflare, agregá al final de `wrangler.toml`:

```toml
[[routes]]
pattern = "gastos.tudominio.com"
custom_domain = true
```

Y volvé a correr `npm run deploy`.

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

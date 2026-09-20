/**
 * Que ningun movimiento nazca sin su codigo.
 *
 * El codigo de cinco caracteres es lo que permite decir «mira el movimiento
 * 7K2MQ» en vez de describirlo. Para que sirva tiene que estar en TODOS, y hay
 * cuatro lugares distintos que insertan movimientos: el alta normal, el lote
 * que sube lo cargado sin conexion, el barrido nocturno de pagos habituales y
 * el «ya lo cobre» de la pantalla de pagos.
 *
 * Olvidarse de uno no rompe nada visible: el movimiento se guarda bien y
 * funciona igual. Solo que el dia que haga falta señalarlo, no tiene nombre —y
 * como la columna admite NULL (ver la 0014: la tabla tx no se puede reconstruir
 * sin llevarse por delante las imputaciones), la base tampoco protesta.
 *
 * Ni el typecheck ni los tests lo agarran: es SQL dentro de un texto. Asi que
 * se revisa el texto, igual que prueba-filtros.mjs.
 *
 *   node scripts/prueba-codigos.mjs
 */

import { readFileSync } from 'node:fs';

/** Los archivos que insertan movimientos. Si aparece otro, se suma aca. */
const ARCHIVOS = [
  'worker/routes/transactions.ts',
  'worker/cron.ts',
  'worker/routes/recurring.ts',
];

const fallos = [];
let revisados = 0;

for (const ruta of ARCHIVOS) {
  let codigo;
  try {
    codigo = readFileSync(ruta, 'utf8');
  } catch {
    fallos.push(`${ruta}: no existe. Si lo renombraron, actualizá esta lista.`);
    continue;
  }

  // Cada `INSERT INTO tx (...)` con su lista de columnas. La lista puede
  // ocupar varios renglones, asi que se corta en el primer parentesis que
  // cierra.
  const inserciones = [...codigo.matchAll(/INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+tx\s*\(([^)]*)\)/gi)];

  if (inserciones.length === 0) {
    fallos.push(`${ruta}: ya no inserta movimientos. Si es a proposito, sacalo de la lista.`);
    continue;
  }

  for (const [, columnas] of inserciones) {
    revisados += 1;
    const lista = columnas.split(',').map((c) => c.trim());
    if (!lista.includes('code')) {
      fallos.push(
        `${ruta}: hay un INSERT INTO tx sin la columna \`code\`. `
        + `Ese movimiento nacería sin código. Columnas: ${lista.join(', ')}`,
      );
    }
  }
}

if (fallos.length > 0) {
  console.error('\nMovimientos que nacerían sin código:\n');
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`Los ${revisados} INSERT de movimientos escriben su código.`);

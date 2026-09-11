/**
 * Prueba el alta del hogar de punta a punta, con la clave de instalacion real.
 *
 * Es el unico camino que el diagnostico no puede cubrir: con clave incorrecta
 * el servidor corta antes de hacer nada, asi que no ejercita ni el hasheo ni
 * el lote de 22 sentencias que siembra categorias y jarras.
 *
 * CUIDADO: crea un hogar de verdad. Mientras existe, nadie mas puede crear el
 * suyo, porque el alta se niega si ya hay uno. Por eso lo borra al terminar,
 * pase lo que pase, y despues COMPRUEBA que quedo borrado.
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const URL_APP = process.env.URL_APP;
const SETUP_KEY = process.env.SETUP_KEY;
const BASE = 'gastos-db';

if (!URL_APP || !SETUP_KEY) {
  console.error('Faltan URL_APP o SETUP_KEY');
  process.exit(1);
}

const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** La misma derivacion que hace el navegador (shared/kdf.ts). */
async function derivar(password, email) {
  const sal = enc.encode('gg:v1:' + email.trim().toLowerCase());
  const k = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: 210_000 }, k, 256,
  ));
}

function sql(texto) {
  const archivo = `/tmp/alta-${randomUUID()}.sql`;
  writeFileSync(archivo, texto);
  try {
    return execFileSync('npx', ['wrangler', 'd1', 'execute', BASE, '--remote', `--file=${archivo}`, '-y', '--json'], {
      stdio: 'pipe', encoding: 'utf8',
    });
  } finally {
    try { unlinkSync(archivo); } catch {}
  }
}

const MAIL = `prueba-alta-${randomUUID().slice(0, 8)}@ejemplo.test`;
let fallo = null;

try {
  const hayHogar = sql('SELECT COUNT(*) AS n FROM household;');
  if (!/"n":\s*0/.test(hayHogar)) {
    console.log('Ya existe un hogar: se omite la prueba para no tocar datos reales.');
    console.log('Eso significa que el alta YA funciono.');
    process.exit(0);
  }

  console.log('1. Derivando la clave como lo haria el navegador...');
  const clave = await derivar('contrasena-de-prueba-2026', MAIL);
  console.log(`   clave de ${clave.length} caracteres`);

  console.log('\n2. POST /api/setup con la clave de instalacion correcta...');
  const t0 = Date.now();
  const res = await fetch(`${URL_APP}/api/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupKey: SETUP_KEY, email: MAIL, password: clave,
      displayName: 'Prueba', householdName: 'Hogar de prueba', currency: 'USD',
    }),
  });
  const ms = Date.now() - t0;
  const cuerpo = await res.text();

  console.log(`   HTTP ${res.status} en ${ms} ms`);
  console.log(`   ${cuerpo.slice(0, 140)}`);

  if (res.status !== 200) throw new Error(`El alta fallo con HTTP ${res.status}`);

  console.log('\n3. Comprobando que la semilla se creo...');
  const conteo = sql(`SELECT
      (SELECT COUNT(*) FROM household) AS hogares,
      (SELECT COUNT(*) FROM member) AS personas,
      (SELECT COUNT(*) FROM category) AS categorias,
      (SELECT COUNT(*) FROM jar) AS jarras,
      (SELECT COALESCE(SUM(percentage_bp),0) FROM jar) AS suma_bp;`);
  console.log('   ' + conteo.replace(/\s+/g, ' ').slice(0, 300));

  const num = (clave) => Number((conteo.match(new RegExp(`"${clave}":\\s*(-?\\d+)`)) ?? [])[1] ?? -1);
  if (num('hogares') !== 1) throw new Error('No se creo el hogar');
  if (num('personas') !== 1) throw new Error('No se creo la persona');
  if (num('categorias') !== 14) throw new Error(`Se esperaban 14 categorias, hay ${num('categorias')}`);
  if (num('jarras') !== 6) throw new Error(`Se esperaban 6 jarras, hay ${num('jarras')}`);
  if (num('suma_bp') !== 10000) throw new Error(`Las jarras suman ${num('suma_bp')} bp, deberian sumar 10000`);

  console.log('\n══════════════════════════════════════════');
  console.log(' EL ALTA DEL HOGAR FUNCIONA EN PRODUCCION');
  console.log('══════════════════════════════════════════');
} catch (e) {
  fallo = e;
  console.error(`\nFALLO: ${e.message}`);
} finally {
  console.log('\n4. Borrando el hogar de prueba...');
  try {
    sql(`DELETE FROM household WHERE id IN (SELECT household_id FROM member WHERE email = '${MAIL}');`);
    const queda = sql('SELECT COUNT(*) AS n FROM household;');
    const limpio = /"n":\s*0/.test(queda);
    console.log(`   ${limpio ? 'base limpia, podes crear tu hogar' : 'ATENCION: quedo un hogar sin borrar'}`);
    if (!limpio) fallo = fallo ?? new Error('La limpieza no dejo la base vacia');
  } catch (e) {
    console.error(`   no se pudo limpiar: ${e.message}`);
    fallo = fallo ?? e;
  }
}

process.exit(fallo ? 1 : 0);

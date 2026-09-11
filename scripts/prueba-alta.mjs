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
    return execFileSync('npx', ['wrangler', 'd1', 'execute', BASE, process.env.D1_ALCANCE ?? '--remote', `--file=${archivo}`, '-y', '--json'], {
      stdio: 'pipe', encoding: 'utf8',
    });
  } finally {
    try { unlinkSync(archivo); } catch {}
  }
}

/**
 * Ejecuta una consulta y devuelve la primera fila ya parseada.
 *
 * Parsea el JSON de verdad en vez de buscar un texto con una expresion
 * regular. La primera version de esto usaba regex y fallaba hacia el lado
 * peligroso: al no reconocer la salida daba por hecho que ya habia un hogar,
 * se salteaba la prueba y terminaba en verde sin haber probado nada. Una
 * prueba que no puede leer el estado tiene que gritar, no seguir de largo.
 */
function consultar(texto) {
  const crudo = sql(texto);
  const inicio = crudo.indexOf('[');
  if (inicio === -1) {
    throw new Error(`La salida de wrangler no trae JSON:\n${crudo.slice(0, 500)}`);
  }
  let datos;
  try {
    datos = JSON.parse(crudo.slice(inicio));
  } catch (e) {
    throw new Error(`No se pudo parsear la salida de wrangler (${e.message}):\n${crudo.slice(0, 500)}`);
  }
  const fila = datos?.[0]?.results?.[0];
  if (!fila) {
    throw new Error(`La consulta no devolvio filas:\n${JSON.stringify(datos).slice(0, 500)}`);
  }
  return fila;
}

const MAIL = `prueba-alta-${randomUUID().slice(0, 8)}@ejemplo.test`;
let fallo = null;

try {
  const antes = consultar('SELECT COUNT(*) AS n FROM household;');
  console.log(`0. Hogares existentes: ${antes.n}`);
  if (antes.n !== 0) {
    console.log('   Ya hay un hogar: se omite la prueba para no tocar datos reales.');
    console.log('   Eso significa que el alta YA funciono.');
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
  const c = consultar(`SELECT
      (SELECT COUNT(*) FROM household) AS hogares,
      (SELECT COUNT(*) FROM member) AS personas,
      (SELECT COUNT(*) FROM category) AS categorias,
      (SELECT COUNT(*) FROM jar) AS jarras,
      (SELECT COALESCE(SUM(percentage_bp),0) FROM jar) AS suma_bp;`);
  console.log(`   hogares=${c.hogares} personas=${c.personas} categorias=${c.categorias} jarras=${c.jarras} suma=${c.suma_bp}bp`);

  if (c.hogares !== 1) throw new Error(`Se esperaba 1 hogar, hay ${c.hogares}`);
  if (c.personas !== 1) throw new Error(`Se esperaba 1 persona, hay ${c.personas}`);
  if (c.categorias !== 14) throw new Error(`Se esperaban 14 categorias, hay ${c.categorias}`);
  if (c.jarras !== 6) throw new Error(`Se esperaban 6 jarras, hay ${c.jarras}`);
  if (c.suma_bp !== 10000) throw new Error(`Las jarras suman ${c.suma_bp} bp, deberian sumar 10000`);

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
    const queda = consultar('SELECT COUNT(*) AS n FROM household;');
    console.log(`   hogares que quedan: ${queda.n}`);
    if (queda.n === 0) {
      console.log('   base limpia: podes crear tu hogar');
    } else {
      console.log('   ATENCION: quedo un hogar sin borrar');
      fallo = fallo ?? new Error('La limpieza no dejo la base vacia');
    }
  } catch (e) {
    console.error(`   no se pudo limpiar: ${e.message}`);
    fallo = fallo ?? e;
  }
}

process.exit(fallo ? 1 : 0);

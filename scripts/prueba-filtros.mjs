/**
 * Que ninguna pantalla muestre el selector de economia sin usarlo.
 *
 * El bug que esto evita ya paso: Inicio dibujaba <SelectorEntidad /> pero
 * nunca leia `entidadActiva`, asi que tocar "PanaClaw" pintaba la pastilla y
 * dejaba todos los numeros igual. Un filtro que no filtra es peor que no
 * tenerlo: hace desconfiar de los numeros que si estan bien.
 *
 * Ni los tests de dominio ni el typecheck lo agarran —`filtrarPorEntidad` esta
 * probada y el codigo compila igual sin llamarla—, asi que se revisa el texto
 * de cada pantalla.
 *
 *   node scripts/prueba-filtros.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/pages';
const fallos = [];

for (const archivo of readdirSync(DIR).filter((f) => f.endsWith('.tsx'))) {
  const ruta = join(DIR, archivo);
  const codigo = readFileSync(ruta, 'utf8');

  if (!codigo.includes('<SelectorEntidad')) continue;

  // El cuerpo del componente exportado de la pantalla: desde su `export
  // function` hasta la siguiente funcion de nivel superior. Las auxiliares
  // (FilaMovimiento, las hojas) pueden leer la entidad para otra cosa —pintar
  // una etiqueta, por ejemplo— y eso no es que la pantalla filtre.
  const inicio = codigo.search(/^export function /m);
  if (inicio < 0) continue;
  const resto = codigo.slice(inicio + 1);
  const fin = resto.search(/^(export )?function /m);
  const principal = fin > 0 ? resto.slice(0, fin) : resto;

  const usa = principal.includes('filtrarPorEntidad')
    || /entidadActiva\s*(===|!==|\?\?|\)|,|\])/.test(principal);

  if (!usa) {
    fallos.push(`${ruta}: dibuja <SelectorEntidad /> pero no usa entidadActiva`);
  }
}

if (fallos.length) {
  console.error('\nFiltro de economia sin conectar:\n');
  for (const f of fallos) console.error('  ' + f);
  console.error('');
  process.exit(1);
}

console.log('Todas las pantallas con selector de economia lo usan.');

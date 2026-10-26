/**
 * Reservar codigos de movimiento que no esten usados.
 *
 * El alfabeto, generar y normalizar viven en shared/codigo.ts, que es dominio
 * puro. Aca queda lo unico que necesita la base: comprobar que el codigo este
 * libre antes de escribirlo.
 */

import { generarCodigo } from '../shared/codigo.ts';
import type { Env } from './env.ts';

/**
 * `cuantos` codigos que hoy no esta usando nadie.
 *
 * Con 24.300.000 combinaciones y unos cientos de movimientos, chocar es
 * rarisimo; aun asi se comprueba, porque el indice unico de la migracion 0014
 * haria fallar el alta entera, y perder un movimiento por un codigo repetido
 * vale infinitamente menos que una consulta.
 *
 * Los candidatos se miran todos juntos: un lote de 100 movimientos cargados
 * sin conexion no puede costar 100 viajes a la base.
 */
export async function nuevosCodigos(env: Env, cuantos: number): Promise<string[]> {
  if (cuantos <= 0) return [];

  const listos: string[] = [];

  for (let vuelta = 0; vuelta < 5 && listos.length < cuantos; vuelta++) {
    const faltan = cuantos - listos.length;
    const candidatos = new Set<string>();
    while (candidatos.size < faltan) candidatos.add(generarCodigo());

    const lista = [...candidatos];
    const marcas = lista.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await env.DB
      .prepare(`SELECT code FROM tx WHERE code IN (${marcas})`)
      .bind(...lista)
      .all<{ code: string }>();

    const tomados = new Set(results.map((r) => r.code));
    for (const c of lista) if (!tomados.has(c)) listos.push(c);
  }

  // Cinco vueltas sin encontrar un hueco no es mala suerte: es que algo anda
  // mal. Mejor que el alta falle diciendolo que guardar un movimiento mudo.
  if (listos.length < cuantos) {
    throw new Error('No se pudo generar un código único para el movimiento');
  }

  return listos;
}

/** El caso de siempre: un movimiento, un codigo. */
export async function nuevoCodigo(env: Env): Promise<string> {
  const [c] = await nuevosCodigos(env, 1);
  return c;
}

/** Cuantos movimientos sin codigo se rellenan por pasada. */
const LOTE_RELLENO = 200;

/**
 * Le pone codigo a los movimientos que nacieron sin.
 *
 * La migracion 0014 rellena una sola vez, el dia que se aplica. Pero la
 * columna admite NULL, y si por cualquier motivo vuelve a correr un Worker que
 * no escribe `code` —una publicacion vieja, un rollback— cada movimiento que
 * cargue nace mudo y nada lo arregla despues. En produccion paso: 113 de 187
 * movimientos sin codigo, todos creados entre dos publicaciones.
 *
 * Por eso el relleno no es solo una migracion: corre cada vez que se abre la
 * app y de noche. Cuando no hay nada que rellenar cuesta una consulta sobre el
 * indice de `code`, que indexa los NULL.
 *
 * Solo escribe `code`: no toca `updated_at`, porque ponerle nombre a un
 * movimiento no es editarlo. Y el `AND code IS NULL` hace que dos telefonos
 * rellenando a la vez no se pisen: el que llega segundo no cambia nada, asi un
 * codigo ya entregado jamas vuelve a cambiar.
 *
 * Devuelve cuantos tenia pendientes.
 */
export async function rellenarCodigos(env: Env): Promise<number> {
  const { results } = await env.DB
    .prepare('SELECT id FROM tx WHERE code IS NULL ORDER BY created_at, id LIMIT ?1')
    .bind(LOTE_RELLENO)
    .all<{ id: string }>();

  if (results.length === 0) return 0;

  const codigos = await nuevosCodigos(env, results.length);
  await env.DB.batch(
    results.map((r, i) => env.DB
      .prepare('UPDATE tx SET code = ?1 WHERE id = ?2 AND code IS NULL')
      .bind(codigos[i], r.id)),
  );

  return results.length;
}

/**
 * El barrido de la papelera: borra lo vencido, una vez por dia.
 *
 * Corre junto a los pagos habituales. Solo toca lo que lleva mas de
 * DIAS_HASTA_BORRAR en la papelera Y no tiene nada colgando: si una categoria
 * la usan catorce movimientos, se queda ahi para siempre. La invariante
 * «vaciar nunca deja un movimiento huerfano» vale igual cuando el que vacia es
 * el reloj y no una persona.
 *
 * Idempotente: al dia siguiente ya no encuentra esas filas.
 */

import type { Env } from './env.ts';
import { DIAS_HASTA_BORRAR } from './routes/papelera.ts';

/** Tabla -> las consultas que dicen «esto no se puede borrar». */
const ATADO: Record<string, string[]> = {
  category: [
    'SELECT 1 FROM tx WHERE category_id = ?1 LIMIT 1',
    'SELECT 1 FROM budget WHERE category_id = ?1 LIMIT 1',
    'SELECT 1 FROM recurring WHERE category_id = ?1 LIMIT 1',
    'SELECT 1 FROM category WHERE parent_id = ?1 LIMIT 1',
  ],
  account: [
    'SELECT 1 FROM tx WHERE account_id = ?1 OR dest_account_id = ?1 LIMIT 1',
    'SELECT 1 FROM recurring WHERE account_id = ?1 LIMIT 1',
    'SELECT 1 FROM account_adjustment WHERE account_id = ?1 LIMIT 1',
  ],
  entity: [
    'SELECT 1 FROM category WHERE entity_id = ?1 LIMIT 1',
    'SELECT 1 FROM jar WHERE entity_id = ?1 LIMIT 1',
    'SELECT 1 FROM tx WHERE entity_id = ?1 LIMIT 1',
  ],
};

export async function barrerPapelera(env: Env): Promise<{ borrados: number }> {
  const corte = Date.now() - DIAS_HASTA_BORRAR * 86_400_000;
  let borrados = 0;

  for (const [tabla, consultas] of Object.entries(ATADO)) {
    const { results } = await env.DB.prepare(
      `SELECT id FROM ${tabla} WHERE trashed_at IS NOT NULL AND trashed_at <= ?1`,
    ).bind(corte).all<{ id: string }>();

    for (const { id } of results) {
      let atado = false;
      for (const sql of consultas) {
        if (await env.DB.prepare(sql).bind(id).first()) { atado = true; break; }
      }
      if (atado) continue;

      await env.DB.prepare(`DELETE FROM ${tabla} WHERE id = ?1`).bind(id).run();
      borrados += 1;
    }
  }

  return { borrados };
}

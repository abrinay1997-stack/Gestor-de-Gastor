/**
 * Papelera y archivo.
 *
 * Hasta ahora sacar algo de circulacion era siempre «archivar», y archivar era
 * una bolsa invisible: una categoria creada por error probando y una categoria
 * jubilada con dos años de historia terminaban en el mismo lugar, sin forma de
 * verlas ni de distinguirlas. Asi quedaron 17 categorias de prueba en la base
 * que nadie sabia que estaban ahi.
 *
 * Ahora son dos destinos con sentidos distintos:
 *
 *   ARCHIVO   se jubila pero su historia importa. Sale del selector y sigue
 *             contando en los totales del pasado. No se borra nunca solo.
 *   PAPELERA  se tira. Se restaura de un toque, y vaciarla lo borra de verdad.
 *
 * Vaciar NO borra a ciegas: lo que tenga historia —un movimiento, un
 * presupuesto, un pago habitual, una categoria hija— se queda y se dice por
 * que. Borrar una categoria que usan catorce movimientos dejaria catorce
 * movimientos huerfanos, y el historial mentiria.
 */

import type { Sesion } from '../auth.ts';
import { aAccount, aCategory, aEntity } from '../db.ts';
import type { Env } from '../env.ts';
import { ahora, cuerpo, difundir, error, json, unoDe } from '../http.ts';

/** Las tres cosas que se pueden sacar de circulacion. */
const TIPOS = ['categoria', 'cuenta', 'economia'] as const;
type Tipo = (typeof TIPOS)[number];

const TABLA: Record<Tipo, string> = {
  categoria: 'category',
  cuenta: 'account',
  economia: 'entity',
};

/** Como se llama en singular, para los mensajes. */
const NOMBRE: Record<Tipo, string> = {
  categoria: 'La categoría',
  cuenta: 'La cuenta',
  economia: 'La economía',
};

/**
 * Que impide borrar cada cosa de verdad, y con que frase se explica.
 *
 * Es una lista de consultas de conteo, no un `try/catch` sobre el DELETE:
 * asi se puede decir exactamente cuantos movimientos la usan en vez de
 * «no se pudo borrar».
 */
const ATADURAS: Record<Tipo, { sql: string; describir: (n: number) => string }[]> = {
  categoria: [
    {
      sql: 'SELECT COUNT(*) AS n FROM tx WHERE category_id = ?1',
      describir: (n) => `${n} movimiento${n === 1 ? ' la usa' : 's la usan'}`,
    },
    {
      sql: 'SELECT COUNT(*) AS n FROM budget WHERE category_id = ?1',
      describir: (n) => `${n} presupuesto${n === 1 ? '' : 's'}`,
    },
    {
      sql: 'SELECT COUNT(*) AS n FROM recurring WHERE category_id = ?1',
      describir: (n) => `${n} pago${n === 1 ? ' habitual' : 's habituales'}`,
    },
    {
      sql: 'SELECT COUNT(*) AS n FROM category WHERE parent_id = ?1',
      describir: (n) => `${n} subcategoría${n === 1 ? '' : 's'}`,
    },
  ],
  cuenta: [
    {
      sql: 'SELECT COUNT(*) AS n FROM tx WHERE account_id = ?1 OR dest_account_id = ?1',
      describir: (n) => `${n} movimiento${n === 1 ? ' la usa' : 's la usan'}`,
    },
    {
      sql: 'SELECT COUNT(*) AS n FROM recurring WHERE account_id = ?1',
      describir: (n) => `${n} pago${n === 1 ? ' habitual' : 's habituales'}`,
    },
  ],
  economia: [
    {
      sql: 'SELECT COUNT(*) AS n FROM category WHERE entity_id = ?1',
      describir: (n) => `${n} categoría${n === 1 ? '' : 's'}`,
    },
    {
      sql: 'SELECT COUNT(*) AS n FROM jar WHERE entity_id = ?1',
      describir: (n) => `${n} jarra${n === 1 ? '' : 's'}`,
    },
    {
      sql: 'SELECT COUNT(*) AS n FROM tx WHERE entity_id = ?1',
      describir: (n) => `${n} movimiento${n === 1 ? '' : 's'}`,
    },
  ],
};

/** Que ata a esta fila, en palabras. Vacio = se puede borrar. */
async function ataduras(env: Env, tipo: Tipo, id: string): Promise<string[]> {
  const razones: string[] = [];
  for (const { sql, describir } of ATADURAS[tipo]) {
    const fila = await env.DB.prepare(sql).bind(id).first<{ n: number }>();
    const n = fila?.n ?? 0;
    if (n > 0) razones.push(describir(n));
  }
  return razones;
}

/** Vuelve a difundir la fila para que la otra pantalla se entere al instante. */
async function avisar(env: Env, sesion: Sesion, tipo: Tipo, id: string): Promise<void> {
  const fila = await env.DB.prepare(
    `SELECT * FROM ${TABLA[tipo]} WHERE id = ?1 AND household_id = ?2`,
  ).bind(id, sesion.householdId).first<Record<string, unknown>>();
  if (!fila) return;

  if (tipo === 'categoria') {
    await difundir(env, sesion.householdId, {
      kind: 'category:upsert', category: aCategory(fila), by: sesion.memberId,
    });
  } else if (tipo === 'cuenta') {
    await difundir(env, sesion.householdId, {
      kind: 'account:upsert', account: aAccount(fila), by: sesion.memberId,
    });
  } else {
    await difundir(env, sesion.householdId, {
      kind: 'entity:upsert', entity: aEntity(fila), by: sesion.memberId,
    });
  }
}

const leerTipo = (v: unknown): Tipo => unoDe(v, TIPOS, 'tipo');

/**
 * Sacar algo de circulacion: a la papelera o al archivo.
 *
 * POST /api/papelera  { tipo, id, destino: 'papelera' | 'archivo' }
 */
export async function descartar(req: Request, env: Env, sesion: Sesion): Promise<Response> {
  const body = await cuerpo(req);
  const tipo = leerTipo(body.tipo);
  const id = String(body.id ?? '');
  const destino = unoDe(body.destino, ['papelera', 'archivo'] as const, 'destino');
  if (!id) return error('Falta el id');

  const t = ahora();
  const sql = destino === 'papelera'
    ? `UPDATE ${TABLA[tipo]} SET trashed_at = ?1, trashed_by = ?2 WHERE id = ?3 AND household_id = ?4`
    : `UPDATE ${TABLA[tipo]} SET archived = 1, trashed_at = NULL, trashed_by = NULL
        WHERE id = ?3 AND household_id = ?4`;

  const { meta } = await env.DB.prepare(sql)
    .bind(t, sesion.memberId, id, sesion.householdId).run();
  if (!meta.changes) return error(`${NOMBRE[tipo]} no existe`, 404);

  await avisar(env, sesion, tipo, id);
  return json({ ok: true, destino });
}

/**
 * Traer algo de vuelta. Sale de la papelera Y del archivo a la vez: quien
 * restaura quiere volver a usarlo, no moverlo de bolsa.
 *
 * POST /api/papelera/restaurar  { tipo, id }
 */
export async function restaurar(req: Request, env: Env, sesion: Sesion): Promise<Response> {
  const body = await cuerpo(req);
  const tipo = leerTipo(body.tipo);
  const id = String(body.id ?? '');
  if (!id) return error('Falta el id');

  const { meta } = await env.DB.prepare(
    `UPDATE ${TABLA[tipo]} SET trashed_at = NULL, trashed_by = NULL, archived = 0
      WHERE id = ?1 AND household_id = ?2`,
  ).bind(id, sesion.householdId).run();
  if (!meta.changes) return error(`${NOMBRE[tipo]} no existe`, 404);

  await avisar(env, sesion, tipo, id);
  return json({ ok: true });
}

/**
 * Borrar de verdad lo que hay en la papelera.
 *
 * POST /api/papelera/vaciar  { tipo?, id? }
 *
 * Sin tipo ni id, vacia todo. Lo que tenga historia no se toca y vuelve en
 * `retenidos` con el motivo, para poder decirlo en pantalla en vez de fallar
 * en silencio o, peor, borrar y dejar movimientos huerfanos.
 */
export async function vaciar(req: Request, env: Env, sesion: Sesion): Promise<Response> {
  const body = await cuerpo(req);
  const soloTipo = body.tipo === undefined ? null : leerTipo(body.tipo);
  const soloId = body.id === undefined ? null : String(body.id);

  const borrados: { tipo: Tipo; id: string }[] = [];
  const retenidos: { tipo: Tipo; id: string; nombre: string; motivo: string }[] = [];

  for (const tipo of TIPOS) {
    if (soloTipo && tipo !== soloTipo) continue;

    const { results } = await env.DB.prepare(
      `SELECT id, name FROM ${TABLA[tipo]}
        WHERE household_id = ?1 AND trashed_at IS NOT NULL
          AND (?2 IS NULL OR id = ?2)`,
    ).bind(sesion.householdId, soloId).all<{ id: string; name: string }>();

    for (const fila of results) {
      const razones = await ataduras(env, tipo, fila.id);
      if (razones.length > 0) {
        retenidos.push({
          tipo, id: fila.id, nombre: fila.name, motivo: razones.join(', '),
        });
        continue;
      }
      await env.DB.prepare(`DELETE FROM ${TABLA[tipo]} WHERE id = ?1 AND household_id = ?2`)
        .bind(fila.id, sesion.householdId).run();
      borrados.push({ tipo, id: fila.id });
    }
  }

  for (const { tipo, id } of borrados) {
    const kind = tipo === 'categoria' ? 'category:delete'
      : tipo === 'cuenta' ? 'account:delete' : 'entity:delete';
    await difundir(env, sesion.householdId, { kind, id, by: sesion.memberId } as never);
  }

  return json({ ok: true, borrados: borrados.length, retenidos });
}

/**
 * Que ataduras tiene cada cosa de la papelera, sin borrar nada.
 *
 * Sirve para que la pantalla pueda decir «esta se puede borrar» o «esta la
 * usan 14 movimientos» ANTES de que toquen el botón, en vez de descubrirlo
 * despues de intentarlo.
 *
 * GET /api/papelera
 */
export async function revisar(_req: Request, env: Env, sesion: Sesion): Promise<Response> {
  const items: { tipo: Tipo; id: string; motivo: string | null }[] = [];

  for (const tipo of TIPOS) {
    const { results } = await env.DB.prepare(
      `SELECT id FROM ${TABLA[tipo]} WHERE household_id = ?1 AND trashed_at IS NOT NULL`,
    ).bind(sesion.householdId).all<{ id: string }>();

    for (const { id } of results) {
      const razones = await ataduras(env, tipo, id);
      items.push({ tipo, id, motivo: razones.length ? razones.join(', ') : null });
    }
  }

  return json({ items });
}

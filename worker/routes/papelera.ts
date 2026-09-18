/**
 * La papelera. Una sola, sin archivo al lado.
 *
 * Antes habia dos destinos, «archivo» y «papelera», y la diferencia no se
 * sostenia: para decidir hacia cual mandar algo habia que saber de antemano si
 * su historia iba a importar, que es justo lo que uno no sabe en el momento de
 * sacarlo de en medio. Terminaban siendo dos cajones para lo mismo.
 *
 * Ahora todo va a un solo lugar y el sistema decide lo que se puede decidir
 * solo:
 *
 *   - Se restaura de un toque, cuando sea.
 *   - A los 30 DIAS se borra de verdad lo que no tenga historia.
 *   - Lo que SI tiene historia —un movimiento, un presupuesto, un pago
 *     habitual, una categoria hija— no se borra nunca, ni a los 30 dias ni a
 *     mano. Se queda en la papelera, fuera de los selectores, y la pantalla
 *     dice por que. Borrar una categoria que usan catorce movimientos dejaria
 *     catorce movimientos huerfanos, y el historial mentiria.
 *
 * Eso ultimo es lo que hacia el archivo, pero sin pedirle a nadie que lo
 * eligiera de antemano.
 */

import type { Sesion } from '../auth.ts';
import { aAccount, aCategory, aEntity } from '../db.ts';
import type { Env } from '../env.ts';
import { ahora, cuerpo, difundir, error, json, unoDe } from '../http.ts';

/**
 * Cuanto vive algo en la papelera antes de borrarse solo.
 *
 * Es el plazo de casi cualquier papelera (fotos, correo, archivos) y por eso
 * no hay que explicarlo. Solo corre para lo que no tiene historia.
 */
export const DIAS_HASTA_BORRAR = 30;

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
 * A la papelera.
 *
 * `archived` se apaga en la misma sentencia: con un solo cajon no puede haber
 * una fila que este archivada Y tirada a la vez.
 *
 * POST /api/papelera  { tipo, id }
 */
export async function descartar(req: Request, env: Env, sesion: Sesion): Promise<Response> {
  const body = await cuerpo(req);
  const tipo = leerTipo(body.tipo);
  const id = String(body.id ?? '');
  if (!id) return error('Falta el id');

  const { meta } = await env.DB.prepare(
    `UPDATE ${TABLA[tipo]} SET trashed_at = ?1, trashed_by = ?2, archived = 0
      WHERE id = ?3 AND household_id = ?4`,
  ).bind(ahora(), sesion.memberId, id, sesion.householdId).run();
  if (!meta.changes) return error(`${NOMBRE[tipo]} no existe`, 404);

  await avisar(env, sesion, tipo, id);
  return json({ ok: true });
}

/**
 * Traer algo de vuelta.
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
 * POST /api/papelera/vaciar  { tipo?, id?, items?: [{ tipo, id }] }
 *
 * Sin nada, vacia todo. Con `items` borra solo esos, que es lo que manda la
 * pantalla cuando se marcan varios con las casillas. Lo que tenga historia no
 * se toca y vuelve en `retenidos` con el motivo, para poder decirlo en pantalla
 * en vez de fallar en silencio o, peor, borrar y dejar movimientos huerfanos.
 */
export async function vaciar(req: Request, env: Env, sesion: Sesion): Promise<Response> {
  const body = await cuerpo(req);
  const soloTipo = body.tipo === undefined ? null : leerTipo(body.tipo);
  const soloId = body.id === undefined ? null : String(body.id);

  // La seleccion, cuando viene. Se normaliza a un conjunto «tipo:id» para
  // poder preguntarle por cada fila sin recorrerla entera cada vez.
  const marcados = Array.isArray(body.items)
    ? new Set((body.items as unknown[]).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return `${leerTipo(o.tipo)}:${String(o.id ?? '')}`;
    }))
    : null;
  if (marcados && marcados.size === 0) return error('No marcaste nada');

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
      if (marcados && !marcados.has(`${tipo}:${fila.id}`)) continue;
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
  const items: {
    tipo: Tipo; id: string; motivo: string | null; diasQueQuedan: number | null;
  }[] = [];

  for (const tipo of TIPOS) {
    const { results } = await env.DB.prepare(
      `SELECT id, trashed_at FROM ${TABLA[tipo]}
        WHERE household_id = ?1 AND trashed_at IS NOT NULL`,
    ).bind(sesion.householdId).all<{ id: string; trashed_at: number }>();

    for (const { id, trashed_at } of results) {
      const razones = await ataduras(env, tipo, id);
      items.push({
        tipo,
        id,
        motivo: razones.length ? razones.join(', ') : null,
        // Lo que tiene historia no se borra nunca, asi que no tiene cuenta
        // regresiva: poner «faltan 12 dias» al lado de algo que no se va a ir
        // seria mentir en la pantalla.
        diasQueQuedan: razones.length > 0
          ? null
          : Math.max(0, Math.ceil((trashed_at + DIAS_HASTA_BORRAR * 86_400_000 - ahora()) / 86_400_000)),
      });
    }
  }

  return json({ items, diasHastaBorrar: DIAS_HASTA_BORRAR });
}

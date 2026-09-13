/**
 * Traspasos entre jarras.
 *
 * Mover plata de Ahorro a Diversion no toca ninguna cuenta: no es un
 * movimiento de dinero, es un cambio de plan. Es lo unico que permite arreglar
 * una jarra que quedo en negativo; sin esto el rojo se queda para siempre.
 */

import type { Sesion } from '../auth.ts';
import {
  aJarTransfer, listarCuentas, listarImputaciones, listarJarras, listarTraspasos,
} from '../db.ts';
import { sentenciasImputacion } from '../jarras.ts';
import { validarJarras } from '../../shared/domain.ts';
import { TxType } from '../../shared/types.ts';
import type { Env } from '../env.ts';
import {
  ahora, cuerpo, difundir, entero, error, json, nuevoId, texto, textoOpcional,
} from '../http.ts';

const MAX_MONTO = 999_999_999_999;

export const listar = async (_r: Request, env: Env, s: Sesion) =>
  json({ jarTransfers: await listarTraspasos(env, s.householdId) });

export async function crear(req: Request, env: Env, sesion: Sesion): Promise<Response> {
  const body = await cuerpo(req);

  const fromJarId = texto(body.fromJarId, 'fromJarId', { max: 64, min: 1 });
  const toJarId = texto(body.toJarId, 'toJarId', { max: 64, min: 1 });
  if (fromJarId === toJarId) return error('Elegí dos jarras distintas', 400);

  const amountMinor = entero(body.amountMinor, 'amountMinor', { min: 1, max: MAX_MONTO });
  const note = textoOpcional(body.note, 'note', 200);
  const date = entero(body.date ?? ahora(), 'date', { min: 0, max: 4_102_444_800_000 });

  // Las dos tienen que ser del hogar. Una sola consulta: si faltara alguna, no
  // hay forma de que el conteo de dos.
  const { results } = await env.DB.prepare(
    'SELECT id FROM jar WHERE household_id = ?1 AND id IN (?2, ?3)',
  ).bind(sesion.householdId, fromJarId, toJarId).all<{ id: string }>();
  if (results.length !== 2) return error('Alguna de las jarras no existe', 404);

  const id = nuevoId();
  const t = ahora();

  await env.DB.prepare(
    `INSERT INTO jar_transfer (id, household_id, from_jar_id, to_jar_id, amount_minor,
                               note, date, created_by, created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
  ).bind(id, sesion.householdId, fromJarId, toJarId, amountMinor, note, date, sesion.memberId, t).run();

  const fila = await env.DB.prepare('SELECT * FROM jar_transfer WHERE id = ?1')
    .bind(id).first<Record<string, unknown>>();
  if (!fila) return error('No se pudo guardar el traspaso', 500);
  const transfer = aJarTransfer(fila);

  await difundir(env, sesion.householdId, {
    kind: 'jarTransfer:upsert', transfer, by: sesion.memberId,
  });
  return json({ transfer, jars: await listarJarras(env, sesion.householdId) }, { status: 201 });
}

export async function borrar(
  _req: Request, env: Env, sesion: Sesion, id: string,
): Promise<Response> {
  const { meta } = await env.DB.prepare(
    'DELETE FROM jar_transfer WHERE id = ?1 AND household_id = ?2',
  ).bind(id, sesion.householdId).run();
  if (!meta.changes) return error('El traspaso no existe', 404);

  await difundir(env, sesion.householdId, { kind: 'jarTransfer:delete', id, by: sesion.memberId });
  return json({ ok: true, jars: await listarJarras(env, sesion.householdId) });
}

/**
 * Poner al dia los ingresos que nunca llegaron a las jarras.
 *
 * Hasta la migracion 0004, repartir era un interruptor apagado por defecto al
 * final del formulario. En los primeros 44 movimientos nadie lo encendio
 * nunca, asi que las jarras solo recibieron gastos y varias quedaron en
 * negativo: plata saliendo de sobres que jamas se llenaron.
 *
 * Esto reparte esos ingresos huerfanos con los porcentajes de HOY, que es lo
 * unico que se puede hacer: no hay forma de saber que porcentajes habrian
 * elegido en su momento, y de todos modos nunca los aplicaron.
 *
 * Salta los que ya apuntan a una jarra: esos ya tomaron una decision y
 * repartirlos ahora la borraria.
 */
export async function ponerAlDia(_r: Request, env: Env, sesion: Sesion): Promise<Response> {
  const jars = await listarJarras(env, sesion.householdId);
  if (jars.length === 0) return error('No hay jarras configuradas', 400);

  const { ok, sumaBp } = validarJarras(jars);
  if (!ok) {
    return error(
      `Antes de repartir, los porcentajes tienen que sumar 100%. Ahora suman ${(sumaBp / 100).toFixed(2)}%.`,
      400,
    );
  }

  // Ingresos sin jarra, sin reparto y sin ninguna imputacion escrita.
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.amount_minor
       FROM tx t
      WHERE t.household_id = ?1
        AND t.type = ?2
        AND t.jar_id IS NULL
        AND t.distribute_to_jars = 0
        AND NOT EXISTS (SELECT 1 FROM jar_imputacion i WHERE i.tx_id = t.id)`,
  ).bind(sesion.householdId, TxType.INGRESO).all<{ id: string; amount_minor: number }>();

  if (results.length === 0) {
    return json({ repartidos: 0, jars });
  }

  const t = ahora();
  const sentencias: D1PreparedStatement[] = [];

  for (const fila of results) {
    sentencias.push(
      env.DB.prepare('UPDATE tx SET distribute_to_jars = 1, updated_at = ?1 WHERE id = ?2')
        .bind(t, fila.id),
      ...sentenciasImputacion(env, sesion.householdId, fila.id, {
        type: TxType.INGRESO,
        amountMinor: Number(fila.amount_minor),
        distributeToJars: true,
        jarId: null,
      }, jars, t),
    );
  }

  await env.DB.batch(sentencias);

  // Se recarga entero: cambiaron varios movimientos de una vez y parchear uno
  // por uno seria una tormenta de eventos por algo que pasa una sola vez.
  const [accounts, jarsNuevas, imputaciones] = await Promise.all([
    listarCuentas(env, sesion.householdId),
    listarJarras(env, sesion.householdId),
    listarImputaciones(env, sesion.householdId),
  ]);
  await difundir(env, sesion.householdId, {
    kind: 'recargar', accounts, jars: jarsNuevas, imputaciones,
  });

  return json({ repartidos: results.length, jars: jarsNuevas });
}

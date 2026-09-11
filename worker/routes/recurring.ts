/**
 * Pagos habituales: alquiler, servicios, suscripciones.
 *
 * El movimiento lo crea el disparador programado (ver worker/cron.ts) cuando
 * llega la fecha. Aca solo se define la regla.
 */

import type { Sesion } from '../auth.ts';
import { listarRecurrentes, recurrentePorId } from '../db.ts';
import type { Env } from '../env.ts';
import {
  ahora, booleano, cuerpo, difundir, entero, error, idOpcional, json,
  nuevoId, texto, unoDe,
} from '../http.ts';
import { TxType } from '../../shared/types.ts';
import { primeraFecha, type Frecuencia } from '../../shared/recurrencia.ts';

const FRECUENCIAS = ['semanal', 'mensual', 'anual'] as const;
/** Solo ingreso o gasto: una transferencia automatica no tiene sentido aca. */
const TIPOS = [TxType.INGRESO, TxType.GASTO] as const;
const MAX_MONTO = 999_999_999_999;

export const listar = async (_r: Request, env: Env, s: Sesion) =>
  json({ recurring: await listarRecurrentes(env, s.householdId) });

interface Validado {
  name: string;
  type: TxType;
  amountMinor: number;
  accountId: string;
  categoryId: string | null;
  jarId: string | null;
  paidBy: string | null;
  frequency: Frecuencia;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  active: boolean;
}

async function validar(
  body: Record<string, unknown>, env: Env, householdId: string,
): Promise<Validado | Response> {
  const name = texto(body.name, 'name', { max: 60, min: 1 });
  const type = unoDe(body.type, TIPOS, 'type');
  const amountMinor = entero(body.amountMinor, 'amountMinor', { min: 1, max: MAX_MONTO });
  const accountId = texto(body.accountId, 'accountId', { max: 64, min: 1 });

  const cuenta = await env.DB.prepare('SELECT id FROM account WHERE id = ?1 AND household_id = ?2')
    .bind(accountId, householdId).first();
  if (!cuenta) return error('La cuenta no existe', 404);

  const categoryId = idOpcional(body.categoryId, 'categoryId');
  if (categoryId) {
    const cat = await env.DB.prepare('SELECT id FROM category WHERE id = ?1 AND household_id = ?2')
      .bind(categoryId, householdId).first();
    if (!cat) return error('La categoría no existe', 404);
  }

  const jarId = idOpcional(body.jarId, 'jarId');
  if (jarId) {
    const jar = await env.DB.prepare('SELECT id FROM jar WHERE id = ?1 AND household_id = ?2')
      .bind(jarId, householdId).first();
    if (!jar) return error('La jarra no existe', 404);
  }

  const paidBy = idOpcional(body.paidBy, 'paidBy');
  if (paidBy) {
    const m = await env.DB.prepare('SELECT id FROM member WHERE id = ?1 AND household_id = ?2')
      .bind(paidBy, householdId).first();
    if (!m) return error('Esa persona no pertenece al hogar', 400);
  }

  const frequency = unoDe(body.frequency, FRECUENCIAS, 'frequency');

  // Cada frecuencia necesita lo suyo. Se valida por separado para que el
  // mensaje diga exactamente que falta.
  let dayOfMonth: number | null = null;
  let dayOfWeek: number | null = null;
  let monthOfYear: number | null = null;

  if (frequency === 'mensual' || frequency === 'anual') {
    dayOfMonth = entero(body.dayOfMonth ?? 1, 'dayOfMonth', { min: 1, max: 31 });
  }
  if (frequency === 'semanal') {
    dayOfWeek = entero(body.dayOfWeek ?? 1, 'dayOfWeek', { min: 0, max: 6 });
  }
  if (frequency === 'anual') {
    monthOfYear = entero(body.monthOfYear ?? 1, 'monthOfYear', { min: 1, max: 12 });
  }

  return {
    name, type, amountMinor, accountId, categoryId, jarId, paidBy,
    frequency, dayOfMonth, dayOfWeek, monthOfYear,
    active: booleano(body.active ?? true),
  };
}

export async function crear(req: Request, env: Env, sesion: Sesion): Promise<Response> {
  const body = await cuerpo(req);
  const v = await validar(body, env, sesion.householdId);
  if (v instanceof Response) return v;

  const t = ahora();
  const id = idOpcional(body.id, 'id') ?? nuevoId();

  // Si viene una fecha de arranque se respeta; si no, la proxima que toque.
  const desde = body.startAt !== undefined && body.startAt !== null
    ? entero(body.startAt, 'startAt', { min: 0, max: 4_102_444_800_000 })
    : t;

  const nextRun = primeraFecha({
    frecuencia: v.frequency,
    diaDelMes: v.dayOfMonth ?? undefined,
    diaDeSemana: v.dayOfWeek ?? undefined,
    mesDelAnio: v.monthOfYear ?? undefined,
  }, desde);

  await env.DB.prepare(
    `INSERT INTO recurring (id, household_id, name, type, amount_minor, account_id,
                            category_id, jar_id, paid_by, frequency, day_of_month,
                            day_of_week, month_of_year, active, next_run, last_run,
                            created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,NULL,?16,?16)`,
  ).bind(
    id, sesion.householdId, v.name, v.type, v.amountMinor, v.accountId,
    v.categoryId, v.jarId, v.paidBy, v.frequency, v.dayOfMonth,
    v.dayOfWeek, v.monthOfYear, v.active ? 1 : 0, nextRun, t,
  ).run();

  const recurrente = await recurrentePorId(env, sesion.householdId, id);
  if (!recurrente) return error('No se pudo crear el pago habitual', 500);

  await difundir(env, sesion.householdId, {
    kind: 'recurring:upsert', recurring: recurrente, by: sesion.memberId,
  });
  return json({ recurring: recurrente }, { status: 201 });
}

export async function editar(
  req: Request, env: Env, sesion: Sesion, id: string,
): Promise<Response> {
  const existente = await recurrentePorId(env, sesion.householdId, id);
  if (!existente) return error('El pago habitual no existe', 404);

  const body = await cuerpo(req);
  const v = await validar({ ...existente, ...body }, env, sesion.householdId);
  if (v instanceof Response) return v;

  // Si cambio la regla de fechas, se recalcula la proxima; si no, se respeta
  // la que habia para no adelantar ni atrasar un pago ya programado.
  const cambioLaRegla =
    v.frequency !== existente.frequency ||
    v.dayOfMonth !== existente.dayOfMonth ||
    v.dayOfWeek !== existente.dayOfWeek ||
    v.monthOfYear !== existente.monthOfYear;

  const nextRun = cambioLaRegla
    ? primeraFecha({
      frecuencia: v.frequency,
      diaDelMes: v.dayOfMonth ?? undefined,
      diaDeSemana: v.dayOfWeek ?? undefined,
      mesDelAnio: v.monthOfYear ?? undefined,
    })
    : existente.nextRun;

  await env.DB.prepare(
    `UPDATE recurring SET name=?1, type=?2, amount_minor=?3, account_id=?4,
                          category_id=?5, jar_id=?6, paid_by=?7, frequency=?8,
                          day_of_month=?9, day_of_week=?10, month_of_year=?11,
                          active=?12, next_run=?13, updated_at=?14
     WHERE id=?15 AND household_id=?16`,
  ).bind(
    v.name, v.type, v.amountMinor, v.accountId, v.categoryId, v.jarId, v.paidBy,
    v.frequency, v.dayOfMonth, v.dayOfWeek, v.monthOfYear, v.active ? 1 : 0,
    nextRun, ahora(), id, sesion.householdId,
  ).run();

  const recurrente = await recurrentePorId(env, sesion.householdId, id);
  if (!recurrente) return error('No se pudo actualizar', 500);

  await difundir(env, sesion.householdId, {
    kind: 'recurring:upsert', recurring: recurrente, by: sesion.memberId,
  });
  return json({ recurring: recurrente });
}

export async function borrar(
  _req: Request, env: Env, sesion: Sesion, id: string,
): Promise<Response> {
  const { meta } = await env.DB.prepare('DELETE FROM recurring WHERE id = ?1 AND household_id = ?2')
    .bind(id, sesion.householdId).run();
  if (!meta.changes) return error('El pago habitual no existe', 404);

  // Los movimientos que ya creo se quedan: son gastos reales que ocurrieron.
  // Solo pierden el vinculo (ON DELETE SET NULL).
  await difundir(env, sesion.householdId, { kind: 'recurring:delete', id, by: sesion.memberId });
  return json({ ok: true });
}

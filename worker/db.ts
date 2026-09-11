/**
 * Acceso a D1: mapeo de filas a tipos del dominio y consultas.
 *
 * Decision importante: los saldos NO se guardan. Se derivan.
 *
 * La version anterior guardaba `balance` en cada cuenta y lo iba moviendo con
 * `increment()` en cada alta, baja y edicion. Ese patron se desincroniza sin
 * remedio: basta un fallo a mitad de camino, una edicion que revierte mal o
 * dos escrituras cruzadas para que el saldo deje de corresponder a los
 * movimientos, y despues no hay forma de saber cual de los dos numeros es el
 * correcto.
 *
 * Aca el saldo es siempre `saldo inicial + suma de los movimientos`, calculado
 * por SQL en cada lectura. Es imposible que discrepe, y con el indice sobre
 * account_id el costo es despreciable para el volumen de una pareja.
 */

import type {
  Account, Budget, Category, Household, Jar, Member, Snapshot, Transaction,
} from '../shared/types.ts';
import type { AccountCategory, TxType } from '../shared/types.ts';
import { calcularJarras } from '../shared/domain.ts';
import type { Env } from './env.ts';

// --- mapeo de filas ------------------------------------------------------

type Fila = Record<string, unknown>;

const int = (v: unknown): number => Number(v ?? 0);
const str = (v: unknown): string => String(v ?? '');
const strOpt = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const bool = (v: unknown): boolean => Number(v ?? 0) === 1;

export const aAccount = (f: Fila): Account => ({
  id: str(f.id),
  householdId: str(f.household_id),
  name: str(f.name),
  category: int(f.category) as AccountCategory,
  currency: str(f.currency),
  initialBalanceMinor: int(f.initial_balance_minor),
  balanceMinor: int(f.balance_minor),
  color: str(f.color),
  icon: str(f.icon),
  owner: str(f.owner),
  archived: bool(f.archived),
  displayOrder: int(f.display_order),
  createdAt: int(f.created_at),
  updatedAt: int(f.updated_at),
});

export const aCategory = (f: Fila): Category => ({
  id: str(f.id),
  householdId: str(f.household_id),
  name: str(f.name),
  type: str(f.type) === 'ingreso' ? 'ingreso' : 'gasto',
  parentId: strOpt(f.parent_id),
  icon: str(f.icon),
  color: str(f.color),
  archived: bool(f.archived),
  displayOrder: int(f.display_order),
  createdAt: int(f.created_at),
});

export const aJar = (f: Fila): Jar => ({
  id: str(f.id),
  householdId: str(f.household_id),
  name: str(f.name),
  percentageBp: int(f.percentage_bp),
  color: str(f.color),
  icon: str(f.icon),
  displayOrder: int(f.display_order),
  createdAt: int(f.created_at),
  balanceMinor: 0, // se completa despues con calcularJarras
});

export const aTransaction = (f: Fila): Transaction => ({
  id: str(f.id),
  householdId: str(f.household_id),
  type: int(f.type) as TxType,
  amountMinor: int(f.amount_minor),
  accountId: str(f.account_id),
  destAccountId: strOpt(f.dest_account_id),
  destAmountMinor: f.dest_amount_minor === null || f.dest_amount_minor === undefined
    ? null
    : int(f.dest_amount_minor),
  categoryId: strOpt(f.category_id),
  jarId: strOpt(f.jar_id),
  distributeToJars: bool(f.distribute_to_jars),
  description: str(f.description),
  notes: strOpt(f.notes),
  date: int(f.date),
  createdBy: str(f.created_by),
  createdAt: int(f.created_at),
  updatedAt: int(f.updated_at),
});

export const aBudget = (f: Fila): Budget => ({
  id: str(f.id),
  householdId: str(f.household_id),
  categoryId: strOpt(f.category_id),
  amountMinor: int(f.amount_minor),
  period: str(f.period),
  createdAt: int(f.created_at),
  updatedAt: int(f.updated_at),
});

export const aMember = (f: Fila): Member => ({
  id: str(f.id),
  householdId: str(f.household_id),
  email: str(f.email),
  displayName: str(f.display_name),
  color: str(f.color),
  createdAt: int(f.created_at),
});

export const aHousehold = (f: Fila): Household => ({
  id: str(f.id),
  name: str(f.name),
  currency: str(f.currency),
  createdAt: int(f.created_at),
});

// --- consultas -----------------------------------------------------------

/**
 * Cuentas con el saldo ya calculado.
 *
 * Los numeros de tipo (1 ajuste, 2 ingreso, 3 gasto, 4 transferencia) son los
 * de TxType en shared/types.ts, y el signo de cada caso replica exactamente el
 * de `efectoEnCuenta`. Los dos lugares tienen que decir lo mismo; el test
 * 'calcularSaldos' cubre la version de TypeScript.
 */
const SQL_CUENTAS = `
  SELECT a.*,
    a.initial_balance_minor
    + COALESCE((
        SELECT SUM(CASE
          WHEN t.type = 2 THEN  t.amount_minor
          WHEN t.type = 3 THEN -t.amount_minor
          WHEN t.type = 1 THEN  t.amount_minor
          WHEN t.type = 4 THEN -t.amount_minor
          ELSE 0 END)
        FROM tx t WHERE t.account_id = a.id
      ), 0)
    + COALESCE((
        SELECT SUM(COALESCE(t.dest_amount_minor, t.amount_minor))
        FROM tx t WHERE t.dest_account_id = a.id AND t.type = 4
      ), 0)
    AS balance_minor
  FROM account a
  WHERE a.household_id = ?1
  ORDER BY a.archived ASC, a.display_order ASC, a.created_at ASC`;

export async function listarCuentas(env: Env, householdId: string): Promise<Account[]> {
  const { results } = await env.DB.prepare(SQL_CUENTAS).bind(householdId).all<Fila>();
  return results.map(aAccount);
}

export async function cuentaPorId(
  env: Env, householdId: string, id: string,
): Promise<Account | null> {
  const fila = await env.DB.prepare(
    `${SQL_CUENTAS.replace('WHERE a.household_id = ?1', 'WHERE a.household_id = ?1 AND a.id = ?2')}`,
  ).bind(householdId, id).first<Fila>();
  return fila ? aAccount(fila) : null;
}

export async function listarCategorias(env: Env, householdId: string): Promise<Category[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM category WHERE household_id = ?1
      ORDER BY archived ASC, type ASC, display_order ASC, created_at ASC`,
  ).bind(householdId).all<Fila>();
  return results.map(aCategory);
}

export async function listarPresupuestos(env: Env, householdId: string): Promise<Budget[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM budget WHERE household_id = ?1 ORDER BY period DESC',
  ).bind(householdId).all<Fila>();
  return results.map(aBudget);
}

export async function listarMiembros(env: Env, householdId: string): Promise<Member[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM member WHERE household_id = ?1 ORDER BY created_at ASC',
  ).bind(householdId).all<Fila>();
  return results.map(aMember);
}

/**
 * Movimientos, mas nuevos primero.
 *
 * El limite por defecto es alto a proposito: con el volumen de una pareja
 * (unos cientos por año) entra todo el historial en memoria del cliente, que
 * asi puede filtrar, agrupar y graficar sin volver a pedir nada. Si algun dia
 * crece, el parametro ya esta.
 */
export async function listarMovimientos(
  env: Env, householdId: string, limite = 2000, desde?: number,
): Promise<Transaction[]> {
  const sql = desde
    ? 'SELECT * FROM tx WHERE household_id = ?1 AND date >= ?3 ORDER BY date DESC, created_at DESC LIMIT ?2'
    : 'SELECT * FROM tx WHERE household_id = ?1 ORDER BY date DESC, created_at DESC LIMIT ?2';

  const stmt = desde
    ? env.DB.prepare(sql).bind(householdId, limite, desde)
    : env.DB.prepare(sql).bind(householdId, limite);

  const { results } = await stmt.all<Fila>();
  return results.map(aTransaction);
}

export async function movimientoPorId(
  env: Env, householdId: string, id: string,
): Promise<Transaction | null> {
  const fila = await env.DB.prepare(
    'SELECT * FROM tx WHERE household_id = ?1 AND id = ?2',
  ).bind(householdId, id).first<Fila>();
  return fila ? aTransaction(fila) : null;
}

/**
 * Jarras con su saldo.
 *
 * A diferencia de las cuentas, esto no se puede hacer en SQL puro: el reparto
 * por mayor resto necesita ver todas las jarras juntas para decidir a quien le
 * tocan los centavos sobrantes. Se usa la MISMA funcion que el cliente
 * (shared/domain.ts), asi que los dos llegan siempre al mismo numero.
 */
export async function listarJarras(
  env: Env, householdId: string, movimientos?: Transaction[],
): Promise<Jar[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM jar WHERE household_id = ?1 ORDER BY display_order ASC, created_at ASC',
  ).bind(householdId).all<Fila>();

  const jarras = results.map(aJar);
  if (jarras.length === 0) return jarras;

  const movs = movimientos ?? (await listarMovimientos(env, householdId));
  const saldos = calcularJarras(jarras, movs);

  return jarras.map((j) => ({ ...j, balanceMinor: saldos.get(j.id) ?? 0 }));
}

/** Todo lo que el cliente necesita para arrancar, en un solo viaje. */
export async function snapshot(
  env: Env, householdId: string, memberId: string,
): Promise<Snapshot | null> {
  const filaHogar = await env.DB.prepare('SELECT * FROM household WHERE id = ?1')
    .bind(householdId).first<Fila>();
  if (!filaHogar) return null;

  const [accounts, categories, budgets, members, transactions] = await Promise.all([
    listarCuentas(env, householdId),
    listarCategorias(env, householdId),
    listarPresupuestos(env, householdId),
    listarMiembros(env, householdId),
    listarMovimientos(env, householdId),
  ]);

  // Se reusan los movimientos ya traidos en vez de volver a consultarlos.
  const jars = await listarJarras(env, householdId, transactions);

  const me = members.find((m) => m.id === memberId);
  if (!me) return null;

  return {
    household: aHousehold(filaHogar),
    members, me, accounts, categories, jars, budgets, transactions,
  };
}

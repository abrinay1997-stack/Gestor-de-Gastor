/**
 * Escritura de las imputaciones de jarra.
 *
 * Una imputacion es lo que un movimiento le hizo a una jarra, calculado UNA
 * vez y guardado. Antes esto se recalculaba en cada lectura con los
 * porcentajes vigentes, asi que cambiar un porcentaje reescribia el pasado.
 *
 * Todo lo de aca devuelve sentencias en vez de ejecutarlas, para que el
 * movimiento y sus imputaciones entren en el mismo `batch`: o quedan los dos
 * o no queda ninguno. Un movimiento sin sus imputaciones seria plata que las
 * jarras no ven.
 */

import { aJarImputacion, listarJarras } from './db.ts';
import type { Env } from './env.ts';
import { imputacionJarras } from '../shared/domain.ts';
import type { JarImputacion, Jar, Transaction } from '../shared/types.ts';

/** Lo que define el reparto. Si nada de esto cambia, no se vuelve a congelar. */
type Reparto = Pick<Transaction, 'type' | 'amountMinor' | 'distributeToJars' | 'jarId'>;

export const mismoReparto = (a: Reparto, b: Reparto): boolean =>
  a.type === b.type
  && a.amountMinor === b.amountMinor
  && a.distributeToJars === b.distributeToJars
  && a.jarId === b.jarId;

/**
 * Sentencias para dejar las imputaciones de un movimiento tal como su reparto
 * indica: borra las que tenia y escribe las nuevas.
 *
 * El id es deterministico (`txId:jarId`) para que reintentar no duplique, que
 * es la misma idea que ya usa el alta de movimientos con el id propuesto por
 * el cliente.
 */
export function sentenciasImputacion(
  env: Env,
  householdId: string,
  txId: string,
  reparto: Reparto,
  jars: Jar[],
  t: number,
): D1PreparedStatement[] {
  const fuera = env.DB.prepare('DELETE FROM jar_imputacion WHERE tx_id = ?1').bind(txId);

  const partes = imputacionJarras(reparto, jars);
  const altas = [...partes]
    // Una parte de cero no aporta nada y ensuciaria el historial de la jarra.
    .filter(([, monto]) => monto !== 0)
    .map(([jarId, monto]) =>
      env.DB.prepare(
        `INSERT INTO jar_imputacion (id, household_id, tx_id, jar_id, amount_minor, created_at)
         VALUES (?1,?2,?3,?4,?5,?6)`,
      ).bind(`${txId}:${jarId}`, householdId, txId, jarId, monto, t));

  return [fuera, ...altas];
}

/** Las imputaciones de un movimiento, para devolverlas con la respuesta. */
export async function imputacionesDe(
  env: Env, txId: string,
): Promise<JarImputacion[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM jar_imputacion WHERE tx_id = ?1',
  ).bind(txId).all<Record<string, unknown>>();
  return results.map(aJarImputacion);
}

/**
 * Las jarras del hogar sin calcular saldos.
 *
 * Para congelar un reparto solo hacen falta los porcentajes y el orden; pedir
 * los saldos obligaria a leer todas las imputaciones en cada alta.
 */
export async function jarrasParaRepartir(env: Env, householdId: string): Promise<Jar[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM jar WHERE household_id = ?1 ORDER BY display_order ASC, created_at ASC',
  ).bind(householdId).all<Record<string, unknown>>();
  // listarJarras haria el trabajo de calcular saldos que aca no se usa.
  return results.map((f) => ({
    id: String(f.id),
    householdId: String(f.household_id),
    name: String(f.name),
    percentageBp: Number(f.percentage_bp ?? 0),
    color: String(f.color),
    icon: String(f.icon),
    displayOrder: Number(f.display_order ?? 0),
    createdAt: Number(f.created_at ?? 0),
    acumula: Number(f.acumula ?? 0) === 1,
    balanceMinor: 0,
  }));
}

export { listarJarras };

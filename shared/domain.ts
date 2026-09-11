/**
 * Motor de calculo. Funciones puras, sin red ni estado: el cliente y el Worker
 * usan exactamente las mismas, asi que lo que ves en pantalla al instante
 * (actualizacion optimista) y lo que confirma el servidor no pueden diferir.
 */

import {
  type Account, type Budget, type Category, type Jar, type Member,
  type Transaction, TxType,
} from './types.ts';
import { repartir, sumarMinor } from './money.ts';

// ---------------------------------------------------------------------------
// Saldos de cuenta
// ---------------------------------------------------------------------------

/**
 * Cuanto mueve una transaccion el saldo de una cuenta dada.
 * Devuelve 0 si la transaccion no toca esa cuenta.
 *
 * El signo se decide aca y en un solo lugar. La version anterior repetia esta
 * logica cuatro veces (alta, baja, edicion y reversa) y bastaba con que una
 * copia se desincronizara para corromper saldos.
 */
export function efectoEnCuenta(tx: Transaction, accountId: string): number {
  switch (tx.type) {
    case TxType.INGRESO:
      return tx.accountId === accountId ? tx.amountMinor : 0;

    case TxType.GASTO:
      return tx.accountId === accountId ? -tx.amountMinor : 0;

    case TxType.AJUSTE:
      // Un ajuste puede ser en cualquier direccion, por eso guarda su signo.
      return tx.accountId === accountId ? tx.amountMinor : 0;

    case TxType.TRANSFERENCIA: {
      let efecto = 0;
      if (tx.accountId === accountId) efecto -= tx.amountMinor;
      if (tx.destAccountId === accountId) {
        efecto += tx.destAmountMinor ?? tx.amountMinor;
      }
      return efecto;
    }

    default:
      return 0;
  }
}

/** Saldo real de cada cuenta: saldo inicial + todos sus movimientos. */
export function calcularSaldos(
  accounts: Account[],
  transactions: Transaction[],
): Map<string, number> {
  const saldos = new Map<string, number>();
  for (const a of accounts) saldos.set(a.id, a.initialBalanceMinor);

  for (const tx of transactions) {
    for (const id of [tx.accountId, tx.destAccountId]) {
      if (!id || !saldos.has(id)) continue;
      const efecto = efectoEnCuenta(tx, id);
      if (efecto !== 0) saldos.set(id, saldos.get(id)! + efecto);
    }
  }
  return saldos;
}

/**
 * Patrimonio neto: la suma de todos los saldos.
 *
 * El signo ya vive en el saldo, no se aplica aca. Un gasto siempre resta del
 * saldo de su cuenta, tambien en una tarjeta de credito: consumir 450 deja la
 * tarjeta en -450, que es exactamente lo que hay que sumar al patrimonio.
 *
 * Esto estaba mal y el error valia plata: se restaba `-balanceMinor` para los
 * pasivos, o sea que a un saldo ya negativo se le daba vuelta el signo otra
 * vez y la deuda terminaba SUMANDO al patrimonio. Con la tarjeta a -450 el
 * patrimonio salia 450 mas alto de lo real.
 *
 * `esActivo` sigue existiendo, pero para agrupar en pantalla ("lo que tenes" /
 * "lo que debes"), no para hacer cuentas.
 */
export function calcularPatrimonio(accounts: Account[]): number {
  return accounts.reduce(
    (total, a) => (a.archived ? total : total + a.balanceMinor),
    0,
  );
}

// ---------------------------------------------------------------------------
// Jarras
// ---------------------------------------------------------------------------

/**
 * Como se imputa una transaccion a las jarras.
 * Devuelve un mapa jarraId -> centavos (positivos o negativos).
 *
 * Usa `repartir`, que garantiza que la suma de las partes sea exactamente el
 * total. Ver la explicacion del metodo del mayor resto en money.ts.
 */
export function imputacionJarras(tx: Transaction, jars: Jar[]): Map<string, number> {
  const out = new Map<string, number>();

  if (tx.type === TxType.INGRESO && tx.distributeToJars) {
    const ordenadas = [...jars].sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
    const partes = repartir(tx.amountMinor, ordenadas.map((j) => j.percentageBp));
    ordenadas.forEach((j, i) => {
      if (partes[i] !== 0) out.set(j.id, partes[i]);
    });
    return out;
  }

  if (!tx.jarId) return out;

  if (tx.type === TxType.GASTO) out.set(tx.jarId, -tx.amountMinor);
  else if (tx.type === TxType.INGRESO) out.set(tx.jarId, tx.amountMinor);

  return out;
}

/** Saldo acumulado de cada jarra. */
export function calcularJarras(jars: Jar[], transactions: Transaction[]): Map<string, number> {
  const saldos = new Map<string, number>(jars.map((j) => [j.id, 0]));

  for (const tx of transactions) {
    for (const [jarId, delta] of imputacionJarras(tx, jars)) {
      if (saldos.has(jarId)) saldos.set(jarId, saldos.get(jarId)! + delta);
    }
  }
  return saldos;
}

/** Los porcentajes de las jarras deben sumar 100%. */
export function validarJarras(jars: Jar[]): { ok: boolean; sumaBp: number } {
  const sumaBp = jars.reduce((a, j) => a + j.percentageBp, 0);
  return { ok: sumaBp === 10_000, sumaBp };
}

// ---------------------------------------------------------------------------
// Periodos y resumenes
// ---------------------------------------------------------------------------

/** Clave de mes YYYY-MM a partir de un epoch, en la zona horaria local. */
export function claveMes(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Limites [inicio, fin] de un mes YYYY-MM, en epoch local. */
export function rangoMes(period: string): [number, number] {
  const [y, m] = period.split('-').map(Number);
  return [
    new Date(y, m - 1, 1, 0, 0, 0, 0).getTime(),
    new Date(y, m, 0, 23, 59, 59, 999).getTime(),
  ];
}

export function transaccionesDelMes(transactions: Transaction[], period: string): Transaction[] {
  const [ini, fin] = rangoMes(period);
  return transactions.filter((t) => t.date >= ini && t.date <= fin);
}

export interface Resumen {
  ingresoMinor: number;
  gastoMinor: number;
  flujoMinor: number;
  cantidad: number;
}

/**
 * Resumen de un conjunto de movimientos.
 * Las transferencias se excluyen a proposito: mover plata de una cuenta propia
 * a otra cuenta propia no es ni ingreso ni gasto, y contarlo infla los dos
 * lados del resumen. Los ajustes tampoco cuentan como gasto real.
 */
export function resumir(transactions: Transaction[]): Resumen {
  let ingresoMinor = 0;
  let gastoMinor = 0;

  for (const t of transactions) {
    if (t.type === TxType.INGRESO) ingresoMinor += t.amountMinor;
    else if (t.type === TxType.GASTO) gastoMinor += t.amountMinor;
  }

  return {
    ingresoMinor,
    gastoMinor,
    flujoMinor: ingresoMinor - gastoMinor,
    cantidad: transactions.length,
  };
}

/** Totales por categoria, de mayor a menor. */
export function porCategoria(
  transactions: Transaction[],
  categories: Category[],
  tipo: 'ingreso' | 'gasto',
): { category: Category | null; totalMinor: number; cantidad: number }[] {
  const buscada = tipo === 'gasto' ? TxType.GASTO : TxType.INGRESO;
  const mapa = new Map<string, { totalMinor: number; cantidad: number }>();

  for (const t of transactions) {
    if (t.type !== buscada) continue;
    const key = t.categoryId ?? '__sin__';
    const actual = mapa.get(key) ?? { totalMinor: 0, cantidad: 0 };
    actual.totalMinor += t.amountMinor;
    actual.cantidad += 1;
    mapa.set(key, actual);
  }

  const porId = new Map(categories.map((c) => [c.id, c]));
  return [...mapa.entries()]
    .map(([id, v]) => ({ category: porId.get(id) ?? null, ...v }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

/**
 * Quien gasto cuanto. Esta es la vista individual que pedia el planteo:
 * el libro es compartido, pero cada movimiento sabe quien lo cargo.
 */
export function porPersona(
  transactions: Transaction[],
  members: Member[],
): { member: Member; resumen: Resumen }[] {
  return members
    .map((member) => ({
      member,
      resumen: resumir(transactions.filter((t) => t.createdBy === member.id)),
    }))
    .sort((a, b) => b.resumen.gastoMinor - a.resumen.gastoMinor);
}

/**
 * Balance de la pareja: cuanto puso cada uno de los gastos compartidos y quien
 * le debe a quien para emparejar. Solo mira gastos en cuentas compartidas.
 */
export function balanceDePareja(
  transactions: Transaction[],
  accounts: Account[],
  members: Member[],
): { deudor: Member; acreedor: Member; montoMinor: number } | null {
  if (members.length !== 2) return null;

  const compartidas = new Set(
    accounts.filter((a) => a.owner === 'compartida').map((a) => a.id),
  );

  const puesto = new Map<string, number>(members.map((m) => [m.id, 0]));
  for (const t of transactions) {
    if (t.type !== TxType.GASTO || !compartidas.has(t.accountId)) continue;
    if (!puesto.has(t.createdBy)) continue;
    puesto.set(t.createdBy, puesto.get(t.createdBy)! + t.amountMinor);
  }

  const [a, b] = members;
  const ta = puesto.get(a.id) ?? 0;
  const tb = puesto.get(b.id) ?? 0;

  // La mitad de la diferencia: si uno puso 100 y el otro 60, el segundo le
  // debe 20 al primero para que ambos terminen habiendo puesto 80.
  const diff = ta - tb;
  if (diff === 0) return null;

  const montoMinor = Math.trunc(Math.abs(diff) / 2);
  if (montoMinor === 0) return null;

  return diff > 0
    ? { deudor: b, acreedor: a, montoMinor }
    : { deudor: a, acreedor: b, montoMinor };
}

/** Estado de cada presupuesto del mes. */
export function estadoPresupuestos(
  budgets: Budget[],
  transactions: Transaction[],
  period: string,
): { budget: Budget; gastadoMinor: number; ratio: number }[] {
  const delMes = transaccionesDelMes(transactions, period);

  return budgets
    .filter((b) => b.period === period)
    .map((budget) => {
      const gastadoMinor = sumarMinor(
        ...delMes
          .filter((t) => t.type === TxType.GASTO &&
            (budget.categoryId === null || t.categoryId === budget.categoryId))
          .map((t) => t.amountMinor),
      );
      return {
        budget,
        gastadoMinor,
        ratio: budget.amountMinor > 0 ? gastadoMinor / budget.amountMinor : 0,
      };
    });
}

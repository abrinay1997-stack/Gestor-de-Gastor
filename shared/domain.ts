/**
 * Motor de calculo. Funciones puras, sin red ni estado: el cliente y el Worker
 * usan exactamente las mismas, asi que lo que ves en pantalla al instante
 * (actualizacion optimista) y lo que confirma el servidor no pueden diferir.
 */

import {
  type Account, type Budget, type Category, type Jar, type JarImputacion,
  type JarTransfer, type Member, type Transaction, TxType,
} from './types.ts';
import { repartir, sumarMinor } from './money.ts';
import { dentroDe, type Periodo } from './periodo.ts';

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
 * Como se reparte un ingreso entre las jarras, o a que jarra va un movimiento.
 * Devuelve un mapa jarraId -> centavos (positivos entran, negativos salen).
 *
 * Esto se calcula UNA sola vez, al guardar el movimiento, y el resultado queda
 * escrito en jar_imputacion. Antes se recalculaba en cada lectura con los
 * porcentajes vigentes, asi que subir el ahorro del 10% al 20% reescribia el
 * sueldo de enero. Ahora cambiar un porcentaje solo afecta lo que venga
 * despues.
 *
 * Usa `repartir`, que garantiza que la suma de las partes sea exactamente el
 * total. Ver la explicacion del metodo del mayor resto en money.ts.
 */
export function imputacionJarras(
  tx: Pick<Transaction, 'type' | 'amountMinor' | 'distributeToJars' | 'jarId'>,
  jars: Jar[],
): Map<string, number> {
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

/**
 * Saldo de cada jarra: la suma de sus imputaciones mas los traspasos.
 *
 * `periodo` acota que se cuenta. Sin periodo es el saldo de toda la vida, que
 * es el que cuadra contra las cuentas y el que decide si una jarra esta en
 * rojo. Con periodo es la lectura del mes.
 *
 * Ojo con la diferencia: leer por mes NO borra lo que sobro del mes anterior.
 * La plata sigue en la jarra; lo unico que cambia es que numero se mira.
 */
export function calcularJarras(
  jars: Jar[],
  imputaciones: JarImputacion[],
  transfers: JarTransfer[],
  fechaDe?: (txId: string) => number | undefined,
  periodo?: Periodo,
): Map<string, number> {
  const saldos = new Map<string, number>(jars.map((j) => [j.id, 0]));
  const suma = (jarId: string, delta: number) => {
    const actual = saldos.get(jarId);
    if (actual !== undefined) saldos.set(jarId, actual + delta);
  };

  for (const i of imputaciones) {
    if (periodo) {
      const fecha = fechaDe?.(i.txId);
      // Una imputacion sin movimiento a la vista no se puede ubicar en el
      // tiempo: se deja afuera del periodo en vez de contarla en el mes que no
      // es. En el saldo de toda la vida si entra.
      if (fecha === undefined || !dentroDe(fecha, periodo)) continue;
    }
    suma(i.jarId, i.amountMinor);
  }

  for (const t of transfers) {
    if (periodo && !dentroDe(t.date, periodo)) continue;
    suma(t.fromJarId, -t.amountMinor);
    suma(t.toJarId, t.amountMinor);
  }

  return saldos;
}

/** Cuanto entro y cuanto salio de una jarra, para leer el mes. */
export interface FlujoJarra {
  entroMinor: number;
  salioMinor: number;
}

export function flujoDeJarras(
  jars: Jar[],
  imputaciones: JarImputacion[],
  transfers: JarTransfer[],
  fechaDe?: (txId: string) => number | undefined,
  periodo?: Periodo,
): Map<string, FlujoJarra> {
  const out = new Map<string, FlujoJarra>(jars.map((j) => [j.id, { entroMinor: 0, salioMinor: 0 }]));
  const anotar = (jarId: string, delta: number) => {
    const f = out.get(jarId);
    if (!f) return;
    if (delta >= 0) f.entroMinor += delta;
    else f.salioMinor += -delta;
  };

  for (const i of imputaciones) {
    if (periodo) {
      const fecha = fechaDe?.(i.txId);
      if (fecha === undefined || !dentroDe(fecha, periodo)) continue;
    }
    anotar(i.jarId, i.amountMinor);
  }
  for (const t of transfers) {
    if (periodo && !dentroDe(t.date, periodo)) continue;
    anotar(t.fromJarId, -t.amountMinor);
    anotar(t.toJarId, t.amountMinor);
  }
  return out;
}

/**
 * La plata que existe y todavia no tiene trabajo asignado.
 *
 * No es una tabla ni un saldo guardado: es una resta, calculada al leer, igual
 * que el saldo de una cuenta. Por ser una resta no puede desincronizarse.
 *
 * Con esto las jarras y las cuentas dejan de ser dos libros paralelos:
 *
 *     jarras + sin asignar = la plata que hay de verdad
 *
 * Un ingreso repartido sube las jarras y no lo mueve. Uno sin repartir lo
 * sube. Un gasto sin jarra lo baja. Si queda negativo, asignaron mas de lo que
 * tienen, y eso merece un aviso.
 *
 * Las cuentas archivadas quedan afuera, igual que en el patrimonio: si no
 * cuentan como plata disponible, tampoco pueden respaldar una jarra.
 */
export function sinAsignar(accounts: Account[], saldosJarras: Map<string, number>): number {
  const enCuentas = accounts.reduce((t, a) => (a.archived ? t : t + a.balanceMinor), 0);
  let enJarras = 0;
  for (const saldo of saldosJarras.values()) enJarras += saldo;
  return enCuentas - enJarras;
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
 * A quien se le atribuye un movimiento.
 *
 * Vale quien lo hizo; si no se dijo, quien lo cargo. La distincion importa
 * porque uno puede anotar la compra que hizo el otro, y para las estadisticas
 * lo que cuenta es quien gasto, no quien tuvo el telefono en la mano.
 */
export const autorDe = (tx: Transaction): string => tx.paidBy ?? tx.createdBy;

/**
 * Quien gasto cuanto. Esta es la vista individual que pedia el planteo:
 * el libro es compartido, pero cada movimiento sabe de quien fue.
 */
export function porPersona(
  transactions: Transaction[],
  members: Member[],
): { member: Member; resumen: Resumen }[] {
  return members
    .map((member) => ({
      member,
      resumen: resumir(transactions.filter((t) => autorDe(t) === member.id)),
    }))
    .sort((a, b) => b.resumen.gastoMinor - a.resumen.gastoMinor);
}

/** Balance de cada mes de un rango, para el grafico de evolucion. */
export function balancePorMes(
  transactions: Transaction[],
  periodos: string[],
): { periodo: string; resumen: Resumen; acumuladoMinor: number }[] {
  let acumuladoMinor = 0;
  return periodos.map((periodo) => {
    const resumen = resumir(transaccionesDelMes(transactions, periodo));
    acumuladoMinor += resumen.flujoMinor;
    return { periodo, resumen, acumuladoMinor };
  });
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

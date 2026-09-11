/**
 * Fuente unica de verdad del dominio, compartida por el cliente y el Worker.
 *
 * El repo anterior tenia dos definiciones en conflicto (src/types.ts y
 * src/types/index.ts) donde, por ejemplo, Transaction.date era string en una y
 * number en la otra. Eso ya no puede pasar: este archivo es el unico.
 *
 * REGLA DE ORO: todo monto es un entero en unidades minimas (centavos).
 * Nunca un float. 0.1 + 0.2 !== 0.3 en JavaScript, y con plata eso es un bug
 * que se acumula en silencio hasta que los saldos dejan de cuadrar.
 */

// ---------------------------------------------------------------------------
// Transacciones
// ---------------------------------------------------------------------------

/**
 * Tipos de movimiento. La numeracion viene del modelo de ezBookkeeping, que
 * acierta en algo que la version anterior no tenia: AJUSTE es un tipo propio.
 * Cuando el saldo real no coincide con el de la app (te descontaron una
 * comision, redondeaste mal), registras un ajuste en vez de "arreglar" el saldo
 * a mano. Asi el historial siempre explica cada peso.
 */
export const TxType = {
  AJUSTE: 1,
  INGRESO: 2,
  GASTO: 3,
  TRANSFERENCIA: 4,
} as const;
export type TxType = (typeof TxType)[keyof typeof TxType];

export const TX_TYPE_LABEL: Record<TxType, string> = {
  [TxType.AJUSTE]: 'Ajuste de saldo',
  [TxType.INGRESO]: 'Ingreso',
  [TxType.GASTO]: 'Gasto',
  [TxType.TRANSFERENCIA]: 'Transferencia',
};

export interface Transaction {
  id: string;
  householdId: string;
  type: TxType;
  /** Entero en centavos, siempre positivo. El tipo define el signo. */
  amountMinor: number;
  /** Cuenta de origen. En un ingreso, la cuenta que recibe. */
  accountId: string;
  /** Solo en transferencias: cuenta de destino. */
  destAccountId: string | null;
  /**
   * Solo en transferencias entre monedas distintas. Si es null, se asume
   * igual a amountMinor.
   */
  destAmountMinor: number | null;
  categoryId: string | null;
  /** Jarra a la que se imputa un gasto, si aplica. */
  jarId: string | null;
  /** Si es un ingreso, repartirlo entre las jarras segun sus porcentajes. */
  distributeToJars: boolean;
  description: string;
  notes: string | null;
  /** Epoch en milisegundos, UTC. */
  date: number;
  /**
   * Quien lo cargo en la app. Se asigna solo y no se edita nunca: es el
   * rastro de quien estuvo usando la aplicacion.
   */
  createdBy: string;
  /**
   * Quien hizo el gasto de verdad, que no siempre es quien lo cargo: uno
   * puede anotar la compra que hizo el otro. null significa "el mismo que lo
   * cargo". Es este el que cuenta para las estadisticas por persona.
   */
  paidBy: string | null;
  /** Si nacio de un pago habitual, cual. */
  recurringId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Lo que el cliente manda para crear o editar. El servidor pone el resto. */
export type TransactionInput = Omit<
  Transaction,
  'id' | 'householdId' | 'createdBy' | 'createdAt' | 'updatedAt'
> & { id?: string };

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

/**
 * Categorias de cuenta con semantica de activo/pasivo, tomada de ezBookkeeping.
 * Importa de verdad: una tarjeta de credito con "saldo" 50.000 no es plata que
 * tenes, es plata que debes. Sumarla al patrimonio como hacia la version
 * anterior te miente en la cara.
 */
export const AccountCategory = {
  EFECTIVO: 1,
  CUENTA_CORRIENTE: 2,
  TARJETA_CREDITO: 3,
  AHORRO: 4,
  INVERSION: 5,
  DEUDA: 6,
  POR_COBRAR: 7,
} as const;
export type AccountCategory = (typeof AccountCategory)[keyof typeof AccountCategory];

/** true = suma al patrimonio; false = resta (es un pasivo). */
const ES_ACTIVO: Record<AccountCategory, boolean> = {
  [AccountCategory.EFECTIVO]: true,
  [AccountCategory.CUENTA_CORRIENTE]: true,
  [AccountCategory.TARJETA_CREDITO]: false,
  [AccountCategory.AHORRO]: true,
  [AccountCategory.INVERSION]: true,
  [AccountCategory.DEUDA]: false,
  [AccountCategory.POR_COBRAR]: true,
};

export const esActivo = (c: AccountCategory): boolean => ES_ACTIVO[c] ?? true;
export const esPasivo = (c: AccountCategory): boolean => !esActivo(c);

export const ACCOUNT_CATEGORY_LABEL: Record<AccountCategory, string> = {
  [AccountCategory.EFECTIVO]: 'Efectivo',
  [AccountCategory.CUENTA_CORRIENTE]: 'Cuenta corriente',
  [AccountCategory.TARJETA_CREDITO]: 'Tarjeta de credito',
  [AccountCategory.AHORRO]: 'Ahorro',
  [AccountCategory.INVERSION]: 'Inversion',
  [AccountCategory.DEUDA]: 'Deuda',
  [AccountCategory.POR_COBRAR]: 'Por cobrar',
};

export interface Account {
  id: string;
  householdId: string;
  name: string;
  category: AccountCategory;
  currency: string;
  /** Saldo con el que arranca la cuenta. Los movimientos se suman encima. */
  initialBalanceMinor: number;
  /**
   * Saldo actual, derivado: initialBalanceMinor + suma de movimientos.
   * El servidor lo calcula con SQL en cada lectura, no lo guarda incrementando.
   * Por eso no puede desincronizarse nunca.
   */
  balanceMinor: number;
  color: string;
  icon: string;
  /**
   * De quien es la cuenta. 'compartida' la ven y usan los dos;
   * si es de una persona, sigue siendo visible para ambos (son pareja) pero
   * se separa en los totales individuales.
   */
  owner: 'compartida' | string;
  archived: boolean;
  displayOrder: number;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Categorias (dos niveles, como ezBookkeeping)
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  householdId: string;
  name: string;
  type: 'ingreso' | 'gasto';
  /** null = categoria de primer nivel. Si no, es subcategoria. */
  parentId: string | null;
  icon: string;
  color: string;
  archived: boolean;
  displayOrder: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Jarras (metodo de los 6 frascos) - feature propia del repo, conservada
// ---------------------------------------------------------------------------

export interface Jar {
  id: string;
  householdId: string;
  name: string;
  /**
   * Porcentaje en puntos base: 2,5% se guarda como 250, no como 0.025.
   * Entero otra vez, por el mismo motivo que los montos.
   */
  percentageBp: number;
  color: string;
  icon: string;
  displayOrder: number;
  createdAt: number;
  /** Derivado de las imputaciones, igual que el saldo de cuenta. */
  balanceMinor: number;
}

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

export interface Budget {
  id: string;
  householdId: string;
  /** null = presupuesto global del mes. */
  categoryId: string | null;
  amountMinor: number;
  /** Mes en formato YYYY-MM. */
  period: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Ajustes manuales de saldo
// ---------------------------------------------------------------------------

/**
 * Una correccion a mano del saldo de una cuenta.
 *
 * No es un movimiento: no aparece en la lista, no entra en las estadisticas y
 * no tiene categoria. Es la constancia de que alguien dijo "esta cuenta tiene
 * tanto" y de cuanto se movio el numero al decirlo. Por dentro lo que cambia
 * es el saldo inicial de la cuenta, nunca los movimientos.
 */
export interface Adjustment {
  id: string;
  householdId: string;
  accountId: string;
  /** Quien lo hizo. null si esa persona ya no esta en el hogar. */
  memberId: string | null;
  fromMinor: number;
  toMinor: number;
  /** toMinor - fromMinor. Guardado aparte para no recalcularlo al leer. */
  deltaMinor: number;
  note: string | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Pagos habituales
// ---------------------------------------------------------------------------

export interface Recurring {
  id: string;
  householdId: string;
  name: string;
  /** Solo INGRESO o GASTO: no tiene sentido una transferencia automatica. */
  type: TxType;
  amountMinor: number;
  accountId: string;
  categoryId: string | null;
  jarId: string | null;
  paidBy: string | null;
  frequency: 'semanal' | 'quincenal' | 'mensual' | 'anual';
  dayOfMonth: number | null;
  /** Segundo cobro del mes. Solo quincenal; 31 significa el ultimo dia. */
  dayOfMonth2: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  active: boolean;
  /** Cuando toca el proximo. Avanzar esto es lo que evita duplicados. */
  nextRun: number;
  lastRun: number | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Personas y hogar
// ---------------------------------------------------------------------------

export interface Member {
  id: string;
  householdId: string;
  email: string;
  displayName: string;
  /** Color con el que se lo identifica en la app. */
  color: string;
  /** Emoji del avatar. Vacio = se muestran las iniciales. */
  emoji: string;
  /**
   * Orden de las secciones del Inicio. Vacio = el orden por defecto.
   * Es por persona: cada uno acomoda su pantalla como quiere.
   */
  homeLayout: SeccionInicio[];
  createdAt: number;
}

/** Secciones que se pueden ordenar y ocultar en el Inicio. */
export const SECCIONES_INICIO = [
  'resumen', 'patrimonio', 'quien-gasto', 'presupuestos',
  'por-categoria', 'pagos-habituales', 'ultimos',
] as const;
export type SeccionInicio = (typeof SECCIONES_INICIO)[number];

export const SECCION_LABEL: Record<SeccionInicio, string> = {
  'resumen': 'Balance del mes',
  'patrimonio': 'Patrimonio total',
  'quien-gasto': 'Quién gastó',
  'presupuestos': 'Presupuestos',
  'por-categoria': 'En qué se fue',
  'pagos-habituales': 'Pagos habituales',
  'ultimos': 'Últimos movimientos',
};

export interface Household {
  id: string;
  name: string;
  currency: string;
  createdAt: number;
}

/** Todo lo que el cliente necesita en un solo viaje al arrancar. */
export interface Snapshot {
  household: Household;
  members: Member[];
  me: Member;
  accounts: Account[];
  categories: Category[];
  jars: Jar[];
  budgets: Budget[];
  transactions: Transaction[];
  recurring: Recurring[];
}

// ---------------------------------------------------------------------------
// Mensajes de tiempo real
// ---------------------------------------------------------------------------

export type LiveEvent =
  | { kind: 'tx:upsert'; tx: Transaction; by: string }
  | { kind: 'tx:delete'; id: string; by: string }
  | { kind: 'account:upsert'; account: Account; by: string }
  | { kind: 'account:delete'; id: string; by: string }
  | { kind: 'category:upsert'; category: Category; by: string }
  | { kind: 'jar:upsert'; jar: Jar; by: string }
  | { kind: 'budget:upsert'; budget: Budget; by: string }
  | { kind: 'budget:delete'; id: string; by: string }
  | { kind: 'member:upsert'; member: Member; by: string }
  | { kind: 'recurring:upsert'; recurring: Recurring; by: string }
  | { kind: 'recurring:delete'; id: string; by: string }
  /**
   * Algo cambio por fuera de la app (el disparador de pagos habituales) y
   * conviene recargar. Trae los saldos ya recalculados.
   */
  | { kind: 'recargar'; accounts: Account[]; jars: Jar[] }
  | { kind: 'presence'; online: string[] }
  | { kind: 'hello'; online: string[] };

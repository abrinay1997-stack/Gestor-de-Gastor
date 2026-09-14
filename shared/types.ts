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
  /**
   * De quien es este movimiento. NULL = la de su categoria, que es el caso
   * normal. Solo se escribe cuando se corrige a mano uno suelto, o cuando no
   * hay categoria (una transferencia).
   */
  entityId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Lo que el cliente manda para crear o editar. El servidor pone el resto. */
export type TransactionInput = Omit<
  Transaction,
  'id' | 'householdId' | 'createdBy' | 'createdAt' | 'updatedAt'
> & { id?: string };

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

/**
 * De quien es la plata: la casa o uno de los negocios.
 *
 * Un solo libro con tres dueños, no tres apps: lo valioso es justamente poder
 * cruzarlos. `kind` no cambia ninguna logica, solo el vocabulario de la
 * pantalla y las jarras que se proponen al crearla.
 */
export interface Entity {
  id: string;
  householdId: string;
  name: string;
  kind: 'personal' | 'negocio';
  color: string;
  icon: string;
  displayOrder: number;
  archived: boolean;
  createdAt: number;
}

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
  /**
   * De que negocio es esta cuenta. NULL = mezclada, que hoy son todas.
   * Solo sirve como valor por defecto al cargar y para saber de quien era el
   * efectivo cuando una entidad le paga algo a otra.
   */
  entityId: string | null;
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
  /**
   * De quien es lo que se gasta o se cobra con esta categoria.
   *
   * Aca es donde vive la entidad, y no en el movimiento. Ellos ya venian
   * clasificando asi con el unico campo que tenian: crearon categorias
   * llamadas "PanaClaw" y "BukoFlow". Poner la entidad aca convierte 44
   * decisiones en 13 y no agrega ninguna pregunta al cargar un gasto.
   *
   * Ademas la hace reversible: si se equivocan, cambian la categoria y toda su
   * historia se reclasifica sola, sin reescribir un solo movimiento.
   */
  entityId: string | null;
}

// ---------------------------------------------------------------------------
// Jarras (metodo de los 6 frascos) - feature propia del repo, conservada
// ---------------------------------------------------------------------------

export interface Jar {
  id: string;
  householdId: string;
  name: string;
  /**
   * Si acumula, el numero grande es el de toda la vida (Ahorro largo plazo).
   * Si no, el del periodo elegido (Necesidades, Diversion).
   *
   * Es solo como se lee: lo que sobra de un mes NO se tira, se queda adentro.
   */
  acumula: boolean;
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
  /** De que economia es esta jarra. Los porcentajes suman 100% por entidad. */
  entityId: string | null;
  /**
   * Como se llena. Los frascos de una casa van por porcentaje porque el
   * ingreso es parejo; un cobro de agencia que va de $50 a $5.000 se
   * presupuesta mejor con montos fijos y una jarra que absorba el resto.
   */
  fillKind: 'porcentaje' | 'fijo' | 'resto';
  /** Centavos, solo cuando fillKind es 'fijo'. */
  fillMinor: number | null;
}

/**
 * Lo que un movimiento le hizo a una jarra, escrito en el momento.
 *
 * Antes el saldo se recalculaba en cada lectura con los porcentajes vigentes,
 * asi que cambiar un porcentaje reescribia el pasado. Congelar la imputacion
 * es lo que hace que el historial se quede quieto.
 */
export interface JarImputacion {
  id: string;
  householdId: string;
  txId: string;
  jarId: string;
  /** Positivo entra, negativo sale. */
  amountMinor: number;
  createdAt: number;
}

/**
 * Mover plata de una jarra a otra. No toca ninguna cuenta: no es un
 * movimiento de dinero, es un cambio de plan.
 */
export interface JarTransfer {
  id: string;
  householdId: string;
  fromJarId: string;
  toJarId: string;
  amountMinor: number;
  note: string | null;
  date: number;
  createdBy: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

export interface Budget {
  id: string;
  householdId: string;
  /** El presupuesto de publicidad de un negocio no come el de comida. */
  entityId: string | null;
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
  /**
   * Repartir el ingreso entre las jarras al crearlo. Sin esto, un sueldo que
   * entra por un pago habitual no puede llegar a ninguna jarra: el disparador
   * lo insertaba con el reparto apagado a mano.
   */
  distributeToJars: boolean;
  paidBy: string | null;
  frequency: 'semanal' | 'quincenal' | 'mensual' | 'anual';
  dayOfMonth: number | null;
  /** Segundo cobro del mes. Solo quincenal; 31 significa el ultimo dia. */
  dayOfMonth2: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  active: boolean;
  entityId: string | null;
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
  entities: Entity[];
  transactions: Transaction[];
  recurring: Recurring[];
  /** Lo que cada movimiento le hizo a cada jarra, congelado. */
  imputaciones: JarImputacion[];
  jarTransfers: JarTransfer[];
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
  | { kind: 'entity:upsert'; entity: Entity; by: string }
  | { kind: 'entity:delete'; id: string; by: string }
  | { kind: 'jar:upsert'; jar: Jar; by: string }
  /**
   * Las jarras cambiaron enteras (porcentajes, nombres, altas y bajas). Se
   * mandan todas juntas porque se guardan juntas: un reparto a medio aplicar
   * no seria valido.
   */
  | { kind: 'jars'; jars: Jar[]; by: string }
  | { kind: 'jarTransfer:upsert'; transfer: JarTransfer; by: string }
  | { kind: 'jarTransfer:delete'; id: string; by: string }
  /**
   * Las imputaciones de un movimiento. Van con el evento del movimiento y no
   * dentro de el porque tambien cambian solas cuando se reparte un ingreso
   * viejo desde la puesta al dia.
   */
  | { kind: 'imputaciones'; txId: string; imputaciones: JarImputacion[]; by: string }
  | { kind: 'budget:upsert'; budget: Budget; by: string }
  | { kind: 'budget:delete'; id: string; by: string }
  | { kind: 'member:upsert'; member: Member; by: string }
  | { kind: 'recurring:upsert'; recurring: Recurring; by: string }
  | { kind: 'recurring:delete'; id: string; by: string }
  /**
   * Algo cambio por fuera de la app (el disparador de pagos habituales) y
   * conviene recargar. Trae los saldos ya recalculados.
   */
  | {
      kind: 'recargar';
      accounts: Account[];
      jars: Jar[];
      imputaciones?: JarImputacion[];
    }
  | { kind: 'presence'; online: string[] }
  | { kind: 'hello'; online: string[] };

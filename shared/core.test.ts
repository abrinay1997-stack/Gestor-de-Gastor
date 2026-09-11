import { describe, expect, it } from 'vitest';
import { formatMonto, parseMonto, repartir } from './money.ts';
import {
  autorDe, balancePorMes, calcularJarras, calcularPatrimonio, calcularSaldos,
  efectoEnCuenta, porPersona, resumir, validarJarras,
} from './domain.ts';
import { leer } from './parser.ts';
import {
  AccountCategory, type Account, type Category, type Jar, type Member,
  type Transaction, TxType,
} from './types.ts';

// --- helpers -------------------------------------------------------------

const tx = (p: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(), householdId: 'h', type: TxType.GASTO, amountMinor: 0,
  accountId: 'a1', destAccountId: null, destAmountMinor: null, categoryId: null,
  jarId: null, distributeToJars: false, description: '', notes: null,
  date: Date.now(), createdBy: 'u1', paidBy: null, recurringId: null,
  createdAt: 0, updatedAt: 0, ...p,
});

const cuenta = (p: Partial<Account>): Account => ({
  id: 'a1', householdId: 'h', name: 'Cuenta', category: AccountCategory.EFECTIVO,
  currency: 'USD', initialBalanceMinor: 0, balanceMinor: 0, color: '#000',
  icon: 'wallet', owner: 'compartida', archived: false, displayOrder: 0,
  createdAt: 0, updatedAt: 0, ...p,
});

const jarra = (id: string, bp: number, orden: number): Jar => ({
  id, householdId: 'h', name: id, percentageBp: bp, color: '#000', icon: 'jar',
  displayOrder: orden, createdAt: 0, balanceMinor: 0,
});

// --- dinero --------------------------------------------------------------

describe('parseMonto', () => {
  it('lee formato con punto decimal', () => {
    expect(parseMonto('1234.56')).toBe(123456);
  });

  it('lee formato con coma decimal', () => {
    expect(parseMonto('1234,56')).toBe(123456);
  });

  it('lee miles con punto y decimales con coma', () => {
    expect(parseMonto('1.234,56')).toBe(123456);
  });

  it('lee miles con coma y decimales con punto', () => {
    expect(parseMonto('1,234.56')).toBe(123456);
  });

  it('trata un grupo suelto de tres digitos como miles', () => {
    expect(parseMonto('1.234')).toBe(123400);
  });

  it('ignora simbolos de moneda y espacios', () => {
    expect(parseMonto('$ 1 234,50')).toBe(123450);
  });

  it('respeta monedas sin decimales', () => {
    expect(parseMonto('1500', 'CLP')).toBe(1500);
  });

  it('devuelve null si no hay numero', () => {
    expect(parseMonto('hola')).toBeNull();
  });

  it('no pierde precision donde los floats fallan', () => {
    // 0.1 + 0.2 !== 0.3 en float. En centavos es 10 + 20 === 30, exacto.
    expect(parseMonto('0.1')! + parseMonto('0.2')!).toBe(parseMonto('0.3'));
  });
});

describe('formatMonto', () => {
  it('formatea en USD', () => {
    expect(formatMonto(123456)).toBe('$1,234.56');
  });

  it('muestra negativos con el signo adelante', () => {
    expect(formatMonto(-123456)).toBe('-$1,234.56');
  });

  it('agrega signo explicito cuando se pide', () => {
    expect(formatMonto(500, 'USD', { signo: true })).toBe('+$5.00');
  });
});

describe('repartir', () => {
  it('reparte exacto sin perder centavos', () => {
    // El caso que rompia la version anterior: jarras de 2,5% sobre $1.000.
    const bps = [5500, 1000, 1000, 1000, 1000, 250, 250]; // suma 10000
    const partes = repartir(100_000, bps);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it('cuadra incluso con un total indivisible', () => {
    const partes = repartir(100, [3333, 3333, 3334]);
    expect(partes.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('cuadra para cualquier total, probado exhaustivamente', () => {
    const bps = [5500, 1000, 1000, 1000, 1000, 250, 250];
    for (let total = 0; total < 3000; total++) {
      const suma = repartir(total, bps).reduce((a, b) => a + b, 0);
      expect(suma).toBe(total);
    }
  });

  it('es determinista', () => {
    const bps = [3333, 3333, 3334];
    expect(repartir(1000, bps)).toEqual(repartir(1000, bps));
  });

  it('da los centavos sobrantes al resto mas grande', () => {
    // 10 centavos entre 1/3 y 2/3: 3.33 y 6.66 -> pisos 3 y 6, sobra 1.
    expect(repartir(10, [3333, 6667])).toEqual([3, 7]);
  });

  it('maneja montos negativos', () => {
    expect(repartir(-100, [5000, 5000])).toEqual([-50, -50]);
  });

  it('devuelve ceros si los pesos suman cero', () => {
    expect(repartir(100, [0, 0])).toEqual([0, 0]);
  });
});

// --- saldos --------------------------------------------------------------

describe('efectoEnCuenta', () => {
  it('un ingreso suma en su cuenta', () => {
    expect(efectoEnCuenta(tx({ type: TxType.INGRESO, amountMinor: 5000 }), 'a1')).toBe(5000);
  });

  it('un gasto resta en su cuenta', () => {
    expect(efectoEnCuenta(tx({ type: TxType.GASTO, amountMinor: 5000 }), 'a1')).toBe(-5000);
  });

  it('no toca cuentas ajenas', () => {
    expect(efectoEnCuenta(tx({ type: TxType.GASTO, amountMinor: 5000 }), 'otra')).toBe(0);
  });

  it('una transferencia resta en origen y suma en destino', () => {
    const t = tx({ type: TxType.TRANSFERENCIA, amountMinor: 5000, accountId: 'a1', destAccountId: 'a2' });
    expect(efectoEnCuenta(t, 'a1')).toBe(-5000);
    expect(efectoEnCuenta(t, 'a2')).toBe(5000);
  });

  it('una transferencia entre monedas usa el monto de destino', () => {
    const t = tx({
      type: TxType.TRANSFERENCIA, amountMinor: 5000,
      accountId: 'a1', destAccountId: 'a2', destAmountMinor: 480000,
    });
    expect(efectoEnCuenta(t, 'a1')).toBe(-5000);
    expect(efectoEnCuenta(t, 'a2')).toBe(480000);
  });

  it('una transferencia a la misma cuenta se anula', () => {
    const t = tx({ type: TxType.TRANSFERENCIA, amountMinor: 5000, accountId: 'a1', destAccountId: 'a1' });
    expect(efectoEnCuenta(t, 'a1')).toBe(0);
  });
});

describe('calcularSaldos', () => {
  it('parte del saldo inicial y aplica los movimientos', () => {
    const cuentas = [cuenta({ id: 'a1', initialBalanceMinor: 100_000 })];
    const movs = [
      tx({ type: TxType.GASTO, amountMinor: 25_000 }),
      tx({ type: TxType.INGRESO, amountMinor: 5_000 }),
    ];
    expect(calcularSaldos(cuentas, movs).get('a1')).toBe(80_000);
  });

  it('no se desincroniza al recalcular (no hay estado acumulado)', () => {
    const cuentas = [cuenta({ id: 'a1', initialBalanceMinor: 0 })];
    const movs = Array.from({ length: 500 }, () => tx({ type: TxType.GASTO, amountMinor: 333 }));
    expect(calcularSaldos(cuentas, movs).get('a1')).toBe(-166_500);
    expect(calcularSaldos(cuentas, movs).get('a1')).toBe(-166_500);
  });
});

describe('calcularPatrimonio', () => {
  it('suma los saldos con su signo', () => {
    // Convencion: el signo vive en el saldo. Una tarjeta con consumo queda en
    // negativo, asi que sumarla ya la resta del patrimonio.
    const cuentas = [
      cuenta({ id: 'a1', category: AccountCategory.EFECTIVO, balanceMinor: 100_000 }),
      cuenta({ id: 'a2', category: AccountCategory.TARJETA_CREDITO, balanceMinor: -30_000 }),
    ];
    expect(calcularPatrimonio(cuentas)).toBe(70_000);
  });

  it('ignora las cuentas archivadas', () => {
    const cuentas = [
      cuenta({ id: 'a1', balanceMinor: 100_000 }),
      cuenta({ id: 'a2', balanceMinor: 50_000, archived: true }),
    ];
    expect(calcularPatrimonio(cuentas)).toBe(100_000);
  });
});

// --- jarras --------------------------------------------------------------

describe('calcularJarras', () => {
  const jarras = [
    jarra('j1', 5500, 0), jarra('j2', 1000, 1), jarra('j3', 1000, 2),
    jarra('j4', 1000, 3), jarra('j5', 1000, 4), jarra('j6', 250, 5), jarra('j7', 250, 6),
  ];

  it('reparte un ingreso sin perder ni un centavo', () => {
    const movs = [tx({ type: TxType.INGRESO, amountMinor: 333_333, distributeToJars: true })];
    const saldos = calcularJarras(jarras, movs);
    const suma = [...saldos.values()].reduce((a, b) => a + b, 0);
    expect(suma).toBe(333_333);
  });

  it('imputa un gasto a su jarra', () => {
    const movs = [tx({ type: TxType.GASTO, amountMinor: 10_000, jarId: 'j1' })];
    expect(calcularJarras(jarras, movs).get('j1')).toBe(-10_000);
  });

  it('no imputa nada si el gasto no tiene jarra', () => {
    const movs = [tx({ type: TxType.GASTO, amountMinor: 10_000 })];
    expect([...calcularJarras(jarras, movs).values()].every((v) => v === 0)).toBe(true);
  });

  it('el total de las jarras sigue al total de ingresos tras muchos meses', () => {
    const movs = Array.from({ length: 24 }, () =>
      tx({ type: TxType.INGRESO, amountMinor: 123_457, distributeToJars: true }));
    const suma = [...calcularJarras(jarras, movs).values()].reduce((a, b) => a + b, 0);
    expect(suma).toBe(24 * 123_457);
  });
});

describe('validarJarras', () => {
  it('acepta un reparto que suma 100%', () => {
    expect(validarJarras([jarra('j1', 5000, 0), jarra('j2', 5000, 1)]).ok).toBe(true);
  });

  it('rechaza un reparto incompleto', () => {
    expect(validarJarras([jarra('j1', 5000, 0)]).ok).toBe(false);
  });
});

// --- resumenes -----------------------------------------------------------

describe('resumir', () => {
  it('separa ingresos de gastos', () => {
    const r = resumir([
      tx({ type: TxType.INGRESO, amountMinor: 100_000 }),
      tx({ type: TxType.GASTO, amountMinor: 30_000 }),
    ]);
    expect(r).toMatchObject({ ingresoMinor: 100_000, gastoMinor: 30_000, flujoMinor: 70_000 });
  });

  it('excluye transferencias para no inflar los totales', () => {
    const r = resumir([
      tx({ type: TxType.GASTO, amountMinor: 30_000 }),
      tx({ type: TxType.TRANSFERENCIA, amountMinor: 500_000, destAccountId: 'a2' }),
    ]);
    expect(r.gastoMinor).toBe(30_000);
    expect(r.ingresoMinor).toBe(0);
  });
});

describe('autorDe', () => {
  it('usa quien lo cargo si no se dijo quien gasto', () => {
    expect(autorDe(tx({ createdBy: 'u1', paidBy: null }))).toBe('u1');
  });

  it('quien gasto le gana a quien lo cargo', () => {
    // Uno anota la compra que hizo el otro: cuenta para el que gasto.
    expect(autorDe(tx({ createdBy: 'u1', paidBy: 'u2' }))).toBe('u2');
  });
});

describe('porPersona', () => {
  const ana: Member = { id: 'u1', householdId: 'h', email: 'a@a', displayName: 'Ana', color: '#f00', emoji: '', homeLayout: [], createdAt: 0 };
  const beto: Member = { id: 'u2', householdId: 'h', email: 'b@b', displayName: 'Beto', color: '#00f', emoji: '', homeLayout: [], createdAt: 0 };

  it('atribuye a quien gasto, no a quien cargo', () => {
    const movs = [
      // Ana carga un gasto que hizo Beto.
      tx({ type: TxType.GASTO, amountMinor: 10_000, createdBy: 'u1', paidBy: 'u2' }),
      tx({ type: TxType.GASTO, amountMinor: 4_000, createdBy: 'u1', paidBy: null }),
    ];
    const r = porPersona(movs, [ana, beto]);
    const deAna = r.find((x) => x.member.id === 'u1')!;
    const deBeto = r.find((x) => x.member.id === 'u2')!;
    expect(deBeto.resumen.gastoMinor).toBe(10_000);
    expect(deAna.resumen.gastoMinor).toBe(4_000);
  });
});

describe('balancePorMes', () => {
  it('acumula el flujo mes a mes', () => {
    const enero = new Date(2026, 0, 15, 12).getTime();
    const febrero = new Date(2026, 1, 15, 12).getTime();
    const movs = [
      tx({ type: TxType.INGRESO, amountMinor: 100_000, date: enero }),
      tx({ type: TxType.GASTO, amountMinor: 30_000, date: enero }),
      tx({ type: TxType.GASTO, amountMinor: 50_000, date: febrero }),
    ];
    const r = balancePorMes(movs, ['2026-01', '2026-02']);
    expect(r[0].resumen.flujoMinor).toBe(70_000);
    expect(r[0].acumuladoMinor).toBe(70_000);
    expect(r[1].resumen.flujoMinor).toBe(-50_000);
    expect(r[1].acumuladoMinor).toBe(20_000);
  });
});

// --- parser --------------------------------------------------------------

describe('leer', () => {
  const categorias: Category[] = [
    { id: 'c1', householdId: 'h', name: 'Comida', type: 'gasto', parentId: null, icon: 'x', color: '#000', archived: false, displayOrder: 0, createdAt: 0 },
    { id: 'c2', householdId: 'h', name: 'Sueldo', type: 'ingreso', parentId: null, icon: 'x', color: '#000', archived: false, displayOrder: 0, createdAt: 0 },
  ];
  const vacio = { categories: categorias, historial: [] as Transaction[] };

  it('separa monto y descripcion', () => {
    const r = leer('cafe 3500', vacio);
    expect(r.amountMinor).toBe(350_000);
    expect(r.description).toBe('Cafe');
  });

  it('funciona con el monto adelante', () => {
    expect(leer('3500 cafe', vacio).amountMinor).toBe(350_000);
  });

  it('deduce la categoria por palabra clave', () => {
    const r = leer('super 12000', vacio);
    expect(r.categoryId).toBe('c1');
    expect(r.razon).toBe('palabra-clave');
  });

  it('detecta ingresos', () => {
    const r = leer('sueldo 500000', vacio);
    expect(r.type).toBe(TxType.INGRESO);
    expect(r.categoryId).toBe('c2');
  });

  it('asume gasto cuando no hay senales', () => {
    expect(leer('algo raro 100', vacio).type).toBe(TxType.GASTO);
  });

  it('el historial propio le gana a las palabras clave', () => {
    const historial = [
      tx({ description: 'Cafe de la esquina', categoryId: 'c9', type: TxType.GASTO }),
      tx({ description: 'Cafe de la esquina', categoryId: 'c9', type: TxType.GASTO }),
    ];
    const r = leer('cafe 3500', { categories: categorias, historial });
    expect(r.categoryId).toBe('c9');
    expect(r.razon).toBe('historial');
  });

  it('no explota con entrada vacia', () => {
    const r = leer('', vacio);
    expect(r.amountMinor).toBeNull();
    expect(r.description).toBeTruthy();
  });

  it('lee montos con decimales', () => {
    expect(leer('nafta 15.750,80', vacio).amountMinor).toBe(1_575_080);
  });
});

// --- patrimonio con deuda (regresion) ------------------------------------

describe('calcularPatrimonio con tarjeta de credito', () => {
  it('la deuda resta, no suma', () => {
    // Bug real que aparecio probando contra la base: la tarjeta quedaba en
    // -450 (el gasto resta del saldo) y el patrimonio le daba vuelta el signo
    // otra vez, asi que la deuda sumaba $450 en vez de restarlos.
    const cuentas = [
      cuenta({ id: 'a1', category: AccountCategory.EFECTIVO, balanceMinor: 100_000 }),
      cuenta({ id: 'a2', category: AccountCategory.TARJETA_CREDITO, balanceMinor: -45_000 }),
    ];
    expect(calcularPatrimonio(cuentas)).toBe(55_000);
  });

  it('el saldo de la tarjeta baja al gastar con ella', () => {
    const cuentas = [cuenta({ id: 'tc', category: AccountCategory.TARJETA_CREDITO, initialBalanceMinor: 0 })];
    const movs = [tx({ type: TxType.GASTO, amountMinor: 45_000, accountId: 'tc' })];
    expect(calcularSaldos(cuentas, movs).get('tc')).toBe(-45_000);
  });

  it('pagar la tarjeta desde el banco la lleva de vuelta a cero', () => {
    const cuentas = [
      cuenta({ id: 'banco', category: AccountCategory.CUENTA_CORRIENTE, initialBalanceMinor: 100_000 }),
      cuenta({ id: 'tc', category: AccountCategory.TARJETA_CREDITO, initialBalanceMinor: 0 }),
    ];
    const movs = [
      tx({ type: TxType.GASTO, amountMinor: 45_000, accountId: 'tc' }),
      tx({ type: TxType.TRANSFERENCIA, amountMinor: 45_000, accountId: 'banco', destAccountId: 'tc' }),
    ];
    const saldos = calcularSaldos(cuentas, movs);
    expect(saldos.get('tc')).toBe(0);
    expect(saldos.get('banco')).toBe(55_000);

    const conSaldos = cuentas.map((c) => ({ ...c, balanceMinor: saldos.get(c.id)! }));
    expect(calcularPatrimonio(conSaldos)).toBe(55_000);
  });
});

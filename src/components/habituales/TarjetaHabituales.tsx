/**
 * Pagos habituales en Inicio: una tarjeta con dos pestañas de carpeta,
 * «Próximos» y «Completados».
 *
 * Cada pago está en UNA sola pestaña, según lo que pasó con él:
 *
 *   Próximos     → lo que todavía no se pagó. El que viene de cada pago
 *                  habitual, y arriba los que se desmarcaron (pendientes).
 *                  El círculo es «ya lo pagué»: lo registra, lo resta y el
 *                  pago se va a Completados.
 *   Completados  → lo que ya se pagó en los últimos 30 días, ya restado.
 *                  «?» = lo registró la app sola y nadie lo vio todavía en el
 *                  banco. ✓ = confirmado. Desmarcar un pago lo devuelve a
 *                  Próximos como pendiente y la plata vuelve a la cuenta.
 *
 * Antes era una sola lista con un check que hacía dos cosas opuestas según el
 * estado, y ese doble sentido costó plata (DKE96): tocarlo para pagar
 * noviembre deshacía el pago de octubre. Ahora cada fila es un pago concreto,
 * con su fecha, y cada toque dice qué hace antes de hacerlo.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../../store/store.tsx';
import { formatMonto } from '@shared/money';
import { TxType, type Recurring, type Transaction } from '@shared/types';
import { Ficha, Icono } from '../ui/base.tsx';
import { useConfirmar } from '../ui/confirmar.tsx';
import { cn } from '../../lib/utils.ts';

const DIA = 86_400_000;
/** Cuánto historial muestra «Completados». */
const COMPLETADOS_MS = 30 * DIA;
/** Cuántos próximos se ven antes de «Ver todos». */
const VISIBLES = 5;

type Pestana = 'proximos' | 'completados';

/** «Lun 30 nov», o en minúscula para el medio de una frase. */
function fechaConDia(epoch: number, mayuscula = false): string {
  const s = new Date(epoch).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' });
  const limpio = s.replace(/\./g, '').replace(',', '').toLowerCase();
  return mayuscula ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : limpio;
}

/** Días de calendario entre hoy y una fecha (negativo si ya pasó). */
function diasHasta(epoch: number, ahora = Date.now()): number {
  const a = new Date(ahora); a.setHours(0, 0, 0, 0);
  const b = new Date(epoch); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DIA);
}

function textoDias(d: number): string {
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d < 0) return `hace ${-d} día${d === -1 ? '' : 's'}`;
  return `en ${d} días`;
}

export function TarjetaHabituales({ habituales, alVerMovimiento }: {
  /** Los de la economía que se está mirando, ya filtrados. */
  habituales: Recurring[];
  alVerMovimiento: (tx: Transaction) => void;
}) {
  const { transactions } = useStore();
  const [pestana, setPestana] = useState<Pestana>('proximos');

  const activos = useMemo(() => habituales.filter((r) => r.active), [habituales]);
  const porId = useMemo(() => new Map(habituales.map((r) => [r.id, r])), [habituales]);

  const completados = useMemo(() => {
    const ahora = Date.now();
    return transactions
      .filter((t) => t.recurringId && porId.has(t.recurringId) &&
        t.date <= ahora + DIA && t.date >= ahora - COMPLETADOS_MS)
      .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
  }, [transactions, porId]);

  const sinConfirmar = completados.some((t) => t.bankConfirmedAt === null);

  if (activos.length === 0 && completados.length === 0) return null;

  return (
    <section className="superficie borde border rounded-3xl px-2.5 pt-4 pb-2.5 shadow-[var(--shadow-tarjeta)]">
      <h2 className="t-seccion font-semibold txt px-2 mb-3">Pagos habituales</h2>

      {/* Pestañas de carpeta, mitad y mitad. La elegida se funde con el
          panel; la otra es un poco más baja y queda apoyada sobre su borde,
          detrás. */}
      <div role="tablist" className="flex items-end gap-1 relative z-[1] -mb-px">
        {([
          ['proximos', 'Próximos'],
          ['completados', 'Completados'],
        ] as const).map(([id, etiqueta]) => {
          const activa = pestana === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={activa}
              onClick={() => setPestana(id)}
              className={cn(
                'flex-1 rounded-t-2xl border t-fila transition-colors',
                activa
                  ? 'min-h-12 superficie-2 borde border-b-0 font-semibold txt'
                  : 'min-h-11 superficie borde font-medium txt-3',
              )}
            >
              {etiqueta}
              {id === 'completados' && sinConfirmar && (
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 ml-1.5 align-middle"
                  aria-label="hay pagos sin confirmar"
                />
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="superficie-2 borde border rounded-2xl rounded-t-none px-3 py-1">
        {pestana === 'proximos'
          ? <Proximos activos={activos} />
          : <Completados lista={completados} porId={porId} alVerMovimiento={alVerMovimiento} />}
      </div>
    </section>
  );
}

/** Una fila de Próximos: el que viene de un pago habitual, o uno pendiente. */
interface FilaProxima {
  r: Recurring;
  fecha: number;
  ciclo: 'pendiente' | 'proximo';
}

function Proximos({ activos }: { activos: Recurring[] }) {
  const { cobrarRecurrente, avisar, household, accounts, categoriaPorId } = useStore();
  const confirmar = useConfirmar();
  const moneda = household?.currency ?? 'USD';
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const filas = useMemo(() => {
    const out: FilaProxima[] = [];
    for (const r of activos) {
      // Uno desmarcado en Completados vuelve acá como pendiente, además del
      // que viene: son dos pagos distintos y los dos faltan.
      if (r.esperandoDesde !== null) out.push({ r, fecha: r.esperandoDesde, ciclo: 'pendiente' });
      out.push({ r, fecha: r.nextRun, ciclo: 'proximo' });
    }
    // Los pendientes arriba —ya se pasaron—, después por fecha.
    return out.sort((a, b) =>
      (a.ciclo === 'pendiente' ? 0 : 1) - (b.ciclo === 'pendiente' ? 0 : 1) || a.fecha - b.fecha);
  }, [activos]);

  const visibles = todos ? filas : filas.slice(0, VISIBLES);

  async function pagar({ r, ciclo, fecha }: FilaProxima) {
    const esIngreso = r.type === TxType.INGRESO;
    const cuenta = accounts.find((c) => c.id === r.accountId);
    const ok = await confirmar({
      titulo: esIngreso ? `¿Ya cobraste ${r.name}?` : `¿Ya pagaste ${r.name}?`,
      detalle: `El del ${fechaConDia(fecha)}. ${esIngreso ? 'Se suma' : 'Se resta'} ${formatMonto(r.amountMinor, moneda)} ${esIngreso ? 'a' : 'de'} ${cuenta?.name ?? 'la cuenta'} con fecha de hoy y pasa a Completados.`,
      confirmar: esIngreso ? 'Sí, ya cobré' : 'Sí, ya pagué',
    });
    if (ok !== true) return;
    const clave = `${r.id}:${ciclo}`;
    setOcupado(clave);
    try {
      await cobrarRecurrente(r.id, { ciclo });
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo registrar');
    } finally {
      setOcupado(null);
    }
  }

  if (filas.length === 0) {
    return <p className="t-nota txt-3 py-4 text-center">No hay pagos habituales activos.</p>;
  }

  return (
    <>
      <div className="divide-y divide-[var(--borde)]">
        {visibles.map((fila) => {
          const { r, fecha, ciclo } = fila;
          const cat = categoriaPorId(r.categoryId);
          const esIngreso = r.type === TxType.INGRESO;
          const pendiente = ciclo === 'pendiente';
          const d = diasHasta(fecha);

          return (
            <div key={`${r.id}:${ciclo}`} className="flex items-center gap-3 py-3">
              <Ficha color={cat?.color ?? '#8b5cf6'} icono={cat?.icon ?? 'repeat'} size={38} />
              <div className="flex-1 min-w-0">
                <p className="t-fila font-medium txt truncate">{r.name}</p>
                <p className={cn('t-nota truncate', pendiente ? 'text-amber-600 dark:text-amber-500' : 'txt-3')}>
                  {/* Solo la fecha: la cuenta se cortaba a la mitad dentro del
                      panel, y está en el detalle del pago. */}
                  {pendiente
                    ? `Pendiente · ${new Date(fecha).toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '')}`
                    : fechaConDia(fecha, true)}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className={cn(
                  't-fila font-semibold tabular',
                  esIngreso ? 'text-marca-600 dark:text-marca-500' : 'txt',
                )}>
                  {esIngreso ? '+' : ''}{formatMonto(r.amountMinor, moneda, { compacto: true })}
                </p>
                <p className={cn(
                  't-nota font-medium',
                  pendiente || d <= 3 ? 'text-amber-600 dark:text-amber-500' : 'txt-3',
                )}>
                  {textoDias(d)}
                </p>
              </div>

              <button
                onClick={() => void pagar(fila)}
                disabled={ocupado === `${r.id}:${ciclo}`}
                aria-label={`Marcar que ya ${esIngreso ? 'cobré' : 'pagué'} ${r.name}`}
                className="w-11 h-11 -mr-1.5 flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-90 transition-transform"
              >
                <span className={cn(
                  'w-6 h-6 rounded-full border-[1.5px]',
                  pendiente ? 'border-amber-500' : 'borde',
                )} />
              </button>
            </div>
          );
        })}
      </div>

      {filas.length > VISIBLES && (
        <button
          onClick={() => setTodos((v) => !v)}
          className="w-full min-h-11 border-t borde t-nota font-medium text-marca-700 dark:text-marca-500"
        >
          {todos ? 'Ver menos' : `Ver los ${filas.length} pagos`}
        </button>
      )}
    </>
  );
}

function Completados({ lista, porId, alVerMovimiento }: {
  lista: Transaction[];
  porId: Map<string, Recurring>;
  alVerMovimiento: (tx: Transaction) => void;
}) {
  const {
    confirmarPago, deshacerCobro, avisar, household, accounts, categoriaPorId, transactions,
  } = useStore();
  const confirmar = useConfirmar();
  const moneda = household?.currency ?? 'USD';

  /** El último pago de cada habitual: el único que se puede desmarcar. */
  const ultimos = useMemo(() => {
    const m = new Map<string, Transaction>();
    for (const t of transactions) {
      if (!t.recurringId) continue;
      const prev = m.get(t.recurringId);
      if (!prev || t.date > prev.date || (t.date === prev.date && t.createdAt > prev.createdAt)) {
        m.set(t.recurringId, t);
      }
    }
    return m;
  }, [transactions]);

  async function desmarcar(t: Transaction) {
    const r = t.recurringId ? porId.get(t.recurringId) : undefined;
    if (!r) return;
    if (ultimos.get(r.id)?.id !== t.id) {
      avisar(`Solo se puede desmarcar el último pago de ${r.name}. Uno anterior se borra desde Movimientos.`);
      return;
    }
    if (r.esperandoDesde !== null) {
      avisar(`${r.name} ya tiene un pago pendiente en Próximos. Registralo primero.`);
      return;
    }
    try {
      await deshacerCobro(r.id, t.id);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo desmarcar');
    }
  }

  async function tocar(t: Transaction) {
    const esIngreso = t.type === TxType.INGRESO;
    const cuenta = accounts.find((c) => c.id === t.accountId)?.name ?? 'la cuenta';
    const devuelve = `${esIngreso ? 'Se descuentan' : 'Se devuelven'} ${formatMonto(t.amountMinor, moneda)} ${esIngreso ? 'de' : 'a'} ${cuenta}.`;

    if (t.bankConfirmedAt === null) {
      // Lo registró la app sola: o está en el banco, o no se hizo.
      const r = await confirmar({
        titulo: `¿${t.description} está en el banco?`,
        detalle: `Si no se hizo, vuelve a Próximos como pendiente. ${devuelve}`,
        confirmar: 'Sí, está',
        alterna: 'No se hizo',
        cancelar: 'Cancelar',
      });
      if (r === true) await confirmarPago(t.id, true);
      else if (r === 'alterna') await desmarcar(t);
      return;
    }

    const ok = await confirmar({
      titulo: `¿Desmarcar ${t.description}?`,
      detalle: `Vuelve a Próximos como pendiente. ${devuelve}`,
      confirmar: 'Desmarcar',
      destructivo: true,
    });
    if (ok === true) await desmarcar(t);
  }

  if (lista.length === 0) {
    return <p className="t-nota txt-3 py-4 text-center">Nada en los últimos 30 días.</p>;
  }

  return (
    <>
      <div className="divide-y divide-[var(--borde)]">
        {lista.map((t) => {
          const cat = categoriaPorId(t.categoryId);
          const esIngreso = t.type === TxType.INGRESO;
          const ok = t.bankConfirmedAt !== null;
          return (
            <div key={t.id} className="flex items-center gap-3">
              {/* Tocar la fila abre el detalle del movimiento. */}
              <button
                onClick={() => alVerMovimiento(t)}
                className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left active:opacity-60"
              >
                <Ficha color={cat?.color ?? '#8b5cf6'} icono={cat?.icon ?? 'repeat'} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="t-fila font-medium txt truncate">{t.description}</p>
                  <p className={cn(
                    't-nota truncate',
                    ok ? 'text-marca-700 dark:text-marca-500' : 'text-amber-600 dark:text-amber-500',
                  )}>
                    {ok
                      ? `${esIngreso ? 'Cobrado' : 'Pagado'} el ${fechaConDia(t.date)}`
                      : `${fechaConDia(t.date, true)} · sin confirmar`}
                  </p>
                </div>
                <p className={cn(
                  't-fila font-semibold tabular shrink-0',
                  esIngreso ? 'text-marca-600 dark:text-marca-500' : 'txt',
                )}>
                  {esIngreso ? '+' : ''}{formatMonto(t.amountMinor, moneda, { compacto: true })}
                </p>
              </button>

              <button
                onClick={() => void tocar(t)}
                aria-label={ok ? `Desmarcar ${t.description}` : `Confirmar ${t.description} en el banco`}
                className="w-11 h-11 -mr-1.5 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
              >
                {ok ? (
                  <span className="w-6 h-6 rounded-full bg-marca-600 text-white flex items-center justify-center">
                    <Icono nombre="check" size={14} />
                  </span>
                ) : (
                  <span className="w-6 h-6 rounded-full border-[1.5px] border-amber-500 text-amber-600 dark:text-amber-500 flex items-center justify-center text-[13px] font-semibold">
                    ?
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <p className="border-t borde t-nota txt-3 text-center py-3">Últimos 30 días</p>
    </>
  );
}

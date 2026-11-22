/**
 * Pagos habituales en Inicio: dos pestañas de carpeta, «Próximos» y
 * «Completados».
 *
 * Antes era una sola lista con un check por fila que hacía dos cosas opuestas
 * según el estado, y ese doble sentido costó plata (DKE96): tocar el check de
 * Spotify para pagar noviembre deshacía el pago de octubre. Ahora cada pestaña
 * tiene una sola pregunta:
 *
 *   Próximos     → lo que viene y cuántos días faltan. El círculo es «ya lo
 *                  pagué», por adelantado.
 *   Completados  → lo que ya se registró (y ya se restó). El círculo es «lo vi
 *                  en el banco», que no mueve ningún saldo.
 *
 * El cobro se registra y se resta solo el día que toca: un saldo que muestra
 * plata que ya se fue es peor que uno que se adelanta un día.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../../store/store.tsx';
import { formatMonto } from '@shared/money';
import { TxType, type Recurring, type Transaction } from '@shared/types';
import { Ficha, Icono } from '../ui/base.tsx';
import { useConfirmar } from '../ui/confirmar.tsx';
import { cn } from '../../lib/utils.ts';

const DIA = 86_400_000;
/** Cuánto sigue un pago recién hecho en «Próximos» antes de dar paso al que viene. */
const RECIEN_MS = 2 * DIA;
/** Cuánto historial muestra «Completados». */
const COMPLETADOS_MS = 30 * DIA;
/** Cuántos próximos se ven antes de «Ver todos». */
const VISIBLES = 5;

type Pestana = 'proximos' | 'completados';

/** «Lun 30 nov». */
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
  const ids = useMemo(() => new Set(habituales.map((r) => r.id)), [habituales]);

  const completados = useMemo(() => {
    const ahora = Date.now();
    return transactions
      .filter((t) => t.recurringId && ids.has(t.recurringId) &&
        t.date <= ahora + DIA && t.date >= ahora - COMPLETADOS_MS)
      .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt);
  }, [transactions, ids]);

  const sinConfirmar = completados.some((t) => t.bankConfirmedAt === null);

  if (activos.length === 0 && completados.length === 0) return null;

  return (
    <section>
      <h2 className="t-seccion font-semibold txt px-1 mb-2.5">Pagos habituales</h2>

      {/* Pestañas de carpeta: mitad y mitad, la activa se funde con la
          tarjeta y la otra queda atrás. */}
      <div role="tablist" className="flex gap-1 relative z-[1] -mb-px">
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
                'flex-1 min-h-11 rounded-t-2xl border border-b-0 t-fila transition-colors',
                activa
                  ? 'superficie borde font-semibold txt'
                  : 'superficie-2 borde font-medium txt-3',
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

      <div
        role="tabpanel"
        className={cn(
          'superficie borde border rounded-3xl px-4 py-1 shadow-[var(--shadow-tarjeta)]',
          pestana === 'proximos' ? 'rounded-tl-none' : 'rounded-tr-none',
        )}
      >
        {pestana === 'proximos'
          ? <Proximos activos={activos} />
          : <Completados lista={completados} alVerMovimiento={alVerMovimiento} />}
      </div>
    </section>
  );
}

function Proximos({ activos }: { activos: Recurring[] }) {
  const { transactions, cobrarRecurrente, avisar, household, accounts, categoriaPorId } = useStore();
  const confirmar = useConfirmar();
  const moneda = household?.currency ?? 'USD';
  const [todos, setTodos] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const filas = useMemo(() => {
    const ahora = Date.now();
    return activos.map((r) => {
      // Un pago recién hecho se queda un par de días a la vista, con su
      // check, y después cede el lugar al que viene.
      const ultimo = transactions
        .filter((t) => t.recurringId === r.id)
        .reduce<Transaction | undefined>((m, t) => (!m || t.date > m.date ? t : m), undefined);
      const recien = r.esperandoDesde === null && ultimo && ahora - ultimo.date <= RECIEN_MS &&
        ultimo.date <= ahora + DIA ? ultimo : undefined;
      const fecha = r.esperandoDesde ?? r.nextRun;
      return { r, recien, fecha };
    }).sort((a, b) => {
      // Lo atrasado arriba, después lo recién pagado, después por fecha.
      const peso = (x: typeof a) => (x.r.esperandoDesde !== null ? 0 : x.recien ? 1 : 2);
      return peso(a) - peso(b) || a.fecha - b.fecha;
    });
  }, [activos, transactions]);

  const visibles = todos ? filas : filas.slice(0, VISIBLES);

  async function pagar(r: Recurring) {
    const esIngreso = r.type === TxType.INGRESO;
    const cuenta = accounts.find((c) => c.id === r.accountId);
    const ok = await confirmar({
      titulo: esIngreso ? `¿Ya cobraste ${r.name}?` : `¿Ya pagaste ${r.name}?`,
      detalle: `${esIngreso ? 'Se suma' : 'Se resta'} ${formatMonto(r.amountMinor, moneda)} ${esIngreso ? 'a' : 'de'} ${cuenta?.name ?? 'la cuenta'} con fecha de hoy.`,
      confirmar: esIngreso ? 'Sí, ya cobré' : 'Sí, ya pagué',
    });
    if (ok !== true) return;
    setOcupado(r.id);
    try {
      await cobrarRecurrente(r.id);
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
        {visibles.map(({ r, recien, fecha }) => {
          const cat = categoriaPorId(r.categoryId);
          const cuenta = accounts.find((c) => c.id === r.accountId);
          const esIngreso = r.type === TxType.INGRESO;
          const atrasado = r.esperandoDesde !== null;
          const d = diasHasta(fecha);

          return (
            <div key={r.id} className="flex items-center gap-3 py-3">
              <Ficha color={cat?.color ?? '#8b5cf6'} icono={cat?.icon ?? 'repeat'} size={38} />
              <div className="flex-1 min-w-0">
                <p className="t-fila font-medium txt truncate">{r.name}</p>
                <p className={cn(
                  't-nota truncate',
                  atrasado ? 'text-amber-600 dark:text-amber-500'
                    : recien ? 'text-marca-700 dark:text-marca-500' : 'txt-3',
                )}>
                  {atrasado
                    ? `Se esperaba el ${fechaConDia(fecha)} · sin ${esIngreso ? 'cobrar' : 'pagar'}`
                    : recien
                      ? `${esIngreso ? 'Cobrado' : 'Pagado'} el ${fechaConDia(recien.date)}`
                      : [fechaConDia(fecha, true), cuenta?.name].filter(Boolean).join(' · ')}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className={cn(
                  't-fila font-semibold tabular',
                  esIngreso ? 'text-marca-600 dark:text-marca-500' : 'txt',
                )}>
                  {esIngreso ? '+' : ''}{formatMonto(r.amountMinor, moneda, { compacto: true })}
                </p>
                {!atrasado && !recien && (
                  <p className={cn(
                    't-nota font-medium',
                    d <= 3 ? 'text-amber-600 dark:text-amber-500' : 'txt-3',
                  )}>
                    {textoDias(d)}
                  </p>
                )}
              </div>

              {recien ? (
                <span className="w-11 h-11 -mr-1.5 flex items-center justify-center shrink-0" aria-label="Ya registrado">
                  <span className="w-6 h-6 rounded-full bg-marca-600 text-white flex items-center justify-center">
                    <Icono nombre="check" size={14} />
                  </span>
                </span>
              ) : (
                <button
                  onClick={() => void pagar(r)}
                  disabled={ocupado === r.id}
                  aria-label={`Marcar que ya ${esIngreso ? 'cobré' : 'pagué'} ${r.name}`}
                  className="w-11 h-11 -mr-1.5 flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-90 transition-transform"
                >
                  <span className={cn(
                    'w-6 h-6 rounded-full border-[1.5px]',
                    atrasado ? 'border-amber-500' : 'borde',
                  )} />
                </button>
              )}
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

function Completados({ lista, alVerMovimiento }: {
  lista: Transaction[];
  alVerMovimiento: (tx: Transaction) => void;
}) {
  const { confirmarPago, household, categoriaPorId } = useStore();
  const moneda = household?.currency ?? 'USD';

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
              {/* Tocar la fila abre el detalle: si el pago no ocurrió de
                  verdad, ahí se borra. */}
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
                onClick={() => void confirmarPago(t.id, !ok)}
                aria-label={ok ? 'Marcar como no visto en el banco' : 'Confirmar que está en el banco'}
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

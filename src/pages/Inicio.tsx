/**
 * Pantalla principal.
 *
 * Responde de un vistazo lo que una pareja se pregunta todos los dias:
 * cuanto entro, cuanto salio, cuanto queda, y quien puso que.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { formatMonto } from '@shared/money';
import {
  balanceDePareja, calcularPatrimonio, claveMes, estadoPresupuestos,
  porCategoria, porPersona, resumir, transaccionesDelMes,
} from '@shared/domain';
import { TxType, type Transaction } from '@shared/types';
import { fechaCorta, moverMes, nombreMes } from '../lib/utils.ts';
import { Avatar, Barra, Boton, Ficha, Icono, Tarjeta, Vacio } from '../components/ui/base.tsx';
import { cn } from '../lib/utils.ts';

export function Inicio({ alEditar, alAgregar }: {
  alEditar: (tx: Transaction) => void;
  alAgregar: () => void;
}) {
  const { accounts, categories, transactions, budgets, members, me, household } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [mes, setMes] = useState(() => claveMes(Date.now()));

  const delMes = useMemo(() => transaccionesDelMes(transactions, mes), [transactions, mes]);
  const resumen = useMemo(() => resumir(delMes), [delMes]);
  const patrimonio = useMemo(() => calcularPatrimonio(accounts), [accounts]);
  const porPers = useMemo(() => porPersona(delMes, members), [delMes, members]);
  const balance = useMemo(() => balanceDePareja(delMes, accounts, members), [delMes, accounts, members]);
  const gastoPorCat = useMemo(() => porCategoria(delMes, categories, 'gasto').slice(0, 5), [delMes, categories]);
  const presupuestos = useMemo(() => estadoPresupuestos(budgets, transactions, mes), [budgets, transactions, mes]);
  const ultimos = useMemo(() => transactions.slice(0, 6), [transactions]);

  const esMesActual = mes === claveMes(Date.now());

  return (
    <div className="space-y-4">
      {/* Selector de mes */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMes(moverMes(mes, -1))}
          aria-label="Mes anterior"
          className="w-10 h-10 rounded-xl superficie-2 flex items-center justify-center txt-2"
        >
          <Icono nombre="chevron-left" size={19} />
        </button>
        <h1 className="font-semibold txt capitalize">{nombreMes(mes)}</h1>
        <button
          onClick={() => setMes(moverMes(mes, 1))}
          disabled={esMesActual}
          aria-label="Mes siguiente"
          className="w-10 h-10 rounded-xl superficie-2 flex items-center justify-center txt-2 disabled:opacity-30"
        >
          <Icono nombre="chevron-right" size={19} />
        </button>
      </div>

      {/* Resumen del mes */}
      <Tarjeta className="bg-linear-to-br from-marca-600 to-marca-700 border-transparent text-white">
        <p className="text-sm opacity-80 mb-1">Balance del mes</p>
        <p className="text-4xl font-bold tabular mb-5">
          {formatMonto(resumen.flujoMinor, moneda)}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/15 rounded-2xl p-3">
            <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1">
              <Icono nombre="arrow-up-right" size={13} /> Entro
            </div>
            <p className="font-semibold tabular">{formatMonto(resumen.ingresoMinor, moneda)}</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-3">
            <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1">
              <Icono nombre="arrow-down-left" size={13} /> Salio
            </div>
            <p className="font-semibold tabular">{formatMonto(resumen.gastoMinor, moneda)}</p>
          </div>
        </div>
      </Tarjeta>

      {/* Patrimonio */}
      <Tarjeta className="flex items-center justify-between">
        <div>
          <p className="text-xs txt-2 mb-0.5">Patrimonio total</p>
          <p className="text-2xl font-semibold tabular txt">{formatMonto(patrimonio, moneda)}</p>
        </div>
        <Ficha color="#10b981" icono="landmark" size={44} />
      </Tarjeta>

      {/* Quien puso cuanto */}
      {members.length > 1 && resumen.gastoMinor > 0 && (
        <Tarjeta>
          <h2 className="font-semibold txt mb-3.5">Quien gasto</h2>
          <div className="space-y-3">
            {porPers.map(({ member, resumen: r }) => {
              const pct = resumen.gastoMinor > 0 ? r.gastoMinor / resumen.gastoMinor : 0;
              return (
                <div key={member.id} className="flex items-center gap-3">
                  <Avatar nombre={member.displayName} color={member.color} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-sm font-medium txt truncate">
                        {member.displayName}
                        {member.id === me?.id && <span className="txt-3 font-normal"> (vos)</span>}
                      </span>
                      <span className="text-sm font-semibold tabular txt shrink-0 ml-2">
                        {formatMonto(r.gastoMinor, moneda)}
                      </span>
                    </div>
                    <Barra ratio={pct} color={member.color} />
                  </div>
                </div>
              );
            })}
          </div>

          {balance && (
            <div className="mt-4 pt-4 borde border-t flex items-center gap-2.5">
              <Icono nombre="arrow-left-right" size={16} className="txt-3 shrink-0" />
              <p className="text-sm txt-2">
                <span className="font-medium txt">{balance.deudor.displayName}</span> le debe{' '}
                <span className="font-semibold txt tabular">{formatMonto(balance.montoMinor, moneda)}</span> a{' '}
                <span className="font-medium txt">{balance.acreedor.displayName}</span> para emparejar
              </p>
            </div>
          )}
        </Tarjeta>
      )}

      {/* Presupuestos */}
      {presupuestos.length > 0 && (
        <Tarjeta>
          <h2 className="font-semibold txt mb-3.5">Presupuestos</h2>
          <div className="space-y-3.5">
            {presupuestos.map(({ budget, gastadoMinor, ratio }) => {
              const cat = categories.find((c) => c.id === budget.categoryId);
              return (
                <div key={budget.id}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-medium txt">{cat?.name ?? 'Todo el mes'}</span>
                    <span className={cn('text-xs tabular', ratio > 1 ? 'text-red-500 font-semibold' : 'txt-2')}>
                      {formatMonto(gastadoMinor, moneda, { compacto: true })} / {formatMonto(budget.amountMinor, moneda, { compacto: true })}
                    </span>
                  </div>
                  <Barra ratio={ratio} color={cat?.color ?? '#10b981'} />
                </div>
              );
            })}
          </div>
        </Tarjeta>
      )}

      {/* En que se fue */}
      {gastoPorCat.length > 0 && (
        <Tarjeta>
          <h2 className="font-semibold txt mb-3.5">En que se fue</h2>
          <div className="space-y-3">
            {gastoPorCat.map(({ category, totalMinor }) => (
              <div key={category?.id ?? 'sin'} className="flex items-center gap-3">
                <Ficha
                  color={category?.color ?? '#64748b'}
                  icono={category?.icon ?? 'circle-help'}
                  size={36}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-medium txt truncate">{category?.name ?? 'Sin categoria'}</span>
                    <span className="text-sm tabular txt shrink-0 ml-2">
                      {formatMonto(totalMinor, moneda)}
                    </span>
                  </div>
                  <Barra
                    ratio={resumen.gastoMinor > 0 ? totalMinor / resumen.gastoMinor : 0}
                    color={category?.color ?? '#64748b'}
                  />
                </div>
              </div>
            ))}
          </div>
        </Tarjeta>
      )}

      {/* Ultimos movimientos */}
      <Tarjeta>
        <h2 className="font-semibold txt mb-1">Ultimos movimientos</h2>
        {ultimos.length === 0 ? (
          <Vacio
            icono="receipt-text"
            titulo="Todavia no hay nada"
            texto="Registra tu primer movimiento y va a aparecer aca, tambien en el telefono de tu pareja."
            accion={<Boton onClick={alAgregar}>Registrar el primero</Boton>}
          />
        ) : (
          <div className="divide-y divide-[var(--borde)] -mx-1">
            {ultimos.map((tx) => (
              <FilaMovimiento key={tx.id} tx={tx} alTocar={() => alEditar(tx)} />
            ))}
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

/** Una fila de la lista de movimientos. Se reusa en varias pantallas. */
export function FilaMovimiento({ tx, alTocar }: { tx: Transaction; alTocar: () => void }) {
  const { categories, accounts, members, household, enVuelo } = useStore();
  const moneda = household?.currency ?? 'USD';

  const cat = categories.find((c) => c.id === tx.categoryId);
  const cuenta = accounts.find((c) => c.id === tx.accountId);
  const quien = members.find((m) => m.id === tx.createdBy);
  const subiendo = enVuelo.has(tx.id);

  const esIngreso = tx.type === TxType.INGRESO;
  const esTransferencia = tx.type === TxType.TRANSFERENCIA;

  const color = esTransferencia ? '#3b82f6' : esIngreso ? '#10b981' : (cat?.color ?? '#64748b');
  const icono = esTransferencia ? 'arrow-left-right' : (cat?.icon ?? (esIngreso ? 'arrow-up-right' : 'arrow-down-left'));

  return (
    <button
      onClick={alTocar}
      className={cn(
        'w-full flex items-center gap-3 py-3 px-1 text-left transition-opacity active:opacity-60',
        subiendo && 'opacity-50',
      )}
    >
      <Ficha color={color} icono={icono} size={40} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium txt truncate">{tx.description}</p>
        <p className="text-xs txt-3 truncate">
          {fechaCorta(tx.date)}
          {cuenta && ` · ${cuenta.name}`}
          {quien && ` · ${quien.displayName}`}
        </p>
      </div>

      <div className="text-right shrink-0">
        <p className={cn(
          'text-sm font-semibold tabular',
          esIngreso ? 'text-marca-600 dark:text-marca-500' : esTransferencia ? 'txt-2' : 'txt',
        )}>
          {esTransferencia ? '' : esIngreso ? '+' : '-'}
          {formatMonto(tx.amountMinor, moneda)}
        </p>
        {quien && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full mt-1"
            style={{ background: quien.color }}
            title={quien.displayName}
          />
        )}
      </div>
    </button>
  );
}

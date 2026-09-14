/**
 * Pantalla principal.
 *
 * Las secciones se dibujan en el orden que cada persona eligio en Ajustes, y
 * las que saco no se dibujan. El orden vive en el perfil (member.homeLayout),
 * asi que viaja con la cuenta y no con el telefono.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { formatMonto } from '@shared/money';
import {
  autorDe, calcularPatrimonio, claveMes, estadoPresupuestos,
  porCategoria, porPersona, resumir, transaccionesDelMes,
} from '@shared/domain';
import { SECCIONES_INICIO, TxType, type SeccionInicio, type Transaction } from '@shared/types';
import { describirRegla } from '@shared/recurrencia';
import { fechaCorta, moverMes, nombreMes } from '../lib/utils.ts';
import { Avatar, Barra, Boton, Ficha, Icono, Tarjeta, Vacio } from '../components/ui/base.tsx';
import { EtiquetaEntidad, SelectorEntidad } from '../components/ui/entidad.tsx';
import { cn } from '../lib/utils.ts';

export function Inicio({ alVerMovimiento, alAgregar }: {
  alVerMovimiento: (tx: Transaction) => void;
  alAgregar: () => void;
}) {
  const {
    accounts, categories, transactions, budgets, members, me, household, recurring,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [mes, setMes] = useState(() => claveMes(Date.now()));

  const delMes = useMemo(() => transaccionesDelMes(transactions, mes), [transactions, mes]);
  const resumen = useMemo(() => resumir(delMes), [delMes]);
  const patrimonio = useMemo(() => calcularPatrimonio(accounts), [accounts]);
  const porPers = useMemo(() => porPersona(delMes, members), [delMes, members]);
  const gastoPorCat = useMemo(() => porCategoria(delMes, categories, 'gasto').slice(0, 5), [delMes, categories]);
  const presupuestos = useMemo(() => estadoPresupuestos(budgets, transactions, mes), [budgets, transactions, mes]);
  const ultimos = useMemo(() => transactions.slice(0, 6), [transactions]);
  const proximos = useMemo(
    () => recurring.filter((r) => r.active).slice(0, 4), [recurring],
  );

  const esMesActual = mes === claveMes(Date.now());

  // El orden guardado manda; si esta vacio, el de fabrica. Las secciones que
  // la persona saco simplemente no estan en la lista.
  const orden: SeccionInicio[] = me?.homeLayout?.length ? me.homeLayout : [...SECCIONES_INICIO];

  const secciones: Record<SeccionInicio, React.ReactNode> = {
    'resumen': (
      <Tarjeta className="bg-linear-to-br from-marca-600 to-marca-700 border-transparent text-white">
        <p className="text-sm opacity-80 mb-1">Balance del mes</p>
        <p className="text-4xl font-bold tabular tracking-tight mb-5">{formatMonto(resumen.flujoMinor, moneda)}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/15 rounded-2xl p-3">
            <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1">
              <Icono nombre="arrow-up-right" size={13} /> Entró
            </div>
            <p className="font-semibold tabular">{formatMonto(resumen.ingresoMinor, moneda)}</p>
          </div>
          <div className="bg-white/15 rounded-2xl p-3">
            <div className="flex items-center gap-1.5 text-xs opacity-80 mb-1">
              <Icono nombre="arrow-down-left" size={13} /> Salió
            </div>
            <p className="font-semibold tabular">{formatMonto(resumen.gastoMinor, moneda)}</p>
          </div>
        </div>
      </Tarjeta>
    ),

    'patrimonio': (
      <Tarjeta className="flex items-center justify-between">
        <div>
          <p className="text-xs txt-2 mb-0.5">Patrimonio total</p>
          <p className="text-2xl font-semibold tabular tracking-tight txt">{formatMonto(patrimonio, moneda)}</p>
        </div>
        <Ficha color="#10b981" icono="landmark" size={44} />
      </Tarjeta>
    ),

    'quien-gasto': members.length > 1 && resumen.gastoMinor > 0 ? (
      <Tarjeta>
        <h2 className="font-semibold txt mb-3.5">Quién gastó</h2>
        <div className="space-y-3">
          {porPers.map(({ member, resumen: r }) => (
            <div key={member.id} className="flex items-center gap-3">
              <Avatar nombre={member.displayName} color={member.color} emoji={member.emoji} size={36} />
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
                <Barra
                  ratio={resumen.gastoMinor > 0 ? r.gastoMinor / resumen.gastoMinor : 0}
                  color={member.color}
                />
              </div>
            </div>
          ))}
        </div>
      </Tarjeta>
    ) : null,

    'presupuestos': presupuestos.length > 0 ? (
      <Tarjeta>
        <h2 className="font-semibold txt mb-3.5">Presupuestos</h2>
        <div className="space-y-3.5">
          {presupuestos.map(({ budget, gastadoMinor, ratio }) => {
            const cat = categories.find((c) => c.id === budget.categoryId);
            return (
              <div key={budget.id}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm font-medium txt">{cat?.name ?? 'Todo el mes'}</span>
                  <span className={cn(
                    'text-xs tabular',
                    ratio > 1 ? 'text-red-500 font-semibold' : ratio > 0.8 ? 'text-amber-500' : 'txt-2',
                  )}>
                    {formatMonto(gastadoMinor, moneda, { compacto: true })} / {formatMonto(budget.amountMinor, moneda, { compacto: true })}
                  </span>
                </div>
                <Barra ratio={ratio} color={cat?.color ?? '#10b981'} alerta />
              </div>
            );
          })}
        </div>
      </Tarjeta>
    ) : null,

    'por-categoria': gastoPorCat.length > 0 ? (
      <Tarjeta>
        <h2 className="font-semibold txt mb-3.5">En qué se fue</h2>
        <div className="space-y-3">
          {gastoPorCat.map(({ category, totalMinor }) => (
            <div key={category?.id ?? 'sin'} className="flex items-center gap-3">
              <Ficha color={category?.color ?? '#64748b'} icono={category?.icon ?? 'circle-help'} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-sm font-medium txt truncate">{category?.name ?? 'Sin categoría'}</span>
                  <span className="text-sm tabular txt shrink-0 ml-2">{formatMonto(totalMinor, moneda)}</span>
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
    ) : null,

    'pagos-habituales': proximos.length > 0 ? (
      <Tarjeta className="py-3">
        <p className="text-xs font-medium txt-3 px-1 mb-1">Pagos habituales</p>
        <div className="divide-y divide-[var(--borde)] -mx-1">
          {proximos.map((r) => {
            const cat = categories.find((c) => c.id === r.categoryId);
            const dias = Math.ceil((r.nextRun - Date.now()) / 86_400_000);
            return (
              <div key={r.id} className="flex items-center gap-3 py-3 px-1">
                <Ficha color={cat?.color ?? '#8b5cf6'} icono={cat?.icon ?? 'repeat'} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium txt truncate">{r.name}</p>
                  <p className="text-xs txt-3 truncate">
                    {describirRegla({
                      frecuencia: r.frequency,
                      diaDelMes: r.dayOfMonth ?? undefined,
                      diaDeSemana: r.dayOfWeek ?? undefined,
                      mesDelAnio: r.monthOfYear ?? undefined,
                    })}
                    {dias >= 0 && dias <= 7 && ` · en ${dias === 0 ? 'hoy' : `${dias} día${dias > 1 ? 's' : ''}`}`}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular txt shrink-0">
                  {formatMonto(r.amountMinor, moneda)}
                </p>
              </div>
            );
          })}
        </div>
      </Tarjeta>
    ) : null,

    'ultimos': (
      <Tarjeta>
        <h2 className="font-semibold txt mb-1">Últimos movimientos</h2>
        {ultimos.length === 0 ? (
          <Vacio
            icono="receipt-text"
            titulo="Todavía no hay nada"
            texto="Registrá tu primer movimiento y va a aparecer acá, también en el teléfono de tu pareja."
            accion={<Boton onClick={alAgregar}>Registrar el primero</Boton>}
          />
        ) : (
          <div className="divide-y divide-[var(--borde)] -mx-1">
            {ultimos.map((tx) => (
              <FilaMovimiento key={tx.id} tx={tx} alTocar={() => alVerMovimiento(tx)} />
            ))}
          </div>
        )}
      </Tarjeta>
    ),
  };

  return (
    <div className="space-y-4">
      <SelectorEntidad />
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMes(moverMes(mes, -1))}
          aria-label="Mes anterior"
          className="w-10 h-10 rounded-xl superficie-2 flex items-center justify-center txt-2"
        >
          <Icono nombre="chevron-left" size={19} />
        </button>
        <h1 className="font-semibold txt tracking-tight">{nombreMes(mes)}</h1>
        <button
          onClick={() => setMes(moverMes(mes, 1))}
          disabled={esMesActual}
          aria-label="Mes siguiente"
          className="w-10 h-10 rounded-xl superficie-2 flex items-center justify-center txt-2 disabled:opacity-30"
        >
          <Icono nombre="chevron-right" size={19} />
        </button>
      </div>

      {orden.map((id) => secciones[id] && <div key={id}>{secciones[id]}</div>)}
    </div>
  );
}

/** Una fila de la lista de movimientos. Se reusa en varias pantallas. */
export function FilaMovimiento({ tx, alTocar }: { tx: Transaction; alTocar: () => void }) {
  const {
    categories, accounts, members, household, enVuelo, entities, entidadActiva,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  const cat = categories.find((c) => c.id === tx.categoryId);
  // En el consolidado cada movimiento dice de quien es. Dentro de una entidad
  // la etiqueta seria ruido: ya lo dice el selector de arriba.
  const entidad = entidadActiva === null && entities.length > 1
    ? entities.find((e) => e.id === (tx.entityId ?? cat?.entityId ?? null))
    : undefined;
  const cuenta = accounts.find((c) => c.id === tx.accountId);
  const quien = members.find((m) => m.id === autorDe(tx));
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
        <p className="text-sm font-medium txt truncate">
          {tx.description}
          {tx.recurringId && (
            <Icono nombre="repeat" size={11} className="inline-block ml-1.5 txt-3 align-middle" />
          )}
        </p>
        {entidad && (
          <span className="inline-block mt-0.5"><EtiquetaEntidad entidad={entidad} /></span>
        )}
        <p className="text-xs txt-3 truncate">
          {fechaCorta(tx.date)}
          {cuenta && ` · ${cuenta.name}`}
          {quien && ` · ${quien.displayName}`}
        </p>
      </div>

      <div className="text-right shrink-0 flex items-center gap-2">
        <p className={cn(
          'text-sm font-semibold tabular',
          esIngreso ? 'text-marca-600 dark:text-marca-500' : esTransferencia ? 'txt-2' : 'txt',
        )}>
          {esTransferencia ? '' : esIngreso ? '+' : '−'}
          {formatMonto(tx.amountMinor, moneda)}
        </p>
        {quien && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: quien.color }}
            title={quien.displayName}
          />
        )}
      </div>
    </button>
  );
}

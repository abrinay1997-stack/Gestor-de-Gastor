/**
 * Jarras (metodo de los 6 frascos).
 *
 * Se conserva del repo original porque es una decision del hogar sobre como
 * repartir la plata, no un detalle tecnico. Lo que cambia es la aritmetica:
 * los porcentajes van en puntos base y el reparto usa el metodo del mayor
 * resto, asi la suma de las jarras siempre da exactamente el ingreso.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { formatBp, formatMonto } from '@shared/money';
import { imputacionJarras, validarJarras } from '@shared/domain';
import type { Jar, Transaction } from '@shared/types';
import { FilaMovimiento } from './Inicio.tsx';
import { Boton, Ficha, Hoja, Icono, Tarjeta, Vacio } from '../components/ui/base.tsx';
import { cn } from '../lib/utils.ts';

const COLORES = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#f43f5e', '#06b6d4', '#64748b'];

export function Jarras({ alVerMovimiento }: { alVerMovimiento: (tx: Transaction) => void }) {
  const { jars, household, guardarJarras, avisar } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [editando, setEditando] = useState(false);
  const [abierta, setAbierta] = useState<Jar | null>(null);

  const total = useMemo(() => jars.reduce((s, j) => s + j.balanceMinor, 0), [jars]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold txt">Jarras</h1>
        {jars.length > 0 && (
          <Boton variante="secundario" onClick={() => setEditando(true)} className="px-3">
            <Icono nombre="settings-2" size={16} /> Ajustar
          </Boton>
        )}
      </div>

      {jars.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono="piggy-bank"
            titulo="Sin jarras"
            texto="Repartí cada ingreso en frascos con un propósito: necesidades, ahorro, diversión. Te da control sin llevar la cuenta a mano."
            accion={<Boton onClick={() => setEditando(true)}>Crear jarras</Boton>}
          />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta>
            <p className="text-xs txt-2 mb-1">Total repartido</p>
            <p className="text-3xl font-bold tabular txt">{formatMonto(total, moneda)}</p>
          </Tarjeta>

          <div className="space-y-2.5">
            {jars.map((j) => {
              const proporcion = total > 0 ? j.balanceMinor / total : 0;
              const enRojo = j.balanceMinor < 0;

              return (
                <Tarjeta key={j.id} className="p-4 active:opacity-70 transition-opacity cursor-pointer"
                  onClick={() => setAbierta(j)}>
                  <div className="flex items-center gap-3 mb-3">
                    <Ficha color={j.color} icono={j.icon} size={42} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium txt truncate">{j.name}</p>
                      <p className="text-xs txt-3">{formatBp(j.percentageBp)} de cada ingreso</p>
                    </div>
                    <p className={cn(
                      'font-semibold tabular shrink-0',
                      enRojo ? 'text-red-500' : 'txt',
                    )}>
                      {formatMonto(j.balanceMinor, moneda)}
                    </p>
                    <Icono nombre="chevron-right" size={16} className="txt-3 shrink-0 -mr-1" />
                  </div>

                  <div className="h-1.5 rounded-full superficie-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(Math.max(proporcion, 0), 1) * 100}%`,
                        background: enRojo ? '#ef4444' : j.color,
                      }}
                    />
                  </div>

                  {enRojo && (
                    <p className="text-xs text-red-500 mt-2">
                      Gastaste más de lo que esta jarra tenía.
                    </p>
                  )}
                </Tarjeta>
              );
            })}
          </div>

          <p className="text-xs txt-3 text-center px-4 leading-relaxed">
            Al registrar un ingreso, marcá "Repartir entre las jarras" y el
            monto se divide según estos porcentajes, al centavo.
          </p>
        </>
      )}

      <MovimientosDeJarra
        jarra={abierta}
        alCerrar={() => setAbierta(null)}
        alVerMovimiento={(tx) => { setAbierta(null); alVerMovimiento(tx); }}
      />

      <EditorJarras
        abierta={editando}
        alCerrar={() => setEditando(false)}
        jarras={jars}
        alGuardar={async (nuevas) => {
          try {
            await guardarJarras(nuevas);
            setEditando(false);
          } catch (e) {
            avisar(e instanceof Error ? e.message : 'No se pudo guardar');
          }
        }}
      />
    </div>
  );
}

/**
 * Movimientos que tocaron una jarra.
 *
 * No alcanza con filtrar por jar_id: un ingreso repartido no apunta a ninguna
 * jarra en particular, pero le entro plata a todas. Se usa la misma funcion de
 * imputacion que calcula los saldos, asi lo que se lista y lo que suma el
 * saldo son siempre lo mismo.
 */
function MovimientosDeJarra({ jarra, alCerrar, alVerMovimiento }: {
  jarra: Jar | null;
  alCerrar: () => void;
  alVerMovimiento: (tx: Transaction) => void;
}) {
  const { transactions, jars, household } = useStore();
  const moneda = household?.currency ?? 'USD';

  const movimientos = useMemo(() => {
    if (!jarra) return [];
    return transactions
      .map((tx) => ({ tx, delta: imputacionJarras(tx, jars).get(jarra.id) ?? 0 }))
      .filter((x) => x.delta !== 0);
  }, [jarra, transactions, jars]);

  if (!jarra) return null;

  const entro = movimientos.filter((m) => m.delta > 0).reduce((a, m) => a + m.delta, 0);
  const salio = movimientos.filter((m) => m.delta < 0).reduce((a, m) => a - m.delta, 0);

  return (
    <Hoja abierta alCerrar={alCerrar} titulo={jarra.name}>
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center pt-1">
          <Ficha color={jarra.color} icono={jarra.icon} size={52} />
          <p className={cn(
            'text-3xl font-bold tabular mt-3',
            jarra.balanceMinor < 0 ? 'text-red-500' : 'txt',
          )}>
            {formatMonto(jarra.balanceMinor, moneda)}
          </p>
          <p className="text-xs txt-3 mt-1">{formatBp(jarra.percentageBp)} de cada ingreso</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="superficie-2 rounded-2xl p-3 text-center">
            <p className="text-[10px] txt-3 mb-0.5">Entró</p>
            <p className="text-sm font-semibold tabular text-marca-600 dark:text-marca-500">
              {formatMonto(entro, moneda)}
            </p>
          </div>
          <div className="superficie-2 rounded-2xl p-3 text-center">
            <p className="text-[10px] txt-3 mb-0.5">Salió</p>
            <p className="text-sm font-semibold tabular text-red-500">
              {formatMonto(salio, moneda)}
            </p>
          </div>
        </div>

        {movimientos.length === 0 ? (
          <Vacio
            icono="receipt-text"
            titulo="Sin movimientos"
            texto="Esta jarra todavía no recibió ni gastó nada. Repartí un ingreso o imputale un gasto."
          />
        ) : (
          <div>
            <p className="text-xs font-medium txt-3 px-1 mb-1">
              {movimientos.length} movimiento{movimientos.length > 1 ? 's' : ''}
            </p>
            <div className="divide-y divide-[var(--borde)]">
              {movimientos.map(({ tx, delta }) => (
                <div key={tx.id} className="relative">
                  <FilaMovimiento tx={tx} alTocar={() => alVerMovimiento(tx)} />
                  {/* Lo que entro o salio DE ESTA JARRA, que en un ingreso
                      repartido no es el monto total del movimiento. */}
                  <span className={cn(
                    'absolute right-1 bottom-2 text-[10px] tabular font-medium',
                    delta > 0 ? 'text-marca-600 dark:text-marca-500' : 'text-red-500',
                  )}>
                    {delta > 0 ? '+' : '−'}{formatMonto(Math.abs(delta), moneda, { compacto: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Hoja>
  );
}

interface Borrador {
  id?: string;
  name: string;
  percentageBp: number;
  color: string;
  icon: string;
}

function EditorJarras({ abierta, alCerrar, jarras, alGuardar }: {
  abierta: boolean;
  alCerrar: () => void;
  jarras: Jar[];
  alGuardar: (jars: Borrador[]) => Promise<void>;
}) {
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    setBorradores(
      jarras.length > 0
        ? jarras.map((j) => ({
          id: j.id, name: j.name, percentageBp: j.percentageBp, color: j.color, icon: j.icon,
        }))
        : [
          { name: 'Necesidades', percentageBp: 5500, color: '#3b82f6', icon: 'house' },
          { name: 'Ahorro', percentageBp: 1000, color: '#10b981', icon: 'piggy-bank' },
          { name: 'Educacion', percentageBp: 1000, color: '#8b5cf6', icon: 'graduation-cap' },
          { name: 'Diversion', percentageBp: 1000, color: '#ec4899', icon: 'party-popper' },
          { name: 'Libertad financiera', percentageBp: 1000, color: '#f59e0b', icon: 'trending-up' },
          { name: 'Donaciones', percentageBp: 500, color: '#f43f5e', icon: 'heart-handshake' },
        ],
    );
  }, [abierta, jarras]);

  const sumaBp = borradores.reduce((s, b) => s + b.percentageBp, 0);
  const { ok } = validarJarras(
    borradores.map((b) => ({ ...b, percentageBp: b.percentageBp } as Jar)),
  );

  const cambiar = (i: number, campo: keyof Borrador, valor: string | number) => {
    setBorradores((prev) => prev.map((b, k) => (k === i ? { ...b, [campo]: valor } : b)));
  };

  /**
   * Reparte lo que falta o sobra para llegar a 100% entre todas las jarras,
   * proporcionalmente. Evita la pelea de ajustar porcentajes a mano hasta que
   * el numero cierre.
   */
  const emparejar = () => {
    if (borradores.length === 0) return;
    const objetivo = 10_000;
    const actual = sumaBp || 1;

    let acumulado = 0;
    const ajustadas = borradores.map((b, i) => {
      if (i === borradores.length - 1) {
        // La ultima se lleva exactamente lo que falta: la suma cierra siempre.
        return { ...b, percentageBp: objetivo - acumulado };
      }
      const nuevo = Math.round((b.percentageBp / actual) * objetivo);
      acumulado += nuevo;
      return { ...b, percentageBp: nuevo };
    });

    setBorradores(ajustadas);
  };

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Ajustar jarras">
      <div className="space-y-3">
        <div className={cn(
          'rounded-2xl p-3.5 text-sm flex items-center gap-2.5',
          ok ? 'bg-marca-50 text-marca-700 dark:bg-marca-500/10 dark:text-marca-500' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-500',
        )}>
          <Icono nombre={ok ? 'circle-check' : 'triangle-alert'} size={17} />
          <span className="flex-1">
            Suman {(sumaBp / 100).toFixed(2)}%
            {!ok && ' · tienen que sumar 100%'}
          </span>
          {!ok && (
            <button onClick={emparejar} className="font-medium underline shrink-0">
              Emparejar
            </button>
          )}
        </div>

        {borradores.map((b, i) => (
          <div key={b.id ?? `nueva-${i}`} className="superficie-2 rounded-2xl p-3 space-y-3">
            <div className="flex items-center gap-2.5">
              <Ficha color={b.color} icono={b.icon} size={38} />
              <input
                value={b.name}
                onChange={(e) => cambiar(i, 'name', e.target.value)}
                placeholder="Nombre"
                className="flex-1 min-w-0 min-h-10 px-3 rounded-xl superficie borde border txt text-base outline-none focus:border-marca-500"
              />
              <button
                onClick={() => setBorradores((p) => p.filter((_, k) => k !== i))}
                aria-label={`Quitar ${b.name}`}
                className="w-10 h-10 rounded-xl flex items-center justify-center txt-3 shrink-0"
              >
                <Icono nombre="trash-2" size={17} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={10000}
                step={50}
                value={b.percentageBp}
                onChange={(e) => cambiar(i, 'percentageBp', Number(e.target.value))}
                className="flex-1 accent-marca-600"
                aria-label={`Porcentaje de ${b.name}`}
              />
              <span className="text-sm font-semibold tabular txt w-16 text-right shrink-0">
                {formatBp(b.percentageBp)}
              </span>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {COLORES.map((c) => (
                <button
                  key={c}
                  onClick={() => cambiar(i, 'color', c)}
                  aria-label={`Color ${c}`}
                  className="w-7 h-7 rounded-lg transition-transform active:scale-90"
                  style={{ background: c, outline: b.color === c ? '2px solid currentColor' : 'none' }}
                />
              ))}
            </div>
          </div>
        ))}

        <Boton
          variante="secundario"
          onClick={() => setBorradores((p) => [...p, {
            name: 'Nueva jarra', percentageBp: 0, color: COLORES[p.length % COLORES.length], icon: 'piggy-bank',
          }])}
          className="w-full"
        >
          <Icono nombre="plus" size={17} /> Agregar jarra
        </Boton>

        <div className="flex gap-2 pt-1">
          <Boton variante="secundario" onClick={alCerrar} className="flex-1">Cancelar</Boton>
          <Boton
            onClick={async () => {
              setGuardando(true);
              await alGuardar(borradores.filter((b) => b.name.trim() !== ''));
              setGuardando(false);
            }}
            disabled={!ok || guardando}
            className="flex-1 min-h-12"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </Boton>
        </div>

        {!ok && (
          <p className="text-xs txt-3 text-center">
            Los porcentajes deben sumar 100% para poder repartir un ingreso.
          </p>
        )}
      </div>
    </Hoja>
  );
}

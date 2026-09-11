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
import { validarJarras } from '@shared/domain';
import type { Jar } from '@shared/types';
import { Boton, Ficha, Hoja, Icono, Tarjeta, Vacio } from '../components/ui/base.tsx';
import { cn } from '../lib/utils.ts';

const COLORES = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#f43f5e', '#06b6d4', '#64748b'];

export function Jarras() {
  const { jars, household, guardarJarras, avisar } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [editando, setEditando] = useState(false);

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
                <Tarjeta key={j.id} className="p-4">
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

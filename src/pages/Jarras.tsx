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
import { formatBp, formatMonto, montoPlano, parseMonto } from '@shared/money';
import { flujoDeJarras, sinAsignar, validarJarras } from '@shared/domain';
import { describirPeriodo, periodoMes, type Periodo } from '@shared/periodo';
import type { Jar, Transaction } from '@shared/types';
import { FilaMovimiento } from './Inicio.tsx';
import {
  Barra, Boton, Campo, Ficha, Hoja, Icono, Selector, Tarjeta, Vacio,
} from '../components/ui/base.tsx';
import { SelectorPeriodo } from '../components/ui/periodo.tsx';
import { cn } from '../lib/utils.ts';


const COLORES = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#f59e0b', '#f43f5e', '#06b6d4', '#64748b'];

export function Jarras({ alVerMovimiento }: { alVerMovimiento: (tx: Transaction) => void }) {
  const {
    jars, accounts, imputaciones, jarTransfers, transactions, household,
    guardarJarras, ponerJarrasAlDia, avisar,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [editando, setEditando] = useState(false);
  const [abierta, setAbierta] = useState<Jar | null>(null);
  const [traspasando, setTraspasando] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoMes(Date.now()));
  const [poniendoAlDia, setPoniendoAlDia] = useState(false);

  const fechaDe = useMemo(() => {
    const mapa = new Map(transactions.map((t) => [t.id, t.date]));
    return (txId: string) => mapa.get(txId);
  }, [transactions]);

  // Lo que entro y salio en el periodo elegido. El saldo grande sigue siendo
  // el de toda la vida: es el que dice si se puede gastar.
  const flujo = useMemo(
    () => flujoDeJarras(jars, imputaciones, jarTransfers, fechaDe, periodo),
    [jars, imputaciones, jarTransfers, fechaDe, periodo],
  );
  // La barra mide cuanto de lo que la jarra recibio EN TODA SU VIDA ya se
  // gasto. Medirlo contra el mes daria la barra llena en cuanto el ingreso
  // entre el mes anterior, aunque la jarra siga casi intacta.
  const flujoVida = useMemo(
    () => flujoDeJarras(jars, imputaciones, jarTransfers),
    [jars, imputaciones, jarTransfers],
  );

  const total = useMemo(() => jars.reduce((s, j) => s + j.balanceMinor, 0), [jars]);
  const saldosVida = useMemo(
    () => new Map(jars.map((j) => [j.id, j.balanceMinor])),
    [jars],
  );
  const libre = useMemo(() => sinAsignar(accounts, saldosVida), [accounts, saldosVida]);
  const enCuentas = total + libre;

  // Ingresos que nunca llegaron a ninguna jarra. Hasta ahora repartir era un
  // interruptor apagado por defecto y no se encendio nunca.
  const huerfanos = useMemo(() => {
    const conImputacion = new Set(imputaciones.map((i) => i.txId));
    return transactions.filter(
      (t) => t.type === 2 && !t.jarId && !t.distributeToJars && !conImputacion.has(t.id),
    );
  }, [transactions, imputaciones]);

  async function alDia() {
    setPoniendoAlDia(true);
    try {
      const n = await ponerJarrasAlDia();
      avisar(n === 1 ? 'Se repartió 1 ingreso' : `Se repartieron ${n} ingresos`, 'ok');
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo repartir');
    } finally {
      setPoniendoAlDia(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold txt tracking-tight">Jarras</h1>
        {jars.length > 0 && (
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={() => setTraspasando(true)} className="px-3">
              <Icono nombre="arrow-left-right" size={16} /> Mover
            </Boton>
            <Boton variante="secundario" onClick={() => setEditando(true)} className="px-3">
              <Icono nombre="settings-2" size={16} /> Ajustar
            </Boton>
          </div>
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
          {/* La conciliacion: hasta ahora las jarras y las cuentas eran dos
              libros que nadie podia cotejar. */}
          <Tarjeta>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs txt-2 mb-1">En jarras</p>
                <p className="text-2xl font-bold tabular tracking-tight txt">
                  {formatMonto(total, moneda)}
                </p>
              </div>
              <div>
                <p className="text-xs txt-2 mb-1">Sin asignar</p>
                <p className={cn(
                  'text-2xl font-bold tabular tracking-tight',
                  libre < 0 ? 'text-red-500' : 'txt',
                )}>
                  {formatMonto(libre, moneda)}
                </p>
              </div>
            </div>
            <p className="text-xs txt-3 mt-3 leading-relaxed">
              {libre < 0 ? (
                <>
                  Las jarras tienen asignado más de lo que hay en las cuentas
                  ({formatMonto(enCuentas, moneda)}). Movés plata entre jarras o
                  ajustás un saldo de cuenta.
                </>
              ) : (
                <>
                  Suman {formatMonto(enCuentas, moneda)}, que es exactamente lo que
                  hay en las cuentas.
                  {libre > 0 && ' Lo de la derecha todavía no tiene trabajo asignado.'}
                </>
              )}
            </p>
          </Tarjeta>

          {huerfanos.length > 0 && (
            <Tarjeta className="border-marca-500/40">
              <p className="text-sm font-medium txt mb-1">
                {huerfanos.length === 1
                  ? 'Hay 1 ingreso que nunca se repartió'
                  : `Hay ${huerfanos.length} ingresos que nunca se repartieron`}
              </p>
              <p className="text-xs txt-3 leading-relaxed mb-3">
                Suman {formatMonto(huerfanos.reduce((a, t) => a + t.amountMinor, 0), moneda)}.
                Se reparten con los porcentajes de ahora. Los que ya tienen una jarra
                puesta no se tocan.
              </p>
              <Boton onClick={() => void alDia()} disabled={poniendoAlDia} className="w-full">
                {poniendoAlDia ? 'Repartiendo...' : 'Repartirlos ahora'}
              </Boton>
            </Tarjeta>
          )}

          <SelectorPeriodo periodo={periodo} alCambiar={setPeriodo} />

          <div className="space-y-2.5">
            {jars.map((j) => {
              const f = flujo.get(j.id) ?? { entroMinor: 0, salioMinor: 0 };
              const vida = flujoVida.get(j.id) ?? { entroMinor: 0, salioMinor: 0 };
              const enRojo = j.balanceMinor < 0;
              // El numero grande es SIEMPRE lo que queda. Es el que se usa
              // para decidir si se puede gastar, y el que cuadra contra las
              // cuentas. Mostrar el neto del mes aca haria que una jarra con
              // plata se leyera en negativo solo porque el ingreso entro el
              // mes pasado.
              const gastado = enRojo
                ? 1
                : vida.entroMinor > 0 ? vida.salioMinor / vida.entroMinor : 0;

              return (
                <Tarjeta key={j.id} className="p-4 active:opacity-70 transition-opacity cursor-pointer"
                  onClick={() => setAbierta(j)}>
                  <div className="flex items-center gap-3 mb-3">
                    <Ficha color={j.color} icono={j.icon} size={42} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium txt truncate">{j.name}</p>
                      <p className="text-xs txt-3">
                        {formatBp(j.percentageBp)} de cada ingreso
                        {j.acumula && ' · acumula'}
                      </p>
                    </div>
                    <p className={cn(
                      'font-semibold tabular shrink-0',
                      enRojo ? 'text-red-500' : 'txt',
                    )}>
                      {formatMonto(j.balanceMinor, moneda)}
                    </p>
                    <Icono nombre="chevron-right" size={16} className="txt-3 shrink-0 -mr-1" />
                  </div>

                  {/* Cuanto de lo que entro en el periodo ya se gasto. */}
                  <Barra ratio={gastado} color={j.color} alerta />

                  <p className="text-[11px] txt-3 mt-2">
                    {f.entroMinor === 0 && f.salioMinor === 0 ? (
                      <>Sin movimientos en {describirPeriodo(periodo).toLowerCase()}</>
                    ) : (
                      <>
                        {describirPeriodo(periodo).toLowerCase()}: entró{' '}
                        <span className="tabular">{formatMonto(f.entroMinor, moneda)}</span>
                        {', salió '}
                        <span className="tabular">{formatMonto(f.salioMinor, moneda)}</span>
                      </>
                    )}
                  </p>

                  {enRojo && (
                    <p className="text-xs text-red-500 mt-2">
                      Gastaste más de lo que esta jarra tuvo nunca. Movele plata
                      desde otra con el botón de arriba.
                    </p>
                  )}
                </Tarjeta>
              );
            })}
          </div>

          <p className="text-xs txt-3 text-center px-4 leading-relaxed">
            Al registrar un ingreso, marcá "Repartir entre las jarras" y el
            monto se divide según estos porcentajes, al centavo. Lo que sobra de
            un mes no se pierde: se queda en la jarra.
          </p>
        </>
      )}

      <MovimientosDeJarra
        jarra={abierta}
        alCerrar={() => setAbierta(null)}
        alVerMovimiento={(tx) => { setAbierta(null); alVerMovimiento(tx); }}
      />

      <HojaTraspaso abierta={traspasando} alCerrar={() => setTraspasando(false)} />

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
 * Mover plata de una jarra a otra.
 *
 * No toca ninguna cuenta: la plata sigue donde estaba, lo que cambia es para
 * que esta. Es lo unico que permite sacar del rojo a una jarra en la que se
 * gasto de mas.
 */
function HojaTraspaso({ abierta, alCerrar, desde }: {
  abierta: boolean; alCerrar: () => void; desde?: string;
}) {
  const { jars, household, traspasarEntreJarras, avisar } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [montoTexto, setMontoTexto] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    // Por defecto, de la que mas tiene a la que esta en rojo: es el caso que
    // trae a alguien a esta pantalla.
    const enRojo = jars.find((j) => j.balanceMinor < 0);
    const conMas = [...jars].sort((a, b) => b.balanceMinor - a.balanceMinor)[0];
    setOrigen(desde ?? conMas?.id ?? '');
    setDestino(enRojo && enRojo.id !== (desde ?? conMas?.id) ? enRojo.id : '');
    setMontoTexto(enRojo ? montoPlano(-enRojo.balanceMinor, moneda) : '');
    setNota('');
  }, [abierta, desde, jars, moneda]);

  const monto = parseMonto(montoTexto, moneda);
  const jarraOrigen = jars.find((j) => j.id === origen);
  const puede = origen !== '' && destino !== '' && origen !== destino
    && monto !== null && monto > 0 && !guardando;

  async function guardar() {
    if (!puede || monto === null) return;
    setGuardando(true);
    try {
      await traspasarEntreJarras({
        fromJarId: origen, toJarId: destino, amountMinor: monto, note: nota.trim() || undefined,
      });
      alCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo mover');
    } finally {
      setGuardando(false);
    }
  }

  if (!abierta) return null;

  return (
    <Hoja abierta alCerrar={alCerrar} titulo="Mover entre jarras">
      <div className="space-y-4">
        <p className="text-xs txt-3 leading-relaxed">
          No se mueve plata de ninguna cuenta. Solo cambia para qué está
          guardada.
        </p>

        <Selector etiqueta="De" value={origen} onChange={(e) => setOrigen(e.target.value)}>
          <option value="">Elegí una jarra</option>
          {jars.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} · {formatMonto(j.balanceMinor, moneda)}
            </option>
          ))}
        </Selector>

        <Selector etiqueta="A" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">Elegí una jarra</option>
          {jars.filter((j) => j.id !== origen).map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} · {formatMonto(j.balanceMinor, moneda)}
            </option>
          ))}
        </Selector>

        <Campo
          etiqueta="Monto"
          value={montoTexto}
          onChange={(e) => setMontoTexto(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />

        {/* No se bloquea: a veces la jarra de origen tambien esta en rojo y
            aun asi conviene mover. Pero se dice. */}
        {jarraOrigen && monto !== null && monto > jarraOrigen.balanceMinor && (
          <p className="text-xs text-amber-600 dark:text-amber-500 px-1 -mt-2 leading-relaxed">
            {jarraOrigen.name} queda en{' '}
            {formatMonto(jarraOrigen.balanceMinor - monto, moneda)}.
          </p>
        )}

        <Campo
          etiqueta="Por qué (opcional)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Me pasé con la comida..."
          maxLength={200}
        />

        <Boton onClick={() => void guardar()} disabled={!puede} className="w-full min-h-12">
          {guardando ? 'Moviendo...' : 'Mover'}
        </Boton>
      </div>
    </Hoja>
  );
}

/**
 * Movimientos que tocaron una jarra.
 *
 * No alcanza con filtrar por jar_id: un ingreso repartido no apunta a ninguna
 * jarra en particular, pero le entro plata a todas. La lista sale de las
 * mismas imputaciones congeladas que suman el saldo, asi que lo que se ve y
 * lo que dice el numero de arriba son lo mismo por construccion.
 */
function MovimientosDeJarra({ jarra, alCerrar, alVerMovimiento }: {
  jarra: Jar | null;
  alCerrar: () => void;
  alVerMovimiento: (tx: Transaction) => void;
}) {
  const { transactions, imputaciones, household } = useStore();
  const moneda = household?.currency ?? 'USD';

  const movimientos = useMemo(() => {
    if (!jarra) return [];
    const porTx = new Map(transactions.map((t) => [t.id, t]));
    return imputaciones
      .filter((i) => i.jarId === jarra.id && i.amountMinor !== 0)
      .map((i) => ({ tx: porTx.get(i.txId), delta: i.amountMinor }))
      .filter((x): x is { tx: Transaction; delta: number } => x.tx !== undefined)
      .sort((a, b) => b.tx.date - a.tx.date);
  }, [jarra, transactions, imputaciones]);

  if (!jarra) return null;

  const entro = movimientos.filter((m) => m.delta > 0).reduce((a, m) => a + m.delta, 0);
  const salio = movimientos.filter((m) => m.delta < 0).reduce((a, m) => a - m.delta, 0);

  return (
    <Hoja abierta alCerrar={alCerrar} titulo={jarra.name}>
      <div className="space-y-4">
        <div className="flex flex-col items-center text-center pt-1">
          <Ficha color={jarra.color} icono={jarra.icon} size={52} />
          <p className={cn(
            'text-3xl font-bold tabular tracking-tight mt-3',
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
  acumula: boolean;
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
          id: j.id, name: j.name, percentageBp: j.percentageBp, color: j.color,
          icon: j.icon, acumula: j.acumula,
        }))
        : [
          { name: 'Necesidades', percentageBp: 5500, color: '#3b82f6', icon: 'house', acumula: false },
          { name: 'Ahorro largo plazo', percentageBp: 1000, color: '#10b981', icon: 'piggy-bank', acumula: true },
          { name: 'Educación', percentageBp: 1000, color: '#8b5cf6', icon: 'graduation-cap', acumula: false },
          { name: 'Diversión', percentageBp: 1000, color: '#ec4899', icon: 'party-popper', acumula: false },
          { name: 'Libertad financiera', percentageBp: 1000, color: '#f59e0b', icon: 'trending-up', acumula: true },
          { name: 'Donaciones', percentageBp: 500, color: '#f43f5e', icon: 'heart-handshake', acumula: false },
        ],
    );
  }, [abierta, jarras]);

  const sumaBp = borradores.reduce((s, b) => s + b.percentageBp, 0);
  const { ok } = validarJarras(
    borradores.map((b) => ({ ...b, percentageBp: b.percentageBp } as Jar)),
  );

  const cambiar = (i: number, campo: keyof Borrador, valor: string | number | boolean) => {
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

            {/* De por vida o del mes. "Ahorro largo plazo" leido de a un mes no
                significa nada, y "Diversion" acumulada desde siempre tampoco. */}
            <button
              onClick={() => cambiar(i, 'acumula', !b.acumula)}
              className="w-full flex items-center gap-2.5 text-left"
            >
              <div className={cn(
                'w-10 h-6 rounded-full p-0.5 transition-colors shrink-0',
                b.acumula ? 'bg-marca-500' : 'superficie borde border',
              )}>
                <div className={cn(
                  'w-5 h-5 rounded-full bg-white shadow transition-transform',
                  b.acumula && 'translate-x-4',
                )} />
              </div>
              <span className="text-xs txt-2 leading-snug">
                {b.acumula
                  ? 'Acumula de por vida, como un ahorro'
                  : 'Se lee por mes, como un gasto corriente'}
              </span>
            </button>
          </div>
        ))}

        <Boton
          variante="secundario"
          onClick={() => setBorradores((p) => [...p, {
            name: 'Nueva jarra', percentageBp: 0, color: COLORES[p.length % COLORES.length],
            icon: 'piggy-bank', acumula: false,
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

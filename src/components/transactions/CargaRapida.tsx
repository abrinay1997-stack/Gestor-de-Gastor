/**
 * Carga de un movimiento.
 *
 * La pantalla que mas se usa. Todo esta a la vista: no hay seccion plegada de
 * "mas detalles", porque esconder la fecha o la jarra hacia que nadie las
 * tocara y despues costaba entender por que los numeros no cerraban.
 *
 * El orden sigue al de la cabeza de quien carga: cuanto, en que, de donde
 * sale, a que jarra se imputa, quien lo hizo, cuando.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/store.tsx';
import { leer } from '@shared/parser';
import { formatMonto, montoPlano, parseMonto } from '@shared/money';
import {
  entidadDe, entidadPorDefecto, imputacionJarras, indexarCategorias, jarrasDe,
} from '@shared/domain';
import { TxType, type Transaction, type TransactionInput } from '@shared/types';
import { aInputDate, deInputDate, vibrar } from '../../lib/utils.ts';
import { Avatar, Boton, Campo, Ficha, Hoja, Icono, Selector } from '../ui/base.tsx';
import { cn } from '../../lib/utils.ts';

const TIPOS: { id: TxType; etiqueta: string; icono: string; color: string }[] = [
  { id: TxType.GASTO, etiqueta: 'Gasto', icono: 'arrow-down-left', color: '#ef4444' },
  { id: TxType.INGRESO, etiqueta: 'Ingreso', icono: 'arrow-up-right', color: '#10b981' },
  { id: TxType.TRANSFERENCIA, etiqueta: 'Transferencia', icono: 'arrow-left-right', color: '#3b82f6' },
];

/**
 * Nombre de cuenta con su dueño: "Banco Central · Avalon".
 * Sin esto, dos cuentas parecidas de personas distintas son imposibles de
 * distinguir en el desplegable.
 */
export function etiquetaCuenta(
  cuenta: { name: string; owner: string },
  members: { id: string; displayName: string }[],
): string {
  if (cuenta.owner === 'compartida') return `${cuenta.name} · Compartida`;
  const duenio = members.find((m) => m.id === cuenta.owner);
  return duenio ? `${cuenta.name} · ${duenio.displayName}` : cuenta.name;
}

export function CargaRapida({ abierta, alCerrar, editando }: {
  abierta: boolean;
  alCerrar: () => void;
  editando?: Transaction | null;
}) {
  const {
    accounts, categories, jars, entities, transactions, members, me, household, guardarTx,
  } = useStore();
  const moneda = household?.currency ?? 'USD';

  const activas = useMemo(() => accounts.filter((c) => !c.archived), [accounts]);

  const [frase, setFrase] = useState('');
  const [tipo, setTipo] = useState<TxType>(TxType.GASTO);
  const [montoTexto, setMontoTexto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destAccountId, setDestAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [jarId, setJarId] = useState('');
  const [paidBy, setPaidBy] = useState('');
  // Encendido por defecto. Estuvo apagado los primeros 44 movimientos y no lo
  // prendio nadie: las jarras solo veian gastos y quedaban en rojo. Un ingreso
  // que no se reparte es la excepcion, no la regla.
  const [repartir, setRepartir] = useState(true);
  const [fecha, setFecha] = useState(aInputDate(Date.now()));
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refFrase = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierta) return;

    if (editando) {
      setTipo(editando.type);
      setMontoTexto(montoPlano(Math.abs(editando.amountMinor), moneda));
      setDescripcion(editando.description);
      setAccountId(editando.accountId);
      setDestAccountId(editando.destAccountId ?? '');
      setCategoryId(editando.categoryId ?? '');
      setJarId(editando.jarId ?? '');
      setPaidBy(editando.paidBy ?? editando.createdBy);
      setRepartir(editando.distributeToJars);
      setFecha(aInputDate(editando.date));
      setNotas(editando.notes ?? '');
      setFrase('');
    } else {
      setTipo(TxType.GASTO);
      setMontoTexto('');
      setDescripcion('');
      setAccountId(activas[0]?.id ?? '');
      setDestAccountId('');
      setCategoryId('');
      setJarId('');
      setPaidBy(me?.id ?? '');
      setRepartir(true);
      setFecha(aInputDate(Date.now()));
      setNotas('');
      setFrase('');
      setTimeout(() => refFrase.current?.focus(), 80);
    }
    setError(null);
  }, [abierta, editando, moneda, activas, me]);

  const lectura = useMemo(() => {
    if (!frase.trim() || editando) return null;
    return leer(frase, { categories, historial: transactions, currency: moneda });
  }, [frase, categories, transactions, moneda, editando]);

  useEffect(() => {
    if (!lectura) return;
    if (lectura.amountMinor !== null) setMontoTexto(montoPlano(lectura.amountMinor, moneda));
    setDescripcion(lectura.description);
    setTipo(lectura.type);
    if (lectura.categoryId) setCategoryId(lectura.categoryId);
  }, [lectura, moneda]);

  const montoMinor = parseMonto(montoTexto, moneda);
  const esTransferencia = tipo === TxType.TRANSFERENCIA;
  const tipoCategoria = tipo === TxType.INGRESO ? 'ingreso' : 'gasto';

  const categoriasVisibles = useMemo(
    () => categories.filter((c) => !c.archived && c.type === tipoCategoria),
    [categories, tipoCategoria],
  );

  const cuentaSel = activas.find((c) => c.id === accountId);

  const puedeGuardar =
    montoMinor !== null && montoMinor > 0 &&
    accountId !== '' &&
    (!esTransferencia || (destAccountId !== '' && destAccountId !== accountId)) &&
    !guardando;

  /**
   * Las jarras que reparten ESTE movimiento: las de su economia, que sale de
   * la categoria elegida. Un cobro de PanaClaw no cae en los frascos de la
   * casa.
   */
  const jarrasPropias = useMemo(() => {
    const suya = entidadDe(
      { entityId: editando?.entityId ?? null, categoryId: categoryId || null },
      indexarCategorias(categories),
    );
    return jarrasDe(jars, suya, entidadPorDefecto(entities));
  }, [jars, categories, entities, categoryId, editando]);

  /** A donde iria a parar el ingreso si se guarda asi. */
  const vistaPrevia = useMemo(() => {
    if (!repartir || tipo !== TxType.INGRESO || montoMinor === null || montoMinor <= 0) return [];
    const partes = imputacionJarras(
      { type: TxType.INGRESO, amountMinor: montoMinor, distributeToJars: true, jarId: null },
      jarrasPropias,
    );
    return jarrasPropias
      .map((jarra) => ({ jarra, monto: partes.get(jarra.id) ?? 0 }))
      .filter((x) => x.monto !== 0);
  }, [repartir, tipo, montoMinor, jarrasPropias]);

  /** Si este gasto deja la jarra en rojo, cuanto queda. */
  const sobregiro = useMemo(() => {
    if (tipo !== TxType.GASTO || !jarId || montoMinor === null || montoMinor <= 0) return null;
    const jarra = jars.find((j) => j.id === jarId);
    if (!jarra) return null;
    // Al editar, el efecto viejo ya esta contado en el saldo: se descuenta
    // para no avisar de un sobregiro que en realidad no cambia.
    const yaContado = editando?.jarId === jarId && editando.type === TxType.GASTO
      ? editando.amountMinor : 0;
    const queda = jarra.balanceMinor + yaContado - montoMinor;
    return queda < 0 ? { jarra, queda } : null;
  }, [tipo, jarId, montoMinor, jars, editando]);

  async function guardar() {
    if (!puedeGuardar || montoMinor === null) return;
    setGuardando(true);
    setError(null);

    const entrada: TransactionInput = {
      type: tipo,
      amountMinor: montoMinor,
      accountId,
      destAccountId: esTransferencia ? destAccountId : null,
      destAmountMinor: null,
      categoryId: esTransferencia ? null : (categoryId || null),
      jarId: !esTransferencia && !repartir ? (jarId || null) : null,
      distributeToJars: tipo === TxType.INGRESO && repartir,
      description: descripcion.trim() || 'Movimiento',
      notes: notas.trim() || null,
      date: deInputDate(fecha),
      // Solo se manda si difiere de quien lo carga: null quiere decir
      // "el mismo", y guardarlo asi mantiene los datos limpios.
      paidBy: paidBy && paidBy !== me?.id ? paidBy : null,
      recurringId: editando?.recurringId ?? null,
      // Null = la de su categoria, que es el caso normal. Solo se escribe al
      // corregir uno suelto desde el detalle.
      entityId: editando?.entityId ?? null,
    };

    try {
      await guardarTx(entrada, editando?.id);
      vibrar();
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo={editando ? 'Editar movimiento' : 'Nuevo movimiento'}>
      <div className="space-y-4">
        {!editando && (
          <div>
            <div className="relative">
              <Campo
                ref={refFrase}
                value={frase}
                onChange={(e) => setFrase(e.target.value)}
                placeholder='Escribí "super 12500" y listo'
                inputMode="text"
                enterKeyHint="done"
                className="pr-10"
              />
              <Icono
                nombre="wand-sparkles"
                size={17}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 txt-3 pointer-events-none"
              />
            </div>
            {lectura && lectura.razon !== 'ninguna' && (
              <p className="text-xs txt-3 mt-1.5 px-1">
                {lectura.razon === 'historial'
                  ? 'Categoría sugerida por movimientos parecidos tuyos'
                  : 'Categoría sugerida por la descripción'}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTipo(t.id); if (t.id !== TxType.INGRESO) setRepartir(false); }}
              className={cn(
                'min-h-11 rounded-xl text-sm font-medium border transition-all flex items-center justify-center gap-1.5',
                tipo === t.id ? 'text-white border-transparent' : 'superficie-2 borde txt-2',
              )}
              style={tipo === t.id ? { background: t.color } : undefined}
            >
              <Icono nombre={t.icono} size={15} />
              <span className="truncate">{t.etiqueta}</span>
            </button>
          ))}
        </div>

        <div>
          <span className="block text-xs font-medium txt-2 mb-1.5">Monto</span>
          <input
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className={cn(
              'w-full min-h-16 px-4 rounded-2xl superficie-2 borde border txt',
              'text-3xl font-semibold tabular text-center outline-none',
              'focus:border-marca-500 focus:ring-2 focus:ring-marca-500/20',
            )}
          />
          {montoMinor !== null && montoMinor > 0 && (
            <p className="text-xs txt-3 mt-1.5 text-center">{formatMonto(montoMinor, moneda)}</p>
          )}
        </div>

        <Campo
          etiqueta="Descripción"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="En qué fue"
        />

        {!esTransferencia && categoriasVisibles.length > 0 && (
          <div>
            <span className="block text-xs font-medium txt-2 mb-2">Categoría</span>
            <div className="flex gap-2 overflow-x-auto sin-barra pb-1 -mx-1 px-1">
              {categoriasVisibles.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                  className={cn(
                    'shrink-0 min-h-11 px-3 rounded-xl border text-sm font-medium flex items-center gap-1.5 transition-all',
                    categoryId === c.id ? 'border-transparent text-white' : 'superficie-2 borde txt-2',
                  )}
                  style={categoryId === c.id ? { background: c.color } : undefined}
                >
                  <Icono nombre={c.icon} size={15} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cuenta, y justo debajo la jarra: el dinero sale de una cuenta y se
            imputa a una jarra, asi que van juntos y en ese orden. */}
        <Selector
          etiqueta={esTransferencia ? 'Desde' : 'Cuenta'}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Elegí una cuenta</option>
          {activas.map((c) => (
            <option key={c.id} value={c.id}>
              {etiquetaCuenta(c, members)} · {formatMonto(c.balanceMinor, c.currency, { compacto: true })}
            </option>
          ))}
        </Selector>

        {esTransferencia && (
          <Selector etiqueta="Hacia" value={destAccountId} onChange={(e) => setDestAccountId(e.target.value)}>
            <option value="">Elegí una cuenta</option>
            {activas.filter((c) => c.id !== accountId).map((c) => (
              <option key={c.id} value={c.id}>{etiquetaCuenta(c, members)}</option>
            ))}
          </Selector>
        )}

        {/* Las de su economia primero, que es lo que se va a elegir el 99% de
            las veces. Las otras quedan abajo y agrupadas: sacar plata de los
            impuestos de un negocio para pagar la comida se puede, pero tiene
            que costar un scroll y verse escrito de quien es. */}
        {!esTransferencia && !repartir && jars.length > 0 && (
          <Selector etiqueta="Jarra" value={jarId} onChange={(e) => setJarId(e.target.value)}>
            <option value="">Sin jarra</option>
            {jarrasPropias.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name} · {formatMonto(j.balanceMinor, moneda, { compacto: true })}
              </option>
            ))}
            {entities.filter((e) => (
              !e.archived
              && e.id !== (jarrasPropias[0]?.entityId ?? null)
              && jars.some((j) => j.entityId === e.id)
            )).map((e) => (
              <optgroup key={e.id} label={e.name}>
                {jars.filter((j) => j.entityId === e.id).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} · {formatMonto(j.balanceMinor, moneda, { compacto: true })}
                  </option>
                ))}
              </optgroup>
            ))}
          </Selector>
        )}

        {/* Gastar de una jarra vacia es la senal que un sistema de sobres
            existe para dar. No lo impide (a veces te pasaste y ya esta), pero
            lo dice ANTES de guardar, no despues en otra pantalla. */}
        {sobregiro && (
          <div className="-mt-2 rounded-2xl p-3 border"
            style={{ borderColor: '#f59e0b66', background: '#f59e0b14' }}>
            <p className="text-xs txt-2 leading-relaxed">
              <span className="font-semibold txt">{sobregiro.jarra.name}</span> queda en{' '}
              <span className="font-semibold tabular text-red-500">
                {formatMonto(sobregiro.queda, moneda)}
              </span>.
              {' '}Se guarda igual; después podés moverle plata desde otra jarra.
            </p>
          </div>
        )}

        {/* El reparto, calculado en vivo. Hasta ahora habia que guardar para
            enterarse de a donde iba a parar la plata. */}
        {repartir && montoMinor !== null && montoMinor > 0 && vistaPrevia.length > 0 && (
          <div className="-mt-2 rounded-2xl superficie-2 borde border p-3 space-y-1">
            {vistaPrevia.map(({ jarra, monto }) => (
              <div key={jarra.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="txt-2 truncate">{jarra.name}</span>
                <span className="tabular font-medium txt shrink-0">
                  {formatMonto(monto, moneda)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Solo si la economia de este movimiento tiene jarras. Si PanaClaw
            todavia no reparte, el interruptor seria un boton que no hace
            nada. */}
        {tipo === TxType.INGRESO && jarrasPropias.length > 0 && (
          <button
            onClick={() => { setRepartir(!repartir); if (!repartir) setJarId(''); }}
            className={cn(
              'w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all',
              repartir ? 'bg-marca-50 border-marca-500 dark:bg-marca-500/10' : 'superficie-2 borde',
            )}
          >
            <Ficha color="#10b981" icono="split" size={38} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium txt">Repartir entre las jarras</p>
              <p className="text-xs txt-3">
                {montoMinor
                  ? `Se reparten ${formatMonto(montoMinor, moneda)} según los porcentajes`
                  : 'Según los porcentajes de cada jarra'}
              </p>
            </div>
            <div className={cn(
              'w-11 h-6 rounded-full p-0.5 transition-colors shrink-0',
              repartir ? 'bg-marca-500' : 'superficie-2 borde border',
            )}>
              <div className={cn('w-5 h-5 rounded-full bg-white shadow transition-transform', repartir && 'translate-x-5')} />
            </div>
          </button>
        )}

        {/* Quién lo hizo. Solo aparece si son dos o mas: con una sola persona
            la pregunta no tiene sentido. */}
        {members.length > 1 && !esTransferencia && (
          <div>
            <span className="block text-xs font-medium txt-2 mb-2">Quién lo hizo</span>
            <div className="flex gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPaidBy(m.id)}
                  className={cn(
                    'flex-1 min-h-12 rounded-xl border flex items-center justify-center gap-2 px-2 transition-all',
                    paidBy === m.id ? 'border-transparent' : 'superficie-2 borde',
                  )}
                  style={paidBy === m.id ? { background: `${m.color}1f`, boxShadow: `0 0 0 2px ${m.color}` } : undefined}
                >
                  <Avatar nombre={m.displayName} color={m.color} emoji={m.emoji} size={26} />
                  <span className={cn('text-sm font-medium truncate', paidBy === m.id ? 'txt' : 'txt-2')}>
                    {m.displayName}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <Campo etiqueta="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />

        <Campo
          etiqueta="Notas"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Opcional"
        />

        {cuentaSel && montoMinor !== null && montoMinor > 0 && tipo === TxType.GASTO && (
          <p className="text-xs txt-3 text-center">
            Saldo después: {formatMonto(cuentaSel.balanceMinor - montoMinor, cuentaSel.currency)}
          </p>
        )}

        {error && <p className="text-sm text-red-500 text-center px-2">{error}</p>}

        <Boton onClick={() => void guardar()} disabled={!puedeGuardar} className="w-full min-h-12">
          {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar'}
        </Boton>
      </div>
    </Hoja>
  );
}

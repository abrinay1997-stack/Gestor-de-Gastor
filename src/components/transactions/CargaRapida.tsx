/**
 * Carga de un movimiento.
 *
 * La pantalla que mas se usa, asi que esta optimizada para el caso comun:
 * escribir "super 12500" y tocar guardar. El parser local deduce monto,
 * categoria y tipo mientras se escribe; todo queda visible y corregible.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/store.tsx';
import { leer } from '@shared/parser';
import { formatMonto, montoPlano, parseMonto } from '@shared/money';
import { TxType, type Transaction, type TransactionInput } from '@shared/types';
import { aInputDate, deInputDate, vibrar } from '../../lib/utils.ts';
import { Boton, Campo, Ficha, Hoja, Icono, Selector } from '../ui/base.tsx';
import { cn } from '../../lib/utils.ts';

const TIPOS: { id: TxType; etiqueta: string; icono: string; color: string }[] = [
  { id: TxType.GASTO, etiqueta: 'Gasto', icono: 'arrow-down-left', color: '#ef4444' },
  { id: TxType.INGRESO, etiqueta: 'Ingreso', icono: 'arrow-up-right', color: '#10b981' },
  { id: TxType.TRANSFERENCIA, etiqueta: 'Transferencia', icono: 'arrow-left-right', color: '#3b82f6' },
];

export function CargaRapida({ abierta, alCerrar, editando }: {
  abierta: boolean;
  alCerrar: () => void;
  editando?: Transaction | null;
}) {
  const { accounts, categories, jars, transactions, household, guardarTx, borrarTx } = useStore();
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
  const [repartir, setRepartir] = useState(false);
  const [fecha, setFecha] = useState(aInputDate(Date.now()));
  const [notas, setNotas] = useState('');
  const [avanzado, setAvanzado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refFrase = useRef<HTMLInputElement>(null);

  // Carga los valores al abrir: los de la transaccion si se esta editando,
  // o los de un movimiento nuevo si no.
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
      setRepartir(editando.distributeToJars);
      setFecha(aInputDate(editando.date));
      setNotas(editando.notes ?? '');
      setFrase('');
      setAvanzado(true);
    } else {
      setTipo(TxType.GASTO);
      setMontoTexto('');
      setDescripcion('');
      setAccountId(activas[0]?.id ?? '');
      setDestAccountId('');
      setCategoryId('');
      setJarId('');
      setRepartir(false);
      setFecha(aInputDate(Date.now()));
      setNotas('');
      setFrase('');
      setAvanzado(false);
      // Enfocar en el proximo cuadro para que el teclado suba solo.
      setTimeout(() => refFrase.current?.focus(), 80);
    }
    setError(null);
  }, [abierta, editando, moneda, activas]);

  /**
   * Interpreta la frase mientras se escribe y completa el formulario.
   * No pisa lo que ya se toco a mano: si la persona eligio una categoria,
   * el parser no se la cambia.
   */
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

  async function eliminar() {
    if (!editando) return;
    setGuardando(true);
    try {
      await borrarTx(editando.id);
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo={editando ? 'Editar movimiento' : 'Nuevo movimiento'}>
      <div className="space-y-4">
        {/* Entrada en lenguaje natural */}
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

        {/* Tipo */}
        <div className="grid grid-cols-3 gap-2">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTipo(t.id); if (t.id !== TxType.INGRESO) setRepartir(false); }}
              className={cn(
                'min-h-11 rounded-xl text-sm font-medium border transition-all flex items-center justify-center gap-1.5',
                tipo === t.id
                  ? 'text-white border-transparent'
                  : 'superficie-2 borde txt-2',
              )}
              style={tipo === t.id ? { background: t.color } : undefined}
            >
              <Icono nombre={t.icono} size={15} />
              <span className="hidden xs:inline">{t.etiqueta}</span>
              <span className="xs:hidden">{t.etiqueta.slice(0, 5)}</span>
            </button>
          ))}
        </div>

        {/* Monto, grande y con teclado numerico */}
        <div>
          <span className="block text-xs font-medium txt-2 mb-1.5">Monto</span>
          <div className="relative">
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
          </div>
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

        {/* Categoria en fichas: mas rapido que un desplegable en el celular */}
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

        <Selector
          etiqueta={esTransferencia ? 'Desde' : 'Cuenta'}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Elegí una cuenta</option>
          {activas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {formatMonto(c.balanceMinor, c.currency, { compacto: true })}
            </option>
          ))}
        </Selector>

        {esTransferencia && (
          <Selector
            etiqueta="Hacia"
            value={destAccountId}
            onChange={(e) => setDestAccountId(e.target.value)}
          >
            <option value="">Elegí una cuenta</option>
            {activas.filter((c) => c.id !== accountId).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Selector>
        )}

        {/* Repartir entre jarras: solo tiene sentido en un ingreso */}
        {tipo === TxType.INGRESO && jars.length > 0 && (
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
                {montoMinor ? `Se reparten ${formatMonto(montoMinor, moneda)} según los porcentajes` : 'Según los porcentajes de cada jarra'}
              </p>
            </div>
            <div className={cn(
              'w-11 h-6 rounded-full p-0.5 transition-colors shrink-0',
              repartir ? 'bg-marca-500' : 'superficie-2 borde border',
            )}>
              <div className={cn(
                'w-5 h-5 rounded-full bg-white shadow transition-transform',
                repartir && 'translate-x-5',
              )} />
            </div>
          </button>
        )}

        {/* Detalles que casi nunca se tocan, plegados por defecto */}
        <button
          onClick={() => setAvanzado(!avanzado)}
          className="w-full flex items-center justify-between min-h-11 px-1 text-sm txt-2"
        >
          <span>Más detalles</span>
          <Icono nombre={avanzado ? 'chevron-up' : 'chevron-down'} size={17} />
        </button>

        {avanzado && (
          <div className="space-y-4 pt-1">
            <Campo
              etiqueta="Fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />

            {!esTransferencia && !repartir && jars.length > 0 && (
              <Selector etiqueta="Jarra" value={jarId} onChange={(e) => setJarId(e.target.value)}>
                <option value="">Sin jarra</option>
                {jars.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} · {formatMonto(j.balanceMinor, moneda, { compacto: true })}
                  </option>
                ))}
              </Selector>
            )}

            <Campo
              etiqueta="Notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        )}

        {cuentaSel && montoMinor !== null && montoMinor > 0 && tipo === TxType.GASTO && (
          <p className="text-xs txt-3 text-center">
            Saldo después: {formatMonto(cuentaSel.balanceMinor - montoMinor, cuentaSel.currency)}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-500 text-center px-2">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          {editando && (
            <Boton variante="peligro" onClick={() => void eliminar()} disabled={guardando} className="px-4">
              <Icono nombre="trash-2" size={17} />
            </Boton>
          )}
          <Boton onClick={() => void guardar()} disabled={!puedeGuardar} className="flex-1 min-h-12">
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar'}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

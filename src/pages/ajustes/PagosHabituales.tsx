/**
 * Pagos habituales: se crean y configuran aca, igual que los presupuestos.
 *
 * El movimiento lo carga solo el disparador programado cuando llega la fecha.
 * Por eso el formulario insiste con la fecha del proximo cobro: es la unica
 * forma de que quien lo configura sepa que va a pasar y cuando.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/store.tsx';
import { formatMonto, montoPlano, parseMonto } from '@shared/money';
import { TxType, type Recurring } from '@shared/types';
import {
  DIAS_SEMANA, describirRegla, MESES, primeraFecha, type Frecuencia,
} from '@shared/recurrencia';
import { Boton, Campo, Ficha, Hoja, Icono, Selector, Tarjeta } from '../../components/ui/base.tsx';
import { useConfirmar } from '../../components/ui/confirmar.tsx';
import { etiquetaCuenta } from '../../components/transactions/CargaRapida.tsx';
import { cn } from '../../lib/utils.ts';

export function PagosHabituales() {
  const { recurring, categories, accounts, household, borrarRecurrente, avisar } = useStore();
  const confirmar = useConfirmar();
  const moneda = household?.currency ?? 'USD';

  const [editando, setEditando] = useState<Recurring | null>(null);
  const [abierto, setAbierto] = useState(false);

  async function eliminar(r: Recurring) {
    const ok = await confirmar({
      titulo: `¿Borrar "${r.name}"?`,
      detalle: 'Deja de cargarse automáticamente. Los movimientos que ya creó se quedan donde están.',
      destructivo: true,
    });
    if (!ok) return;
    try {
      await borrarRecurrente(r.id);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo borrar');
    }
  }

  return (
    <>
      <Tarjeta>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold txt">Pagos habituales</h2>
          <button
            onClick={() => { setEditando(null); setAbierto(true); }}
            className="text-sm text-marca-600 dark:text-marca-500 font-medium min-h-9 px-1"
          >
            Agregar
          </button>
        </div>

        {recurring.length === 0 ? (
          <p className="text-sm txt-3 leading-relaxed">
            El alquiler, la luz, Netflix. Se cargan solos el día que corresponde,
            así no hay que acordarse ni anotarlos a mano.
          </p>
        ) : (
          <div className="space-y-2">
            {recurring.map((r) => {
              const cat = categories.find((c) => c.id === r.categoryId);
              const cuenta = accounts.find((a) => a.id === r.accountId);
              const dias = Math.ceil((r.nextRun - Date.now()) / 86_400_000);

              return (
                <div key={r.id} className={cn('flex items-center gap-3', !r.active && 'opacity-50')}>
                  <Ficha color={cat?.color ?? '#8b5cf6'} icono={cat?.icon ?? 'repeat'} size={38} />
                  <button
                    onClick={() => { setEditando(r); setAbierto(true); }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-medium txt truncate">
                      {r.name}
                      {!r.active && <span className="txt-3 font-normal"> · en pausa</span>}
                    </p>
                    <p className="text-xs txt-3 truncate">
                      {describirRegla({
                        frecuencia: r.frequency,
                        diaDelMes: r.dayOfMonth ?? undefined,
                        diaDeSemana: r.dayOfWeek ?? undefined,
                        mesDelAnio: r.monthOfYear ?? undefined,
                      })}
                      {cuenta && ` · ${cuenta.name}`}
                      {r.active && dias >= 0 && dias <= 31 &&
                        ` · ${dias === 0 ? 'hoy' : `en ${dias} día${dias > 1 ? 's' : ''}`}`}
                    </p>
                  </button>
                  <p className={cn(
                    'text-sm font-semibold tabular shrink-0',
                    r.type === TxType.INGRESO ? 'text-marca-600 dark:text-marca-500' : 'txt',
                  )}>
                    {r.type === TxType.INGRESO ? '+' : '−'}{formatMonto(r.amountMinor, moneda, { compacto: true })}
                  </p>
                  <button
                    onClick={() => void eliminar(r)}
                    aria-label={`Borrar ${r.name}`}
                    className="w-9 h-9 rounded-lg flex items-center justify-center txt-3 shrink-0"
                  >
                    <Icono nombre="trash-2" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Tarjeta>

      <FormularioPago
        abierto={abierto}
        alCerrar={() => { setAbierto(false); setEditando(null); }}
        editando={editando}
      />
    </>
  );
}

function FormularioPago({ abierto, alCerrar, editando }: {
  abierto: boolean; alCerrar: () => void; editando: Recurring | null;
}) {
  const { accounts, categories, jars, members, household, guardarRecurrente, avisar } = useStore();
  const moneda = household?.currency ?? 'USD';
  const activas = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  const [name, setName] = useState('');
  const [tipo, setTipo] = useState<TxType>(TxType.GASTO);
  const [montoTexto, setMontoTexto] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [jarId, setJarId] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual');
  const [diaMes, setDiaMes] = useState(1);
  const [diaSemana, setDiaSemana] = useState(1);
  const [mesAnio, setMesAnio] = useState(1);
  const [activo, setActivo] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    if (editando) {
      setName(editando.name);
      setTipo(editando.type);
      setMontoTexto(montoPlano(editando.amountMinor, moneda));
      setAccountId(editando.accountId);
      setCategoryId(editando.categoryId ?? '');
      setJarId(editando.jarId ?? '');
      setPaidBy(editando.paidBy ?? '');
      setFrecuencia(editando.frequency);
      setDiaMes(editando.dayOfMonth ?? 1);
      setDiaSemana(editando.dayOfWeek ?? 1);
      setMesAnio(editando.monthOfYear ?? 1);
      setActivo(editando.active);
    } else {
      setName('');
      setTipo(TxType.GASTO);
      setMontoTexto('');
      setAccountId(activas[0]?.id ?? '');
      setCategoryId('');
      setJarId('');
      setPaidBy('');
      setFrecuencia('mensual');
      setDiaMes(new Date().getDate());
      setDiaSemana(1);
      setMesAnio(new Date().getMonth() + 1);
      setActivo(true);
    }
    setError(null);
  }, [abierto, editando, moneda, activas]);

  const montoMinor = parseMonto(montoTexto, moneda);
  const tipoCategoria = tipo === TxType.INGRESO ? 'ingreso' : 'gasto';
  const categoriasVisibles = categories.filter((c) => !c.archived && c.type === tipoCategoria);

  const proxima = primeraFecha({
    frecuencia,
    diaDelMes: frecuencia !== 'semanal' ? diaMes : undefined,
    diaDeSemana: frecuencia === 'semanal' ? diaSemana : undefined,
    mesDelAnio: frecuencia === 'anual' ? mesAnio : undefined,
  });

  const puedeGuardar = name.trim() !== '' && montoMinor !== null && montoMinor > 0 && accountId !== '' && !guardando;

  async function guardar() {
    if (!puedeGuardar || montoMinor === null) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarRecurrente({
        name: name.trim(),
        type: tipo,
        amountMinor: montoMinor,
        accountId,
        categoryId: categoryId || null,
        jarId: jarId || null,
        paidBy: paidBy || null,
        frequency: frecuencia,
        dayOfMonth: frecuencia !== 'semanal' ? diaMes : null,
        dayOfWeek: frecuencia === 'semanal' ? diaSemana : null,
        monthOfYear: frecuencia === 'anual' ? mesAnio : null,
        active: activo,
      }, editando?.id);
      alCerrar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar';
      setError(msg);
      avisar(msg);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja abierta={abierto} alCerrar={alCerrar} titulo={editando ? 'Editar pago habitual' : 'Nuevo pago habitual'}>
      <div className="space-y-4">
        <Campo etiqueta="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alquiler, Netflix, Luz..." />

        <div className="grid grid-cols-2 gap-2">
          {[
            { id: TxType.GASTO, etiqueta: 'Gasto', color: '#ef4444' },
            { id: TxType.INGRESO, etiqueta: 'Ingreso', color: '#10b981' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTipo(t.id)}
              className={cn(
                'min-h-11 rounded-xl text-sm font-medium border transition-all',
                tipo === t.id ? 'text-white border-transparent' : 'superficie-2 borde txt-2',
              )}
              style={tipo === t.id ? { background: t.color } : undefined}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>

        <Campo
          etiqueta="Monto"
          value={montoTexto}
          onChange={(e) => setMontoTexto(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />

        <Selector etiqueta="Frecuencia" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
          <option value="mensual">Cada mes</option>
          <option value="semanal">Cada semana</option>
          <option value="anual">Cada año</option>
        </Selector>

        {frecuencia === 'semanal' ? (
          <Selector etiqueta="Día" value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))}>
            {DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </Selector>
        ) : (
          <div className={cn('grid gap-3', frecuencia === 'anual' ? 'grid-cols-2' : 'grid-cols-1')}>
            <Selector etiqueta="Día del mes" value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </Selector>
            {frecuencia === 'anual' && (
              <Selector etiqueta="Mes" value={mesAnio} onChange={(e) => setMesAnio(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={m} value={i + 1} className="capitalize">{m}</option>)}
              </Selector>
            )}
          </div>
        )}

        {/* Un día 29, 30 o 31 no existe en todos los meses. Decirlo acá evita
            la sorpresa de que el pago "se corrió". */}
        {frecuencia !== 'semanal' && diaMes > 28 && (
          <p className="text-xs txt-3 px-1 -mt-2 leading-relaxed">
            En los meses que no tienen día {diaMes}, se cobra el último día del mes.
          </p>
        )}

        <Selector etiqueta="Cuenta" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="">Elegí una cuenta</option>
          {activas.map((c) => <option key={c.id} value={c.id}>{etiquetaCuenta(c, members)}</option>)}
        </Selector>

        {categoriasVisibles.length > 0 && (
          <Selector etiqueta="Categoría" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sin categoría</option>
            {categoriasVisibles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Selector>
        )}

        {jars.length > 0 && (
          <Selector etiqueta="Jarra" value={jarId} onChange={(e) => setJarId(e.target.value)}>
            <option value="">Sin jarra</option>
            {jars.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
          </Selector>
        )}

        {members.length > 1 && (
          <Selector etiqueta="Quién lo paga" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            <option value="">Sin asignar</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
          </Selector>
        )}

        <button
          onClick={() => setActivo(!activo)}
          className={cn(
            'w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all',
            activo ? 'bg-marca-50 border-marca-500 dark:bg-marca-500/10' : 'superficie-2 borde',
          )}
        >
          <Ficha color={activo ? '#10b981' : '#64748b'} icono={activo ? 'check' : 'circle'} size={38} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium txt">{activo ? 'Activo' : 'En pausa'}</p>
            <p className="text-xs txt-3">
              {activo
                ? `Próximo: ${new Date(proxima).toLocaleDateString('es', { day: 'numeric', month: 'long' })}`
                : 'No se va a cargar hasta que lo reactives'}
            </p>
          </div>
          <div className={cn('w-11 h-6 rounded-full p-0.5 transition-colors shrink-0', activo ? 'bg-marca-500' : 'superficie borde border')}>
            <div className={cn('w-5 h-5 rounded-full bg-white shadow transition-transform', activo && 'translate-x-5')} />
          </div>
        </button>

        {error && <p className="text-sm text-red-500 text-center px-2">{error}</p>}

        <Boton onClick={() => void guardar()} disabled={!puedeGuardar} className="w-full min-h-12">
          {guardando ? 'Guardando...' : 'Guardar'}
        </Boton>
      </div>
    </Hoja>
  );
}

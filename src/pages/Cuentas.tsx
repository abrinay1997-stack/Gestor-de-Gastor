/**
 * Cuentas del hogar.
 *
 * Separa activos de pasivos, algo que la version anterior no hacia: sumaba el
 * saldo de la tarjeta de credito al patrimonio como si fuera plata disponible.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store/store.tsx';
import { formatMonto, montoPlano, parseMonto } from '@shared/money';
import {
  ACCOUNT_CATEGORY_LABEL, AccountCategory, esActivo, type Account,
} from '@shared/types';
import { calcularPatrimonio } from '@shared/domain';
import { Boton, Campo, Ficha, Hoja, Icono, Selector, Tarjeta, Vacio } from '../components/ui/base.tsx';
import { cn } from '../lib/utils.ts';

const ICONOS: Record<AccountCategory, string> = {
  [AccountCategory.EFECTIVO]: 'banknote',
  [AccountCategory.CUENTA_CORRIENTE]: 'landmark',
  [AccountCategory.TARJETA_CREDITO]: 'credit-card',
  [AccountCategory.AHORRO]: 'piggy-bank',
  [AccountCategory.INVERSION]: 'trending-up',
  [AccountCategory.DEUDA]: 'file-minus',
  [AccountCategory.POR_COBRAR]: 'hand-coins',
};

const COLORES = ['#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4', '#64748b'];

export function Cuentas() {
  const { accounts, household, members } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [editando, setEditando] = useState<Account | null>(null);
  const [abierta, setAbierta] = useState(false);

  const activas = accounts.filter((c) => !c.archived);
  const archivadas = accounts.filter((c) => c.archived);

  const activos = activas.filter((c) => esActivo(c.category));
  const pasivos = activas.filter((c) => !esActivo(c.category));

  const totalActivos = useMemo(
    () => activos.reduce((s, c) => s + c.balanceMinor, 0), [activos],
  );
  // Los saldos de pasivo son negativos (consumir con la tarjeta resta). Para
  // mostrarlos bajo "lo que debes" se invierte el signo: "$450" se lee mejor
  // que "-$450" debajo de esa etiqueta.
  const totalPasivos = useMemo(
    () => -pasivos.reduce((s, c) => s + c.balanceMinor, 0), [pasivos],
  );
  const patrimonio = useMemo(() => calcularPatrimonio(accounts), [accounts]);

  const abrirNueva = () => { setEditando(null); setAbierta(true); };
  const abrirEdicion = (c: Account) => { setEditando(c); setAbierta(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold txt">Cuentas</h1>
        <Boton onClick={abrirNueva} className="px-3">
          <Icono nombre="plus" size={17} /> Nueva
        </Boton>
      </div>

      {activas.length === 0 ? (
        <Tarjeta>
          <Vacio
            icono="wallet"
            titulo="Sin cuentas todavía"
            texto="Creá una cuenta para empezar a registrar movimientos: efectivo, banco, tarjeta."
            accion={<Boton onClick={abrirNueva}>Crear la primera</Boton>}
          />
        </Tarjeta>
      ) : (
        <>
          <Tarjeta>
            <p className="text-xs txt-2 mb-1">Patrimonio neto</p>
            <p className="text-3xl font-bold tabular txt mb-4">{formatMonto(patrimonio, moneda)}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs txt-3 mb-0.5">Tenés</p>
                <p className="font-semibold tabular text-marca-600 dark:text-marca-500">
                  {formatMonto(totalActivos, moneda)}
                </p>
              </div>
              <div>
                <p className="text-xs txt-3 mb-0.5">Debes</p>
                <p className="font-semibold tabular text-red-500">
                  {formatMonto(totalPasivos, moneda)}
                </p>
              </div>
            </div>
          </Tarjeta>

          {activos.length > 0 && (
            <Grupo titulo="Lo que tenés" cuentas={activos} alTocar={abrirEdicion} members={members} />
          )}
          {pasivos.length > 0 && (
            <Grupo titulo="Lo que debes" cuentas={pasivos} alTocar={abrirEdicion} members={members} />
          )}
          {archivadas.length > 0 && (
            <Grupo titulo="Archivadas" cuentas={archivadas} alTocar={abrirEdicion} members={members} />
          )}
        </>
      )}

      <FormularioCuenta
        abierta={abierta}
        alCerrar={() => setAbierta(false)}
        editando={editando}
      />
    </div>
  );
}

function Grupo({ titulo, cuentas, alTocar, members }: {
  titulo: string;
  cuentas: Account[];
  alTocar: (c: Account) => void;
  members: { id: string; displayName: string }[];
}) {
  return (
    <Tarjeta className="py-3">
      <p className="text-xs font-medium txt-3 px-1 mb-1">{titulo}</p>
      <div className="divide-y divide-[var(--borde)] -mx-1">
        {cuentas.map((c) => {
          const dueno = c.owner === 'compartida'
            ? 'Compartida'
            : members.find((m) => m.id === c.owner)?.displayName ?? 'Personal';

          return (
            <button
              key={c.id}
              onClick={() => alTocar(c)}
              className="w-full flex items-center gap-3 py-3 px-1 text-left active:opacity-60 transition-opacity"
            >
              <Ficha color={c.color} icono={c.icon} size={40} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium txt truncate">{c.name}</p>
                <p className="text-xs txt-3 truncate">
                  {ACCOUNT_CATEGORY_LABEL[c.category]} · {dueno}
                </p>
              </div>
              <p className={cn(
                'text-sm font-semibold tabular shrink-0',
                c.balanceMinor < 0 ? 'text-red-500' : 'txt',
              )}>
                {formatMonto(c.balanceMinor, c.currency)}
              </p>
            </button>
          );
        })}
      </div>
    </Tarjeta>
  );
}

function FormularioCuenta({ abierta, alCerrar, editando }: {
  abierta: boolean; alCerrar: () => void; editando: Account | null;
}) {
  const { household, members, guardarCuenta, archivarCuenta, avisar } = useStore();
  const moneda = household?.currency ?? 'USD';

  const [name, setName] = useState('');
  const [category, setCategory] = useState<AccountCategory>(AccountCategory.EFECTIVO);
  const [saldoTexto, setSaldoTexto] = useState('');
  const [color, setColor] = useState(COLORES[0]);
  const [owner, setOwner] = useState('compartida');
  const [guardando, setGuardando] = useState(false);

  // Recarga los campos cada vez que se abre.
  useMemo(() => {
    if (!abierta) return;
    if (editando) {
      setName(editando.name);
      setCategory(editando.category);
      setSaldoTexto(montoPlano(editando.initialBalanceMinor, moneda));
      setColor(editando.color);
      setOwner(editando.owner);
    } else {
      setName('');
      setCategory(AccountCategory.EFECTIVO);
      setSaldoTexto('');
      setColor(COLORES[0]);
      setOwner('compartida');
    }
  }, [abierta, editando, moneda]);

  const saldoMinor = parseMonto(saldoTexto || '0', moneda) ?? 0;

  async function guardar() {
    if (!name.trim()) return;
    setGuardando(true);
    try {
      await guardarCuenta({
        name: name.trim(),
        category,
        currency: moneda,
        initialBalanceMinor: saldoMinor,
        color,
        icon: ICONOS[category],
        owner,
      }, editando?.id);
      alCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function archivar() {
    if (!editando) return;
    setGuardando(true);
    try {
      await archivarCuenta(editando.id);
      alCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo archivar');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo={editando ? 'Editar cuenta' : 'Nueva cuenta'}>
      <div className="space-y-4">
        <Campo
          etiqueta="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Efectivo, Banco, Visa..."
        />

        <Selector
          etiqueta="Tipo"
          value={category}
          onChange={(e) => setCategory(Number(e.target.value) as AccountCategory)}
        >
          {Object.values(AccountCategory).map((c) => (
            <option key={c} value={c}>{ACCOUNT_CATEGORY_LABEL[c]}</option>
          ))}
        </Selector>

        {!esActivo(category) && (
          <p className="text-xs txt-3 px-1 -mt-2">
            Es una cuenta de deuda: lo que gastes con ella deja el saldo en
            negativo y resta del patrimonio.
          </p>
        )}

        <Campo
          etiqueta={editando ? 'Saldo inicial' : 'Saldo actual'}
          value={saldoTexto}
          onChange={(e) => setSaldoTexto(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
        />
        {editando && (
          <p className="text-xs txt-3 px-1 -mt-2">
            El saldo que se muestra es este más todos los movimientos. Cambialo
            solo si el saldo de origen estaba mal.
          </p>
        )}

        {members.length > 1 && (
          <Selector etiqueta="De quién es" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="compartida">Compartida</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.displayName}</option>
            ))}
          </Selector>
        )}

        <div>
          <span className="block text-xs font-medium txt-2 mb-2">Color</span>
          <div className="flex gap-2 flex-wrap">
            {COLORES.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                className="w-10 h-10 rounded-xl transition-transform active:scale-95 flex items-center justify-center"
                style={{ background: `${c}26`, outline: color === c ? `2px solid ${c}` : 'none' }}
              >
                <span className="w-5 h-5 rounded-lg" style={{ background: c }} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          {editando && !editando.archived && (
            <Boton variante="secundario" onClick={() => void archivar()} disabled={guardando}>
              Archivar
            </Boton>
          )}
          <Boton
            onClick={() => void guardar()}
            disabled={!name.trim() || guardando}
            className="flex-1 min-h-12"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

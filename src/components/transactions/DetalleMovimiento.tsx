/**
 * Detalle de un movimiento.
 *
 * Tocar un movimiento abre esto, no el formulario de edicion. La razon es que
 * el gesto mas comun por lejos es MIRAR ("¿de cuánto fue el super?"), no
 * corregir. Abrir el formulario directo dejaba a la persona dentro de campos
 * editables sin quererlo, con el riesgo de tocar algo sin darse cuenta.
 *
 * Editar y borrar siguen a un toque de distancia, pero son deliberados.
 */

import { useStore } from '../../store/store.tsx';
import { formatMonto } from '@shared/money';
import { TX_TYPE_LABEL, TxType, type Transaction } from '@shared/types';
import { fechaLarga } from '../../lib/utils.ts';
import { Avatar, Boton, Ficha, Hoja, Icono } from '../ui/base.tsx';
import { useConfirmar } from '../ui/confirmar.tsx';
import { etiquetaCuenta } from './CargaRapida.tsx';
import { cn } from '../../lib/utils.ts';

export function DetalleMovimiento({ tx, alCerrar, alEditar }: {
  tx: Transaction | null;
  alCerrar: () => void;
  alEditar: (tx: Transaction) => void;
}) {
  const {
    categoriaPorId, accounts, jars, members, household, recurring, borrarTx, avisar,
  } = useStore();
  const confirmar = useConfirmar();
  const moneda = household?.currency ?? 'USD';

  if (!tx) return null;

  const cat = categoriaPorId(tx.categoryId);
  const cuenta = accounts.find((c) => c.id === tx.accountId);
  const destino = accounts.find((c) => c.id === tx.destAccountId);
  const jarra = jars.find((j) => j.id === tx.jarId);
  const cargo = members.find((m) => m.id === tx.createdBy);
  const hizo = members.find((m) => m.id === (tx.paidBy ?? tx.createdBy));
  const pago = recurring.find((r) => r.id === tx.recurringId);

  const esIngreso = tx.type === TxType.INGRESO;
  const esTransferencia = tx.type === TxType.TRANSFERENCIA;
  const color = esTransferencia ? '#3b82f6' : esIngreso ? '#10b981' : (cat?.color ?? '#64748b');

  /**
   * El codigo al portapapeles, para poder pegarlo en un chat.
   *
   * Si el navegador no deja copiar —pasa fuera de HTTPS— el aviso igual dice
   * el codigo, que es lo unico que de verdad hacia falta.
   */
  async function copiarCodigo() {
    if (!tx?.code) return;
    try {
      await navigator.clipboard.writeText(tx.code);
      avisar(`Código ${tx.code} copiado`, 'ok');
    } catch {
      avisar(`El código es ${tx.code}`);
    }
  }

  async function eliminar() {
    if (!tx) return;
    const ok = await confirmar({
      titulo: '¿Borrar este movimiento?',
      detalle: `"${tx.description}" por ${formatMonto(tx.amountMinor, moneda)}. Los saldos se recalculan solos.`,
      destructivo: true,
    });
    if (!ok) return;

    try {
      await borrarTx(tx.id);
      alCerrar();
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'No se pudo borrar');
    }
  }

  return (
    <Hoja abierta alCerrar={alCerrar} titulo="Movimiento">
      <div className="space-y-5">
        {/* El monto, bien grande: es lo que se viene a mirar. */}
        <div className="flex flex-col items-center text-center pt-1">
          <Ficha
            color={color}
            icono={esTransferencia ? 'arrow-left-right' : (cat?.icon ?? (esIngreso ? 'arrow-up-right' : 'arrow-down-left'))}
            size={56}
          />
          <p className={cn(
            'text-4xl font-bold tabular mt-3.5',
            esIngreso ? 'text-marca-600 dark:text-marca-500' : 'txt',
          )}>
            {esTransferencia ? '' : esIngreso ? '+' : '−'}
            {formatMonto(tx.amountMinor, moneda)}
          </p>
          <p className="t-seccion font-medium txt mt-1.5">{tx.description}</p>
          <p className="t-nota txt-3 mt-0.5">{fechaLarga(tx.date)}</p>
        </div>

        <div className="superficie-2 rounded-2xl divide-y divide-[var(--borde)]">
          <Dato etiqueta="Tipo" valor={TX_TYPE_LABEL[tx.type]} />
          {cat && <Dato etiqueta="Categoría" valor={cat.name} color={cat.color} icono={cat.icon} />}
          {cuenta && (
            <Dato
              etiqueta={esTransferencia ? 'Desde' : 'Cuenta'}
              valor={etiquetaCuenta(cuenta, members)}
              color={cuenta.color}
              icono={cuenta.icon}
            />
          )}
          {destino && (
            <Dato etiqueta="Hacia" valor={etiquetaCuenta(destino, members)} color={destino.color} icono={destino.icon} />
          )}
          {jarra && <Dato etiqueta="Jarra" valor={jarra.name} color={jarra.color} icono={jarra.icon} />}
          {tx.distributeToJars && <Dato etiqueta="Jarras" valor="Repartido entre todas" />}

          {hizo && (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="t-fila txt-2 shrink-0">Lo hizo</span>
              <span className="flex items-center gap-2 min-w-0">
                <Avatar nombre={hizo.displayName} color={hizo.color} emoji={hizo.emoji} size={22} />
                <span className="t-fila font-medium txt truncate">{hizo.displayName}</span>
              </span>
            </div>
          )}

          {/* Solo se muestra si difiere: si son la misma persona, decirlo dos
              veces es ruido. */}
          {cargo && hizo && cargo.id !== hizo.id && (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="t-fila txt-2 shrink-0">Lo cargó</span>
              <span className="flex items-center gap-2 min-w-0">
                <Avatar nombre={cargo.displayName} color={cargo.color} emoji={cargo.emoji} size={22} />
                <span className="t-fila font-medium txt truncate">{cargo.displayName}</span>
              </span>
            </div>
          )}

          {pago && <Dato etiqueta="Pago habitual" valor={pago.name} color="#8b5cf6" icono="repeat" />}
          {tx.notes && <Dato etiqueta="Notas" valor={tx.notes} />}

          {/* El nombre con el que se puede hablar de este movimiento.
              Va último porque no se mira todos los días: se viene a buscar
              cuando hay que decirle a alguien —o a un asistente— cuál de los
              sesenta movimientos del mes es el que salió mal.

              Vacío solo mientras el alta viaja al servidor, que es quien lo
              asigna, y en ese rato la fila no se dibuja: prometer un código
              que todavía no existe sería peor que esperar dos segundos. */}
          {tx.code && (
            <button
              onClick={() => void copiarCodigo()}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left active:opacity-60 transition-opacity"
            >
              <span className="t-fila txt-2 shrink-0">Código</span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="t-fila font-semibold txt tabular tracking-[0.18em]">
                  {tx.code}
                </span>
                <Icono nombre="copy" size={14} />
              </span>
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Boton variante="peligro" onClick={() => void eliminar()} className="px-4" aria-label="Borrar">
            <Icono nombre="trash-2" size={17} />
          </Boton>
          <Boton onClick={() => alEditar(tx)} className="flex-1 min-h-12">
            <Icono nombre="pencil" size={17} /> Editar
          </Boton>
        </div>
      </div>
    </Hoja>
  );
}

function Dato({ etiqueta, valor, color, icono }: {
  etiqueta: string; valor: string; color?: string; icono?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="t-fila txt-2 shrink-0">{etiqueta}</span>
      <span className="flex items-center gap-2 min-w-0">
        {icono && color && (
          <span
            className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: `${color}26`, color }}
          >
            <Icono nombre={icono} size={12} />
          </span>
        )}
        <span className="t-fila font-medium txt truncate text-right">{valor}</span>
      </span>
    </div>
  );
}

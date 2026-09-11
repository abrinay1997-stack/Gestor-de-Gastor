/**
 * Armazon de la app. Conserva la estructura del repo original —barra inferior
 * en celular, barra lateral en pantalla grande— porque es la parte que
 * funcionaba bien, con tres arreglos:
 *
 * - La barra inferior respeta el area segura del iPhone (antes se metia debajo
 *   del indicador de inicio).
 * - Cada destino es un boton de 44px minimo, el tamaño que se puede tocar sin
 *   errar con el pulgar.
 * - Un indicador de conexion muestra si el tiempo real esta andando y si la
 *   otra persona esta mirando la app en este momento.
 */

import { type ReactNode } from 'react';
import { LogOut, Plus } from 'lucide-react';
import { useStore } from '../../store/store.tsx';
import { cn } from '../../lib/utils.ts';
import { Avatar, Icono } from '../ui/base.tsx';

export type Solapa = 'inicio' | 'cuentas' | 'jarras' | 'movimientos' | 'analisis' | 'ajustes';

const DESTINOS: { id: Solapa; etiqueta: string; icono: string; enBarra: boolean }[] = [
  { id: 'inicio', etiqueta: 'Inicio', icono: 'house', enBarra: true },
  { id: 'movimientos', etiqueta: 'Movimientos', icono: 'receipt-text', enBarra: true },
  { id: 'jarras', etiqueta: 'Jarras', icono: 'piggy-bank', enBarra: true },
  { id: 'cuentas', etiqueta: 'Cuentas', icono: 'wallet', enBarra: true },
  { id: 'analisis', etiqueta: 'Analisis', icono: 'chart-pie', enBarra: false },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: 'settings', enBarra: true },
];

export function AppLayout({ solapa, alCambiar, alAgregar, children }: {
  solapa: Solapa;
  alCambiar: (s: Solapa) => void;
  alAgregar: () => void;
  children: ReactNode;
}) {
  const { me, members, online, estadoLive, salir } = useStore();

  const pareja = members.find((m) => m.id !== me?.id);
  const parejaEnLinea = pareja ? online.includes(pareja.id) : false;
  const enBarra = DESTINOS.filter((d) => d.enBarra);

  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      {/* Barra lateral, solo en pantalla grande */}
      <aside className="hidden md:flex flex-col w-60 superficie borde border-r p-5 sticky top-0 h-dvh shrink-0">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-marca-500 text-white rounded-xl flex items-center justify-center">
            <Icono nombre="wallet" size={18} />
          </div>
          <span className="font-semibold txt">Nuestros gastos</span>
        </div>

        <nav className="flex-1 space-y-1">
          {DESTINOS.map((d) => (
            <button
              key={d.id}
              onClick={() => alCambiar(d.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-medium transition-colors',
                solapa === d.id ? 'bg-marca-50 text-marca-700 dark:bg-marca-500/15 dark:text-marca-500' : 'txt-2 hover:superficie-2',
              )}
            >
              <Icono nombre={d.icono} size={18} />
              {d.etiqueta}
            </button>
          ))}
        </nav>

        <button
          onClick={alAgregar}
          className="mt-6 bg-marca-600 hover:bg-marca-700 text-white min-h-12 rounded-2xl font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <Plus size={18} /> Registrar
        </button>

        <div className="mt-6 pt-5 borde border-t">
          <EstadoConexion estado={estadoLive} pareja={pareja?.displayName} enLinea={parejaEnLinea} />
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar nombre={me?.displayName ?? '?'} color={me?.color ?? '#10b981'} size={30} />
              <span className="text-sm font-medium txt truncate">{me?.displayName}</span>
            </div>
            <button
              onClick={() => void salir()}
              aria-label="Cerrar sesion"
              className="txt-3 hover:txt-2 p-2"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* Contenido */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-4 pb-28 md:pb-8 md:px-8 md:pt-8">
        {/* Encabezado movil */}
        <div className="md:hidden flex items-center justify-between mb-4 safe-top">
          <EstadoConexion estado={estadoLive} pareja={pareja?.displayName} enLinea={parejaEnLinea} />
          <div className="flex items-center gap-2">
            {pareja && (
              <div className="relative">
                <Avatar nombre={pareja.displayName} color={pareja.color} size={30} />
                {parejaEnLinea && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-marca-500 ring-2 ring-[var(--fondo)]" />
                )}
              </div>
            )}
            <Avatar nombre={me?.displayName ?? '?'} color={me?.color ?? '#10b981'} size={30} />
          </div>
        </div>

        {children}
      </main>

      {/* Boton flotante, solo en celular */}
      <button
        onClick={alAgregar}
        aria-label="Registrar movimiento"
        className="md:hidden fixed right-4 bottom-24 w-14 h-14 rounded-2xl bg-marca-600 text-white shadow-lg shadow-marca-600/30 flex items-center justify-center active:scale-95 transition-transform z-30"
      >
        <Plus size={26} />
      </button>

      {/* Barra inferior, solo en celular */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 superficie borde border-t flex safe-bottom z-30">
        {enBarra.map((d) => (
          <button
            key={d.id}
            onClick={() => alCambiar(d.id)}
            aria-current={solapa === d.id ? 'page' : undefined}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-14 pt-1.5 transition-colors',
              solapa === d.id ? 'text-marca-600 dark:text-marca-500' : 'txt-3',
            )}
          >
            <Icono nombre={d.icono} size={21} />
            <span className="text-[10px] font-medium">{d.etiqueta}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/**
 * Estado de la conexion. Mas util de lo que parece: dice si lo que se carga
 * esta llegando al otro telefono, y si la otra persona esta mirando ahora.
 */
function EstadoConexion({ estado, pareja, enLinea }: {
  estado: string; pareja?: string; enLinea: boolean;
}) {
  if (estado !== 'conectado') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs txt-3">
        <span className={cn('w-1.5 h-1.5 rounded-full', estado === 'conectando' ? 'bg-amber-500 animate-pulse' : 'bg-stone-400')} />
        {estado === 'conectando' ? 'Conectando...' : 'Sin conexion'}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs txt-3">
      <span className="w-1.5 h-1.5 rounded-full bg-marca-500" />
      {enLinea && pareja ? `${pareja} esta en linea` : 'En vivo'}
    </span>
  );
}

/**
 * Primitivas visuales. Todas pensadas para el pulgar: nada de blancos de
 * menos de 44px, que es el minimo que recomienda Apple para tocar sin errar.
 */

import {
  type ButtonHTMLAttributes, type ComponentPropsWithRef, type CSSProperties, type ReactNode,
} from 'react';
import { cn } from '../../lib/utils.ts';
import { X } from 'lucide-react';
import { GRUPOS_ICONO, ICONO_GENERICO, ICONOS } from './iconos.ts';

// --- iconos --------------------------------------------------------------

/**
 * Icono por nombre en kebab-case ('piggy-bank'), buscado en el registro
 * explicito de ./iconos.ts. Si el nombre no esta, cae en uno generico en vez
 * de romper la pantalla: los nombres vienen de la base y pueden quedar viejos.
 */
export function Icono({ nombre, size = 20, className, style }: {
  nombre: string; size?: number; className?: string; style?: CSSProperties;
}) {
  const Comp = ICONOS[nombre] ?? ICONO_GENERICO;
  return <Comp size={size} className={className} style={style} />;
}

// --- boton ---------------------------------------------------------------

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';

export function Boton({
  variante = 'primario', className, children, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton }) {
  const estilos: Record<VarianteBoton, string> = {
    primario: 'bg-marca-600 text-white border border-white/15 shadow-md shadow-marca-600/30 hover:brightness-110 active:bg-marca-700 active:brightness-100',
    secundario: 'superficie-2 txt borde border shadow-sm hover:brightness-95 dark:hover:brightness-125 active:brightness-95',
    fantasma: 'txt-2 hover:superficie-2',
    peligro: 'bg-red-600 text-white border border-white/15 shadow-md shadow-red-600/25 hover:brightness-110 active:bg-red-700 active:brightness-100',
  };

  return (
    <button
      {...props}
      className={cn(
        'min-h-11 px-4 rounded-2xl font-semibold text-sm transition-all duration-100',
        'active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
        'flex items-center justify-center gap-2 select-none touch-manipulation',
        estilos[variante],
        className,
      )}
    >
      {children}
    </button>
  );
}

// --- campos --------------------------------------------------------------

export function Campo({
  etiqueta, error, className, ...props
}: ComponentPropsWithRef<'input'> & { etiqueta?: string; error?: string }) {
  return (
    <label className="block">
      {etiqueta && <span className="block text-xs font-medium txt-2 mb-1.5">{etiqueta}</span>}
      <input
        {...props}
        className={cn(
          'w-full min-h-11 px-3.5 rounded-2xl superficie-2 borde border txt shadow-[inset_0_1px_2px_rgb(0_0_0/0.05)]',
          // 16px es el minimo que evita que iOS haga zoom al enfocar.
          'text-base outline-none transition-all duration-100',
          'focus:border-marca-500 focus:ring-4 focus:ring-marca-500/15',
          'placeholder:txt-3',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-500/20',
          className,
        )}
      />
      {error && <span className="block text-xs text-red-500 mt-1">{error}</span>}
    </label>
  );
}

export function Selector({
  etiqueta, className, children, ...props
}: ComponentPropsWithRef<'select'> & { etiqueta?: string }) {
  return (
    <label className="block">
      {etiqueta && <span className="block text-xs font-medium txt-2 mb-1.5">{etiqueta}</span>}
      <select
        {...props}
        className={cn(
          'w-full min-h-11 px-3.5 rounded-2xl superficie-2 borde border txt text-base shadow-[inset_0_1px_2px_rgb(0_0_0/0.05)]',
          'outline-none transition-all duration-100 focus:border-marca-500 focus:ring-4 focus:ring-marca-500/15',
          className,
        )}
      >
        {children}
      </select>
    </label>
  );
}

// --- contenedores --------------------------------------------------------

export function Tarjeta({ className, children, onClick }: {
  className?: string; children: ReactNode; onClick?: () => void;
}) {
  return (
    <div className={cn('superficie borde border rounded-3xl p-5 shadow-[var(--shadow-tarjeta)]', className)} onClick={onClick}>
      {children}
    </div>
  );
}

export function Vacio({ icono, titulo, texto, accion }: {
  icono: string; titulo: string; texto: string; accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-16 h-16 rounded-3xl superficie-2 flex items-center justify-center mb-4 shadow-sm ring-1 ring-black/5 dark:ring-white/10">
        <Icono nombre={icono} size={28} className="txt-3" />
      </div>
      <h3 className="font-semibold txt tracking-tight text-balance mb-1.5">{titulo}</h3>
      <p className="text-sm txt-2 max-w-xs leading-relaxed text-balance mb-5">{texto}</p>
      {accion}
    </div>
  );
}

/**
 * Barra de progreso.
 *
 * Con `alerta` (presupuestos) el color no salta de golpe: vira gradualmente
 * hacia el rojo a medida que se acerca al tope. Un salto binario avisa cuando
 * ya es tarde; el degradado deja verlo venir.
 *
 * El viraje arranca al 60% y no antes, porque gastar la mitad del presupuesto
 * a mitad de mes es exactamente lo normal y pintarlo de amarillo seria mentir.
 */
/**
 * `alerta` y `fina` son dos barras distintas a proposito.
 *
 * Gruesa con alerta = un TOPE: cuanto queda antes de pasarse, y por eso vira a
 * rojo. Fina y tenue = una PARTE de un total: cuanto de lo gastado se fue en
 * esto, donde no hay nada que exceder y el color es solo identidad.
 *
 * Se veian iguales, y en el Inicio quedaban pegadas: la barra roja de "Comida
 * pasandose del presupuesto" y, tres centimetros abajo, la barra roja de "la
 * categoria Comida es de color rojo". Dos rojos juntos que significaban cosas
 * distintas.
 */
export function Barra({ ratio, color = '#10b981', alerta = false, fina = false }: {
  ratio: number; color?: string; alerta?: boolean; fina?: boolean;
}) {
  const pct = Math.min(Math.max(ratio, 0), 1) * 100;
  const excedido = ratio > 1;

  let fondo = color;
  if (alerta) {
    if (excedido) {
      fondo = '#ef4444';
    } else if (ratio > 0.6) {
      // De su color al rojo, pasando por ambar. El degradado ocupa el tramo
      // final de la barra, asi que el rojo aparece en la punta que avanza.
      const avance = Math.min((ratio - 0.6) / 0.4, 1);
      const medio = mezclar(color, '#f59e0b', Math.min(avance * 2, 1));
      const punta = avance > 0.5 ? mezclar('#f59e0b', '#ef4444', (avance - 0.5) * 2) : medio;
      fondo = `linear-gradient(90deg, ${color} 0%, ${medio} 55%, ${punta} 100%)`;
    }
  } else if (excedido) {
    fondo = '#ef4444';
  }

  return (
    <div className={cn(
      'rounded-full superficie-2 overflow-hidden',
      fina ? 'h-1' : 'h-2 shadow-[inset_0_1px_2px_rgb(0_0_0/0.08)]',
    )}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: fondo,
          opacity: fina ? 0.65 : 1,
          boxShadow: fina ? undefined : 'inset 0 1px 0 rgb(255 255 255 / 0.35)',
        }}
      />
    </div>
  );
}

/** Mezcla dos colores hexadecimales. t=0 devuelve el primero, t=1 el segundo. */
function mezclar(a: string, b: string, t: number): string {
  const leer = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = leer(a);
  const [r2, g2, b2] = leer(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * Math.min(Math.max(t, 0), 1));
  return `#${[m(r1, r2), m(g1, g2), m(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Cuadrito de color con un icono adentro. Usa .ficha: el glifo se oscurece en
    claro y se aclara en oscuro para mantener ≥3:1 en los 24 colores. */
export function Ficha({ color, icono, size = 40 }: { color: string; icono: string; size?: number }) {
  return (
    <div
      className="ficha rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
      style={{ width: size, height: size, ['--c' as string]: color }}
    >
      <Icono nombre={icono} size={size * 0.5} />
    </div>
  );
}

export function Avatar({ nombre, color, emoji, size = 32 }: {
  nombre: string; color: string; emoji?: string; size?: number;
}) {
  // El emoji manda; si no hay, las iniciales. El tamaño de fuente es mayor
  // para el emoji porque las iniciales ocupan mas ancho que alto.
  const ini = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return (
    <div
      className="ficha rounded-full flex items-center justify-center font-semibold shrink-0 select-none"
      style={{
        width: size, height: size,
        ['--c' as string]: color,
        fontSize: emoji ? size * 0.55 : size * 0.38,
        lineHeight: 1,
      }}
    >
      {emoji || ini}
    </div>
  );
}

/**
 * Elegir el icono de una categoria.
 *
 * Solo ofrece los del registro explicito (ver ./iconos.ts): si dejara escribir
 * cualquier nombre, la mitad caeria en el generico porque el empaquetador solo
 * incluye los que estan declarados.
 *
 * Agrupado por tema, y sin los iconos de la interfaz. Antes mostraba el
 * registro entero, asi que para elegir "comida" habia que pasar por flechas,
 * cruces y engranajes que no representan ningun gasto.
 */
export function SelectorIcono({ valor, alElegir, color }: {
  valor: string; alElegir: (n: string) => void; color: string;
}) {
  return (
    <div className="max-h-56 overflow-y-auto sin-barra space-y-2.5">
      {GRUPOS_ICONO.map(({ grupo, iconos }) => (
        <div key={grupo}>
          <p className="text-[11px] font-medium txt-3 mb-1 px-0.5">{grupo}</p>
          <div className="grid grid-cols-8 gap-1.5">
            {iconos.map((n) => (
              <button
                key={n}
                onClick={() => alElegir(n)}
                aria-label={`Icono ${n}`}
                className={cn(
                  'aspect-square rounded-xl flex items-center justify-center transition-all duration-100 active:scale-[0.97]',
                  valor === n ? 'shadow-sm' : 'superficie-2 txt-2',
                )}
                style={valor === n
                  ? {
                    background: `color-mix(in srgb, ${color} 14%, var(--superficie))`,
                    color: `color-mix(in srgb, ${color} 70%, #1c1c1e)`,
                    boxShadow: `0 0 0 2px ${color}`,
                  }
                  : undefined}
              >
                <Icono nombre={n} size={17} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Paleta compartida por cuentas, categorias, jarras y personas.
 *
 * Ordenada por tono y no por gusto: buscando "algo verde" o "algo naranja" se
 * llega derecho, que es como se elige de verdad. Las ocho primeras de la
 * version anterior siguen estando todas, asi que lo ya elegido se sigue
 * reconociendo como propio en vez de aparecer como un color suelto.
 *
 * Ninguna es tan oscura como para perderse contra el fondo negro ni tan clara
 * como para perderse contra el blanco: se usan de relleno al 15% y tambien
 * como punto solido.
 */
export const COLORES = [
  '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316',
  '#ef4444', '#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6',
  '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#059669',
  '#b45309', '#92400e', '#be123c', '#0369a1', '#78716c', '#64748b',
] as const;

export function SelectorColor({ valor, alElegir }: {
  valor: string; alElegir: (c: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {COLORES.map((c) => (
        <button
          key={c}
          onClick={() => alElegir(c)}
          aria-label={`Color ${c}`}
          className="w-9 h-9 rounded-xl transition-all duration-100 active:scale-[0.97] flex items-center justify-center shadow-sm"
          style={{ background: `color-mix(in srgb, ${c} 15%, var(--superficie))`, outline: valor === c ? `2px solid ${c}` : 'none' }}
        >
          <span className="w-4.5 h-4.5 rounded-lg shadow-sm" style={{ background: c }} />
        </button>
      ))}
    </div>
  );
}

/** Hoja que sube desde abajo. El patron nativo en celular. */
export function Hoja({ abierta, alCerrar, titulo, children }: {
  abierta: boolean; alCerrar: () => void; titulo: string; children: ReactNode;
}) {
  if (!abierta) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <div
        className="hoja-scrim absolute inset-0"
        onClick={alCerrar}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={cn(
          'relative w-full sm:max-w-lg superficie borde border rounded-t-3xl sm:rounded-3xl',
          'max-h-[92vh] overflow-y-auto sin-barra safe-bottom shadow-[var(--shadow-flotante)]',
          'animate-[subir_.22s_cubic-bezier(.32,.72,0,1)]',
        )}
      >
        {/* Agarradera: indica que se puede arrastrar para cerrar. */}
        <div className="sticky top-0 superficie pt-2.5 pb-3 px-5 z-10 rounded-t-3xl">
          <div className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20 mx-auto mb-3 sm:hidden" />
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg txt tracking-tight">{titulo}</h2>
            <button
              onClick={alCerrar}
              aria-label="Cerrar"
              className="w-9 h-9 rounded-full superficie-2 text-base flex items-center justify-center txt-2 active:scale-[0.97] active:brightness-95 transition-all duration-100"
              style={{ fontSize: 16 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>

      <style>{`@keyframes subir { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
    </div>
  );
}

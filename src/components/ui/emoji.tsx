/**
 * Elegir un emoji. Se usa para el avatar de la persona.
 *
 * Lista curada en vez del teclado de emojis del sistema: en un avatar de 40
 * pixeles la mayoria no se distingue, y elegir entre miles cansa mas de lo que
 * ayuda. Estos se leen bien en chico.
 */

import { cn } from '../../lib/utils.ts';

const EMOJIS = [
  '🦊', '🐱', '🐶', '🐼', '🦁', '🐧', '🦉', '🐢',
  '🌿', '🌻', '🌊', '🔥', '⭐', '🌙', '☀️', '🍀',
  '🎸', '🎨', '📚', '⚽', '🏀', '🎮', '🍕', '☕',
  '🚀', '💎', '🎯', '🧩', '🎧', '✈️', '🏔️', '🧿',
];

export function SelectorEmoji({ valor, alElegir, color }: {
  valor: string;
  alElegir: (emoji: string) => void;
  color: string;
}) {
  return (
    <div className="grid grid-cols-8 gap-1.5">
      {/* Sin emoji = vuelve a las iniciales. */}
      <button
        onClick={() => alElegir('')}
        aria-label="Sin emoji, usar iniciales"
        className={cn(
          'aspect-square rounded-xl flex items-center justify-center text-[11px] font-semibold transition-transform active:scale-90',
          valor === '' ? 'text-white' : 'superficie-2 txt-3',
        )}
        style={valor === '' ? { background: color } : undefined}
      >
        Aa
      </button>

      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => alElegir(e)}
          aria-label={`Elegir ${e}`}
          className={cn(
            'aspect-square rounded-xl flex items-center justify-center text-lg transition-transform active:scale-90',
            valor === e ? 'ring-2' : 'superficie-2',
          )}
          style={valor === e ? { background: `${color}26`, boxShadow: `0 0 0 2px ${color}` } : undefined}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

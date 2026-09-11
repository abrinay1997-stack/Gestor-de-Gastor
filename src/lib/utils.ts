import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases de Tailwind resolviendo conflictos (la ultima gana). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

/** Fecha corta y legible: "Hoy", "Ayer", "12 mar". */
export function fechaCorta(epoch: number): string {
  const d = new Date(epoch);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (mismoDia(d, hoy)) return 'Hoy';
  if (mismoDia(d, ayer)) return 'Ayer';

  return d.toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "12 de marzo, 14:30" */
export const fechaLarga = (epoch: number): string =>
  new Date(epoch).toLocaleString('es', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });

/** Nombre del mes a partir de YYYY-MM: "marzo 2026". */
export function nombreMes(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es', { month: 'long', year: 'numeric' });
}

/** Valor de un <input type="date"> a partir de un epoch. */
export function aInputDate(epoch: number): string {
  const d = new Date(epoch);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Epoch al mediodia local, para que el dia no se corra por zona horaria. */
export function deInputDate(valor: string): number {
  const [y, m, d] = valor.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

/** Mes anterior/siguiente en formato YYYY-MM. */
export function moverMes(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Iniciales para el avatar: "Ana Lopez" -> "AL". */
export const iniciales = (nombre: string): string =>
  nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

/** Vibracion corta al confirmar algo, donde el dispositivo la soporte. */
export function vibrar(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // No todos los navegadores la exponen; es un adorno, no falla nada.
  }
}

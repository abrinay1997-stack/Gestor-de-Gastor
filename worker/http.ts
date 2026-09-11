/**
 * Utilidades HTTP y validacion de entrada.
 *
 * Todo lo que llega del cliente se valida aca antes de tocar la base. Los
 * tipos de TypeScript no existen en runtime: si no se chequea, no esta
 * chequeado.
 */

import type { Env } from './env.ts';
import type { LiveEvent } from '../shared/types.ts';

export const json = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...init.headers },
  });

export const error = (mensaje: string, status = 400): Response =>
  json({ error: mensaje }, { status });

export class ErrorValidacion extends Error {}

// Declaracion de funcion, no arrow: TypeScript solo propaga el `never` (y por
// lo tanto estrecha el tipo despues de llamarla) si el nombre esta declarado
// asi.
function falla(msg: string): never {
  throw new ErrorValidacion(msg);
}

export function texto(v: unknown, campo: string, opciones: { max?: number; min?: number } = {}): string {
  if (typeof v !== 'string') falla(`${campo} debe ser texto`);
  const s = (v as string).trim();
  const { max = 200, min = 0 } = opciones;
  if (s.length < min) falla(`${campo} no puede estar vacio`);
  if (s.length > max) falla(`${campo} supera los ${max} caracteres`);
  return s;
}

export function textoOpcional(v: unknown, campo: string, max = 1000): string | null {
  if (v === null || v === undefined || v === '') return null;
  return texto(v, campo, { max });
}

/**
 * Entero seguro. Rechaza floats explicitamente: si llega 12.5 en un campo de
 * centavos es que alguien mando pesos en lugar de centavos, y redondear en
 * silencio esconderia el bug.
 */
export function entero(v: unknown, campo: string, opciones: { min?: number; max?: number } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) falla(`${campo} debe ser un numero`);
  if (!Number.isInteger(v)) falla(`${campo} debe ser un entero en centavos, no un decimal`);
  if (!Number.isSafeInteger(v)) falla(`${campo} esta fuera del rango seguro`);

  const { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = opciones;
  if (v < min) falla(`${campo} no puede ser menor que ${min}`);
  if (v > max) falla(`${campo} no puede ser mayor que ${max}`);
  return v;
}

export function booleano(v: unknown): boolean {
  return v === true || v === 1;
}

export function unoDe<T extends string | number>(v: unknown, validos: readonly T[], campo: string): T {
  if (!validos.includes(v as T)) {
    falla(`${campo} debe ser uno de: ${validos.join(', ')}`);
  }
  return v as T;
}

export function idOpcional(v: unknown, campo: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  return texto(v, campo, { max: 64, min: 1 });
}

/** Color hexadecimal, para no guardar cualquier cosa que despues rompa el CSS. */
export function color(v: unknown, porDefecto = '#10b981'): string {
  if (typeof v !== 'string') return porDefecto;
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : porDefecto;
}

export function periodo(v: unknown, campo: string): string {
  const s = texto(v, campo, { max: 7, min: 7 });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) falla(`${campo} debe tener formato YYYY-MM`);
  return s;
}

export function email(v: unknown): string {
  const s = texto(v, 'email', { max: 254, min: 3 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) falla('El email no tiene un formato valido');
  return s;
}

export function password(v: unknown): string {
  if (typeof v !== 'string') falla('La contraseña debe ser texto');
  const s = v as string;
  if (s.length < 8) falla('La contraseña necesita al menos 8 caracteres');
  if (s.length > 200) falla('La contraseña es demasiado larga');
  return s;
}

export async function cuerpo(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new ErrorValidacion('Se esperaba un objeto JSON');
    }
    return data as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ErrorValidacion) throw e;
    throw new ErrorValidacion('El cuerpo no es JSON valido');
  }
}

/**
 * Avisa al Durable Object del hogar para que reparta el cambio.
 * Nunca hace fallar la operacion: si el reparto no sale, el dato ya quedo
 * guardado y el otro dispositivo lo vera al reconectar o al refrescar.
 */
export async function difundir(
  env: Env, householdId: string, evento: LiveEvent,
): Promise<void> {
  try {
    const id = env.HUB.idFromName(householdId);
    await env.HUB.get(id).fetch('https://hub/broadcast', {
      method: 'POST',
      body: JSON.stringify(evento),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('No se pudo difundir el evento', e);
  }
}

export const ahora = (): number => Date.now();
export const nuevoId = (): string => crypto.randomUUID();

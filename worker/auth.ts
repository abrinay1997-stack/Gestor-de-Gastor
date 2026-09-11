/**
 * Autenticacion propia. Sin Google, sin Firebase, sin terceros.
 *
 * - Contraseñas: PBKDF2-SHA256 con sal por persona, via WebCrypto (nativo del
 *   runtime de Workers, sin dependencias).
 * - Sesion: token aleatorio de 256 bits en cookie HttpOnly + Secure +
 *   SameSite=Lax. En la base solo se guarda el SHA-256 del token, nunca el
 *   token: si alguien leyera la base, no podria hacerse pasar por nadie.
 */

import type { Env } from './env.ts';

/**
 * 210.000 iteraciones es la recomendacion de OWASP para PBKDF2-SHA256.
 * Se guarda junto al hash para poder subirlo mas adelante sin invalidar las
 * contraseñas existentes.
 */
const ITERACIONES = 210_000;
const DURACION_SESION_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias
export const COOKIE = 'gg_session';

const enc = new TextEncoder();

const aHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function bytesAleatorios(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export async function hashearPassword(
  password: string,
  saltHex?: string,
  iteraciones = ITERACIONES,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = saltHex ?? aHex(bytesAleatorios(16).buffer);
  const saltBytes = Uint8Array.from(salt.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iteraciones },
    key,
    256,
  );

  return { hash: aHex(bits), salt, iterations: iteraciones };
}

/**
 * Compara en tiempo constante. Un `===` comun corta en el primer byte
 * distinto, y esa diferencia de tiempo filtra informacion del hash.
 */
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function verificarPassword(
  password: string,
  hashGuardado: string,
  salt: string,
  iteraciones: number,
): Promise<boolean> {
  const { hash } = await hashearPassword(password, salt, iteraciones);
  return igualSeguro(hash, hashGuardado);
}

export async function sha256Hex(texto: string): Promise<string> {
  return aHex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

export interface Sesion {
  memberId: string;
  householdId: string;
  email: string;
  displayName: string;
  color: string;
}

export async function crearSesion(
  env: Env,
  memberId: string,
  userAgent: string | null,
): Promise<string> {
  const token = aHex(bytesAleatorios(32).buffer);
  const ahora = Date.now();

  await env.DB.prepare(
    `INSERT INTO session (token_hash, member_id, created_at, expires_at, user_agent)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(await sha256Hex(token), memberId, ahora, ahora + DURACION_SESION_MS, userAgent)
    .run();

  return token;
}

export function leerCookie(req: Request, nombre: string): string | null {
  const cookies = req.headers.get('Cookie');
  if (!cookies) return null;

  for (const parte of cookies.split(';')) {
    const [k, ...resto] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(resto.join('='));
  }
  return null;
}

export function cookieDeSesion(token: string, seguro: boolean): string {
  const attrs = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(DURACION_SESION_MS / 1000)}`,
  ];
  // Secure rompe el desarrollo local en http://localhost, por eso es condicional.
  if (seguro) attrs.push('Secure');
  return attrs.join('; ');
}

export function cookieVacia(seguro: boolean): string {
  const attrs = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (seguro) attrs.push('Secure');
  return attrs.join('; ');
}

/** Devuelve la sesion activa, o null. Limpia sesiones vencidas al pasar. */
export async function sesionActual(req: Request, env: Env): Promise<Sesion | null> {
  const token = leerCookie(req, COOKIE);
  if (!token) return null;

  const fila = await env.DB.prepare(
    `SELECT s.expires_at, m.id AS member_id, m.household_id, m.email, m.display_name, m.color
       FROM session s
       JOIN member m ON m.id = s.member_id
      WHERE s.token_hash = ?1`,
  )
    .bind(await sha256Hex(token))
    .first<{
      expires_at: number; member_id: string; household_id: string;
      email: string; display_name: string; color: string;
    }>();

  if (!fila) return null;

  if (fila.expires_at < Date.now()) {
    await cerrarSesion(req, env);
    return null;
  }

  return {
    memberId: fila.member_id,
    householdId: fila.household_id,
    email: fila.email,
    displayName: fila.display_name,
    color: fila.color,
  };
}

export async function cerrarSesion(req: Request, env: Env): Promise<void> {
  const token = leerCookie(req, COOKIE);
  if (!token) return;
  await env.DB.prepare('DELETE FROM session WHERE token_hash = ?1')
    .bind(await sha256Hex(token))
    .run();
}

/** Borra sesiones vencidas. Se llama de vez en cuando, no en cada request. */
export async function limpiarSesiones(env: Env): Promise<void> {
  await env.DB.prepare('DELETE FROM session WHERE expires_at < ?1').bind(Date.now()).run();
}

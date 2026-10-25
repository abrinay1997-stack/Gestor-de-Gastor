/**
 * Reservar codigos de movimiento que no esten usados.
 *
 * El alfabeto, generar y normalizar viven en shared/codigo.ts, que es dominio
 * puro. Aca queda lo unico que necesita la base: comprobar que el codigo este
 * libre antes de escribirlo.
 */

import { generarCodigo } from '../shared/codigo.ts';
import type { Env } from './env.ts';

/**
 * `cuantos` codigos que hoy no esta usando nadie.
 *
 * Con 24.300.000 combinaciones y unos cientos de movimientos, chocar es
 * rarisimo; aun asi se comprueba, porque el indice unico de la migracion 0014
 * haria fallar el alta entera, y perder un movimiento por un codigo repetido
 * vale infinitamente menos que una consulta.
 *
 * Los candidatos se miran todos juntos: un lote de 100 movimientos cargados
 * sin conexion no puede costar 100 viajes a la base.
 */
export async function nuevosCodigos(env: Env, cuantos: number): Promise<string[]> {
  if (cuantos <= 0) return [];

  const listos: string[] = [];

  for (let vuelta = 0; vuelta < 5 && listos.length < cuantos; vuelta++) {
    const faltan = cuantos - listos.length;
    const candidatos = new Set<string>();
    while (candidatos.size < faltan) candidatos.add(generarCodigo());

    const lista = [...candidatos];
    const marcas = lista.map((_, i) => `?${i + 1}`).join(',');
    const { results } = await env.DB
      .prepare(`SELECT code FROM tx WHERE code IN (${marcas})`)
      .bind(...lista)
      .all<{ code: string }>();

    const tomados = new Set(results.map((r) => r.code));
    for (const c of lista) if (!tomados.has(c)) listos.push(c);
  }

  // Cinco vueltas sin encontrar un hueco no es mala suerte: es que algo anda
  // mal. Mejor que el alta falle diciendolo que guardar un movimiento mudo.
  if (listos.length < cuantos) {
    throw new Error('No se pudo generar un código único para el movimiento');
  }

  return listos;
}

/** El caso de siempre: un movimiento, un codigo. */
export async function nuevoCodigo(env: Env): Promise<string> {
  const [c] = await nuevosCodigos(env, 1);
  return c;
}

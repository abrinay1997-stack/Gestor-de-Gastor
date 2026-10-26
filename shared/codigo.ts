/**
 * El codigo corto de un movimiento.
 *
 * Cinco caracteres que identifican un movimiento y que una persona puede leer
 * en voz alta, anotar en un papel o pegar en un chat. El id de verdad sigue
 * siendo el UUID de 36 caracteres; esto es el nombre con el que se lo menciona
 * cuando hay que decir «este movimiento salio mal».
 *
 * Las tres reglas que lo definen viven en la migracion 0014 y se cumplen solas
 * por como esta guardado: es una columna de `tx`, se escribe en el INSERT,
 * ningun UPDATE la toca y el DELETE se la lleva puesta.
 *
 * Esto es la parte pura —el alfabeto, generar, normalizar—, compartida por el
 * cliente y el Worker. Reservar uno que no este usado necesita la base y vive
 * en worker/codigo.ts.
 */

/**
 * Treinta simbolos, sin los seis que se leen mal cuando alguien dicta un
 * codigo o lo copia a mano: 0 y O, 1 e I y L, y la U contra la V. Es el mismo
 * criterio de Crockford, y el mismo alfabeto que usa el relleno de la
 * migracion 0014: si uno cambia, el otro tambien.
 */
export const ALFABETO = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export const LARGO_CODIGO = 5;

/** 30^5 = 24.300.000 combinaciones. */
export const COMBINACIONES = ALFABETO.length ** LARGO_CODIGO;

/**
 * Un codigo al azar.
 *
 * `crypto.getRandomValues` en vez de `Math.random` por costumbre, no por
 * secreto: el codigo no protege nada, solo nombra. Se descartan los bytes de
 * 240 para arriba porque 256 no es multiplo de 30 y, sin eso, los ocho
 * primeros simbolos del alfabeto saldrian un 6% mas seguido que el resto.
 */
export function generarCodigo(): string {
  let out = '';
  while (out.length < LARGO_CODIGO) {
    const bytes = crypto.getRandomValues(new Uint8Array(LARGO_CODIGO));
    for (const b of bytes) {
      if (b >= 240) continue;
      out += ALFABETO[b % ALFABETO.length];
      if (out.length === LARGO_CODIGO) break;
    }
  }
  return out;
}

/**
 * Lo que tecleo o pego una persona, listo para comparar contra un codigo
 * guardado.
 *
 * Solo se arregla lo que es seguro arreglar: las mayusculas y todo lo que no
 * es letra ni numero. Eso incluye espacios y guiones, y tambien lo que se cuela
 * al copiar de un chat: comillas, los acentos graves de «`7K2MQ`», puntos y los
 * caracteres invisibles que WhatsApp o iMessage agregan sin que se vean. Antes
 * solo se quitaban espacios y guiones, y un codigo pegado con una marca
 * invisible delante no se reconocia como codigo aunque a la vista fuera
 * identico.
 *
 * Traducir los simbolos parecidos —la O por la Q, el 1 por la J— seria
 * adivinar, y adivinar mal convierte un codigo correcto en otro que existe y
 * apunta a otro movimiento. Por eso el alfabeto los evita de entrada: el
 * problema se resuelve al generar, no al leer.
 */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Si lo que se escribio puede llegar a ser un codigo. */
export function pareceCodigo(texto: string): boolean {
  const c = normalizarCodigo(texto);
  return c.length === LARGO_CODIGO && [...c].every((ch) => ALFABETO.includes(ch));
}

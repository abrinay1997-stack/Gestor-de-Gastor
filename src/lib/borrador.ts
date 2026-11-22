/**
 * Borrador del movimiento que se esta cargando.
 *
 * Un telefono puede matar la app en cuanto se sale a otra (a mirar el monto en
 * la app del banco, justamente), y al volver se arranca de cero. Sin esto,
 * cargar un movimiento obligaba a escribirlo todo de un tiron.
 *
 * Vive en este telefono y nada mas: es una comodidad de quien escribe, no un
 * dato del hogar. Si el almacenamiento no esta disponible (modo privado), la
 * app funciona igual, solo que sin red de seguridad.
 */

const CLAVE = 'gastos:borrador-movimiento';

/** Pasado este tiempo, lo que habia escrito ya no es lo que se quiere cargar. */
const VIGENCIA_MS = 12 * 60 * 60 * 1000;

export interface Borrador {
  frase: string;
  tipo: number;
  montoTexto: string;
  descripcion: string;
  accountId: string;
  destAccountId: string;
  categoryId: string;
  jarId: string;
  jarraTocada: boolean;
  budgetId: string;
  paidBy: string;
  fecha: string;
  notas: string;
  /** Si la hoja estaba abierta: al volver a la app se reabre sola. */
  abierta: boolean;
  guardadoEn: number;
}

export function leerBorrador(): Borrador | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const b = JSON.parse(crudo) as Borrador;
    if (typeof b?.guardadoEn !== 'number' || Date.now() - b.guardadoEn > VIGENCIA_MS) {
      localStorage.removeItem(CLAVE);
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

export function escribirBorrador(b: Omit<Borrador, 'guardadoEn'>): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...b, guardadoEn: Date.now() }));
  } catch {
    // Sin almacenamiento no hay borrador; el formulario sigue andando.
  }
}

/** Marca la hoja como cerrada sin perder lo escrito. */
export function cerrarBorrador(): void {
  const b = leerBorrador();
  if (b) escribirBorrador({ ...b, abierta: false });
}

export function borrarBorrador(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que hacer.
  }
}

/** Si hay algo escrito que valga la pena guardar. */
export function tieneContenido(b: Pick<Borrador, 'frase' | 'montoTexto' | 'descripcion' | 'notas'>): boolean {
  return Boolean(b.frase.trim() || b.montoTexto.trim() || b.descripcion.trim() || b.notas.trim());
}

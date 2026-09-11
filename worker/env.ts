export interface Env {
  DB: D1Database;
  HUB: DurableObjectNamespace;
  ASSETS: Fetcher;
  /**
   * Clave que habilita a crear el hogar la primera vez (endpoint /api/setup).
   * Se define con `wrangler secret put SETUP_KEY`. Sin esto, cualquiera que
   * encuentre la URL podria crear el hogar antes que vos.
   */
  SETUP_KEY?: string;
}

/**
 * El filtro que hace que la barra refracte de verdad.
 *
 * Lo que la barra ya tenía era vidrio esmerilado: desenfoca lo que pasa por
 * detrás y le pone un brillo encima. Lo que le faltaba para ser vidrio de
 * verdad es lo que hace un vidrio grueso: DOBLAR la imagen. Un borde de vidrio
 * no desenfoca el fondo, lo corre; por eso a través del canto de un vaso las
 * líneas rectas se curvan.
 *
 * Eso es `feDisplacementMap`: en vez de pintar, mueve cada píxel según lo que
 * diga otro mapa. El mapa acá es ruido suavizado, así que el corrimiento es
 * orgánico e irregular, como el de un vidrio soplado y no el de una lente.
 *
 * Tres decisiones que no vienen del ejemplo original:
 *
 *   `scale` 18 y no 200. El ejemplo desplaza 200px, que sobre una imagen de
 *   pantalla completa es un efecto y sobre una barra de 56px de alto es
 *   destruirla entera: no quedaría nada reconocible detrás.
 *
 *   Sin `feSpecularLighting`. El ejemplo calcula el brillo dentro del filtro,
 *   con una luz puntual fija en -200,-200. La barra ya dibuja su brillo con
 *   dos gradientes en CSS (`.barra-flotante::before` y `::after`), que siguen
 *   la forma de la píldora y responden al tema claro y oscuro. Dos brillos
 *   sumados se ven sucios, y el de CSS es el que sabe de qué color es la app.
 *
 *   `colorInterpolationFilters="sRGB"`. Por defecto los filtros SVG operan en
 *   linearRGB, que aclara el resultado y desentona con el resto de la interfaz.
 *
 * Va una sola vez en el documento: el `id` es global y las reglas de CSS lo
 * buscan por nombre.
 */
export function FiltroVidrio() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      /* `position: absolute` y no `display: none`: un SVG oculto con `display`
         deja de existir para el motor de render en algunos navegadores, y con
         él el filtro que las reglas de CSS referencian. */
      style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
    >
      <defs>
        <filter
          id="vidrio-liquido"
          /* La región del filtro se pasa del elemento a propósito: el
             desplazamiento tiene que poder traer píxeles de afuera del borde.
             Si la región terminara justo en el canto, el corrimiento traería
             transparencia y dejaría mordidas en el filo. */
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            /* Más baja en X que en Y: la barra es mucho más ancha que alta, y
               con la misma frecuencia en los dos ejes el ruido se lee como
               rayas verticales. */
            baseFrequency="0.006 0.014"
            numOctaves="2"
            seed="11"
            result="ruido"
          />
          {/* Sin esto el ruido es puntual y el vidrio sale granulado, como
              esmerilado barato. Suavizado, las zonas de corrimiento son
              grandes y el fondo se dobla en curvas largas. */}
          <feGaussianBlur in="ruido" stdDeviation="5" result="mapa" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="mapa"
            scale="26"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

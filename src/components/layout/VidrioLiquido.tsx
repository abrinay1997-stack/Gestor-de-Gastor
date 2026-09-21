import { useEffect, useRef, type RefObject } from 'react';

/*
 * El vidrio líquido de la barra de abajo.
 *
 * POR QUE NO ES UN backdrop-filter
 *
 * Lo que hace que algo parezca agua y no vidrio esmerilado es que DOBLA lo
 * que tiene detrás. En la web eso se hace con `feDisplacementMap`, y para
 * aplicarlo al fondo haría falta `backdrop-filter: url(#filtro)`. Safari no
 * lo soporta —ni en iPhone ni en Mac— y en iOS todos los navegadores usan
 * WebKit por obligación, Chrome incluido. Así que por ese lado no hay nada
 * que hacer y no vale la pena volver a intentarlo.
 *
 * COMO SE HACE ENTONCES
 *
 * No se filtra el fondo: se CALCA. Dentro de la pastilla vive una copia
 * inerte del contenido de la página, alineada al píxel con el original, y a
 * esa copia se le aplica `filter: url(#...)`, que es un filtro SVG de los de
 * toda la vida y Safari sí soporta. El resultado es el mismo a la vista y
 * funciona en el teléfono.
 *
 * El precio es real y conviene tenerlo presente: el contenido se renderiza
 * dos veces. El calco se rehace cuando el contenido cambia (con freno de
 * mano, ver ESPERA_CALCO) y solo se mueve por transform al hacer scroll,
 * que es barato.
 *
 * EL MAPA
 *
 * `feDisplacementMap` corre cada píxel según lo que diga otra imagen: el
 * canal rojo manda el corrimiento horizontal y el verde el vertical, con el
 * gris 128 como «no muevas nada». Ese mapa se dibuja a mano en un canvas:
 * neutro en el centro y creciendo de golpe cerca del borde (de ahí PODER),
 * que es como se comporta el canto de un cristal grueso. Un ruido de
 * `feTurbulence`, que es lo que usan casi todas las librerías, da vidrio
 * ondulado de baño, no una lente.
 *
 * Tres pasadas con escalas apenas distintas para el rojo, el verde y el
 * azul dan la aberración cromática: el tinte de color del canto, que es lo
 * que delata que hay un cristal y no un recorte.
 *
 * LOS NUMEROS
 *
 * No son inventados. Salieron de un banco de pruebas con perillas que se
 * ajustó en el iPhone de la casa, sobre esta misma maqueta. Si se van a
 * cambiar, conviene volver a ajustarlos ahí y no a ojo.
 */
const RECETA = {
  /** Cuántos píxeles se corre el fondo en el canto. */
  escala: 40,
  /** Qué tan pegada al borde queda la deformación. Alto: centro limpio. */
  poder: 7.4,
  /** Un velo. Subirlo mucho mata la refracción, porque deja de haber
   *  líneas reconocibles que doblar; este es el punto donde todavía se
   *  distingue el doblez pero el fondo no compite con los iconos. */
  borron: 5.5,
  /** Separación entre las escalas de rojo y azul, en tanto por uno. */
  prisma: 0.18,
  /** Saturación de salida. */
  sat: 1.6,
};

/** Freno de mano para rehacer el calco. El contenido cambia solo cuando
 *  llega un movimiento nuevo o se cambia de pantalla, no en cada cuadro. */
const ESPERA_CALCO = 220;

/** La barra solo existe en celular (`md:hidden`), así que en pantallas
 *  grandes ni se calca ni se filtra: sería trabajo tirado. */
const SOLO_CELULAR = '(max-width: 767px)';

function dibujarMapa(ancho: number, alto: number, poder: number): string {
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(2, Math.round(ancho));
  lienzo.height = Math.max(2, Math.round(alto));

  const pincel = lienzo.getContext('2d');
  if (!pincel) return '';

  const imagen = pincel.createImageData(lienzo.width, lienzo.height);
  const datos = imagen.data;

  for (let y = 0; y < lienzo.height; y++) {
    const ny = (y / (lienzo.height - 1)) * 2 - 1;
    const fy = Math.sign(ny) * Math.pow(Math.abs(ny), poder);

    for (let x = 0; x < lienzo.width; x++) {
      const nx = (x / (lienzo.width - 1)) * 2 - 1;
      const fx = Math.sign(nx) * Math.pow(Math.abs(nx), poder);

      const i = (y * lienzo.width + x) * 4;
      datos[i] = Math.round(128 + fx * 127); // rojo  -> corrimiento en x
      datos[i + 1] = Math.round(128 + fy * 127); // verde -> corrimiento en y
      datos[i + 2] = 128;
      datos[i + 3] = 255;
    }
  }

  pincel.putImageData(imagen, 0, 0);
  return lienzo.toDataURL();
}

export function VidrioLiquido({ contenido }: { contenido: RefObject<HTMLElement | null> }) {
  const envoltura = useRef<HTMLDivElement>(null);
  const lente = useRef<HTMLDivElement>(null);
  const calco = useRef<HTMLDivElement>(null);
  const filtro = useRef<SVGFilterElement>(null);
  const mapa = useRef<SVGFEImageElement>(null);

  useEffect(() => {
    const fuente = contenido.current;
    const envolturaEl = envoltura.current;
    const lenteEl = lente.current;
    const calcoEl = calco.current;
    const filtroEl = filtro.current;
    const mapaEl = mapa.current;

    if (!fuente || !envolturaEl || !lenteEl || !calcoEl || !filtroEl || !mapaEl) return;

    const celular = window.matchMedia(SOLO_CELULAR);
    const sinVidrio = window.matchMedia('(prefers-reduced-transparency: reduce)');

    let vivo = false;
    let cuadro: number | null = null;
    let reloj: ReturnType<typeof setTimeout> | null = null;

    /* El calco. Una copia muerta: sin ids repetidos que rompan el
       documento, sin foco, y fuera del alcance de los lectores de
       pantalla, que ya leen el original. */
    const calcar = () => {
      const copia = fuente.cloneNode(true) as HTMLElement;
      copia.removeAttribute('id');
      copia.setAttribute('aria-hidden', 'true');
      copia.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      copia.querySelectorAll('[tabindex]').forEach((n) => n.setAttribute('tabindex', '-1'));

      calcoEl.replaceChildren(copia);
      calcoEl.style.width = `${fuente.offsetWidth}px`;
    };

    const calcarConFreno = () => {
      if (reloj !== null) clearTimeout(reloj);
      reloj = setTimeout(() => {
        reloj = null;
        if (vivo) calcar();
      }, ESPERA_CALCO);
    };

    /* Alinear. El calco tiene que caer exactamente donde está el contenido
       de verdad: si se corre un píxel, el vidrio muestra otra cosa que la
       que tapa y el engaño se cae. */
    const alinear = () => {
      cuadro = null;
      const pastilla = envolturaEl.getBoundingClientRect();
      const real = fuente.getBoundingClientRect();
      calcoEl.style.transform =
        `translate3d(${real.left - pastilla.left}px, ${real.top - pastilla.top}px, 0)`;
    };

    const pedirAlinear = () => {
      if (cuadro === null) cuadro = requestAnimationFrame(alinear);
    };

    /* El filtro. La región se estira más allá de la pastilla para que el
       desplazamiento tenga píxeles de dónde traer; el mapa, en cambio, se
       clava al tamaño exacto de la pastilla, para que su borde coincida con
       el canto y no con un punto cualquiera. */
    const armar = () => {
      const ancho = envolturaEl.offsetWidth;
      const alto = envolturaEl.offsetHeight;
      if (!ancho || !alto) return;

      const margen = Math.ceil(RECETA.escala * 1.6);
      filtroEl.setAttribute('x', String(-margen));
      filtroEl.setAttribute('y', String(-margen));
      filtroEl.setAttribute('width', String(ancho + margen * 2));
      filtroEl.setAttribute('height', String(alto + margen * 2));

      mapaEl.setAttribute('width', String(ancho));
      mapaEl.setAttribute('height', String(alto));
      mapaEl.setAttribute('href', dibujarMapa(ancho, alto, RECETA.poder));
    };

    const observadorContenido = new MutationObserver(calcarConFreno);
    const observadorTamano = new ResizeObserver(() => {
      armar();
      pedirAlinear();
    });

    const encender = () => {
      if (vivo) return;
      vivo = true;
      calcar();
      armar();
      alinear();
      lenteEl.style.filter = 'url(#vidrio-liquido)';
      /* Recien ahora la pastilla puede soltar su fondo de respaldo: lo que
         se ve a traves pasa a ser el calco deformado. */
      envolturaEl.parentElement?.classList.add('vidrio-activo');
      observadorContenido.observe(fuente, { subtree: true, childList: true, characterData: true });
      observadorTamano.observe(envolturaEl);
      window.addEventListener('scroll', pedirAlinear, { passive: true });
    };

    const apagar = () => {
      if (!vivo) return;
      vivo = false;
      observadorContenido.disconnect();
      observadorTamano.disconnect();
      window.removeEventListener('scroll', pedirAlinear);
      if (cuadro !== null) cancelAnimationFrame(cuadro);
      if (reloj !== null) clearTimeout(reloj);
      cuadro = null;
      reloj = null;
      lenteEl.style.filter = 'none';
      calcoEl.replaceChildren();
      envolturaEl.parentElement?.classList.remove('vidrio-activo');
    };

    const decidir = () => {
      if (celular.matches && !sinVidrio.matches) encender();
      else apagar();
    };

    decidir();
    celular.addEventListener('change', decidir);
    sinVidrio.addEventListener('change', decidir);

    return () => {
      celular.removeEventListener('change', decidir);
      sinVidrio.removeEventListener('change', decidir);
      apagar();
    };
  }, [contenido]);

  const p = RECETA.prisma;

  return (
    <>
      <svg className="vidrio-definiciones" aria-hidden="true" focusable="false">
        <defs>
          <filter
            ref={filtro}
            id="vidrio-liquido"
            filterUnits="userSpaceOnUse"
            primitiveUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage ref={mapa} result="MAPA" preserveAspectRatio="none" x="0" y="0" />

            <feDisplacementMap in="SourceGraphic" in2="MAPA" result="PR"
              scale={RECETA.escala * (1 + p)} xChannelSelector="R" yChannelSelector="G" />
            <feDisplacementMap in="SourceGraphic" in2="MAPA" result="PG"
              scale={RECETA.escala} xChannelSelector="R" yChannelSelector="G" />
            <feDisplacementMap in="SourceGraphic" in2="MAPA" result="PB"
              scale={RECETA.escala * (1 - p)} xChannelSelector="R" yChannelSelector="G" />

            {/* Cada pasada aporta un solo canal, y las tres se suman. */}
            <feColorMatrix in="PR" type="matrix" result="CR"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" />
            <feColorMatrix in="PG" type="matrix" result="CG"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" />
            <feColorMatrix in="PB" type="matrix" result="CB"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" />
            <feComposite in="CR" in2="CG" operator="arithmetic" k2={1} k3={1} result="CRG" />
            <feComposite in="CRG" in2="CB" operator="arithmetic" k2={1} k3={1} result="JUNTO" />

            <feGaussianBlur in="JUNTO" stdDeviation={RECETA.borron} result="BORROSO" />
            <feColorMatrix in="BORROSO" type="saturate" values={String(RECETA.sat)} />
          </filter>
        </defs>
      </svg>

      <div className="vidrio-envoltura" ref={envoltura} aria-hidden="true">
        <div className="vidrio-lente" ref={lente}>
          <div className="vidrio-calco" ref={calco} />
        </div>
      </div>
    </>
  );
}

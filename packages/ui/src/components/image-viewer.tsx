import { RiCloseLine } from "@remixicon/react";

import { IconButton } from "./base/buttons/icon-button.tsx";
import { Dialog } from "./dialog.tsx";

/**
 * Foto ampliada sobre un fondo oscuro (la cara de un funcionario, al tocarla en su ficha). Se monta para abrirla:
 * Escape, la X o tocar afuera la cierran. La caja de la foto tiene un tamaño fijo y la imagen se acomoda adentro
 * sin recortarse, así que nada salta cuando termina de cargar. `caption` va debajo: quién es y quién publica la foto.
 */
export function ImageViewer({
  src,
  alt,
  caption,
  onClose,
}: {
  src: string;
  /** Qué muestra la foto ("Foto de Jimena Latorre"); también es el nombre de la ventana. */
  alt: string;
  caption?: string;
  onClose: () => void;
}) {
  return (
    <Dialog label={alt} onClose={onClose} overlayClassName="z-[60] bg-black/90 backdrop-blur-sm" className="inset-0 z-[60]">
      {/* La ventana ocupa toda la pantalla: tocar fuera de la foto y del texto la cierra, como en cualquier visor. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: con teclado se cierra con Escape o con la X. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: con teclado se cierra con Escape o con la X. */}
      <div
        className="flex size-full flex-col items-center justify-center gap-3 p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <IconButton
          icon={RiCloseLine}
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute top-3 right-3 border-white/20 bg-black/40 text-white hover:bg-black/60"
        />
        <div className="pointer-events-none flex size-[min(calc(100vw-2rem),calc(100dvh-10rem),36rem)] items-center justify-center">
          <img src={src} alt={alt} decoding="async" className="pointer-events-auto max-h-full max-w-full rounded-xl object-contain" />
        </div>
        {caption && <p className="max-w-xl text-center text-body-regular text-pretty text-white/80">{caption}</p>}
      </div>
    </Dialog>
  );
}

import { buttonClassName } from "@mt/ui/components/base/buttons/button";
import { DotImage } from "@mt/ui/components/dot-image";
import { Popover, PopoverContent, PopoverTrigger } from "@mt/ui/components/popover";
import { cx } from "@mt/ui/lib/cx";
import { RiCameraLine, RiInformationLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";

import { PHOTOS, type PhotoId } from "@/photos.ts";

/**
 * A Mendoza landscape in dots. The credit its license asks for and the link to propose another photo are two
 * buttons on the photo itself, so they never take a row of text under it. Size it with `className`.
 * By default it sits flush at the top of a page (it undoes the page padding); `flush={false}` leaves it in place
 * (the home page hero). `fade={false}` with mask classes in `className` sets a custom fade.
 */
export function LandscapePhoto({
  id,
  className,
  flush = true,
  fade = true,
}: {
  id: PhotoId;
  className?: string;
  flush?: boolean;
  fade?: boolean;
}) {
  const photo = PHOTOS[id];
  return (
    <figure className={cx("relative", flush && "-mx-4 -mt-8 sm:-mx-5 sm:-mt-10")}>
      <DotImage src={photo.src} focus={photo.focus} fade={fade} className={cx("pointer-events-none w-full", className)} />
      <figcaption className="absolute right-4 bottom-2 flex items-center gap-2 sm:right-5">
        <Popover>
          <PopoverTrigger
            aria-label="Autoría de la foto"
            data-track="landscape.credit"
            data-track-photo={id}
            className={buttonClassName({ variant: "secondary", iconOnly: true })}
          >
            <RiInformationLine className="size-5" aria-hidden />
          </PopoverTrigger>
          <PopoverContent>
            <span className="flex flex-col gap-1">
              <span className="text-body-medium text-text-primary">{photo.title}</span>
              <span>
                Foto: {photo.author} · {photo.license}
              </span>
              <a
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                data-track="landscape.credit_source"
                data-track-photo={id}
                className="text-text-link hover:underline"
              >
                Ver la foto original
              </a>
            </span>
          </PopoverContent>
        </Popover>
        <Link
          to="/participar"
          search={{ tipo: "foto" }}
          data-track="landscape.propose"
          data-track-photo={id}
          className={buttonClassName({ variant: "secondary" })}
        >
          <RiCameraLine className="size-5" aria-hidden />
          Proponé tu foto
        </Link>
      </figcaption>
    </figure>
  );
}

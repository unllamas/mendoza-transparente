import { DotImage } from "@mt/ui/components/dot-image";
import { cx } from "@mt/ui/lib/cx";
import { Link } from "@tanstack/react-router";

import { PHOTOS, type PhotoId } from "@/photos.ts";

/**
 * A Mendoza landscape in dots, with the credit its license asks for and a link to propose another one.
 * For the top of pages that want a bit more character (the home page). Size it with `className`.
 */
export function LandscapePhoto({ id, className }: { id: PhotoId; className?: string }) {
  const photo = PHOTOS[id];
  return (
    <figure className="-mx-4 -mt-8 flex flex-col gap-2 sm:-mx-5 sm:-mt-10">
      <DotImage src={photo.src} focus={photo.focus} className={cx("w-full", className)} />
      <figcaption className="flex flex-wrap justify-end gap-x-3 px-4 text-caption-1-regular text-text-tertiary sm:px-5">
        <a
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          data-track="landscape.credit"
          data-track-photo={id}
          className="hover:underline"
        >
          {photo.title} · Foto: {photo.author} · {photo.license}
        </a>
        <Link
          to="/participar"
          search={{ tipo: "foto" }}
          data-track="landscape.propose"
          data-track-photo={id}
          className="text-text-link hover:underline"
        >
          Proponé tu foto
        </Link>
      </figcaption>
    </figure>
  );
}

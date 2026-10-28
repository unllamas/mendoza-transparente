import aco from "../mascots/aco/mascot.json";

export type PoseInfo = { label: string; alt: string; use: string };

export type AvatarInfo = {
  pose: string;
  /** Square, in pixels of the original illustration, that frames the head for the round avatar. */
  crop: { x: number; y: number; size: number };
};

export type StyleManifest = {
  label: string;
  /** Widths (px) of the generated files; the images are square. */
  sizes: number[];
  poses: Record<string, PoseInfo>;
  avatar: AvatarInfo;
};

export type MascotManifest = {
  id: string;
  name: string;
  species: string;
  description: string;
  defaultStyle: string;
  styles: Record<string, StyleManifest>;
};

/** Every mascot. To add one: drop `mascots/<id>/mascot.json` and import it here. */
export const MASCOTS = { aco } satisfies Record<string, MascotManifest>;

export type MascotId = keyof typeof MASCOTS;
export type StyleId<M extends MascotId = MascotId> = keyof (typeof MASCOTS)[M]["styles"] & string;
type PosesOf<S> = S extends { poses: infer P } ? keyof P : never;
export type PoseId<M extends MascotId = MascotId> = PosesOf<(typeof MASCOTS)[M]["styles"][keyof (typeof MASCOTS)[M]["styles"]]> & string;

/** Public folder (served from `apps/web/public`) where the generated files of a mascot live. */
export const ASSETS_BASE = "/mascotas";

export function assetPath(mascot: string, style: string, file: string): string {
  return `${ASSETS_BASE}/${mascot}/${style}/${file}`;
}

export function poseFile(pose: string, size: number): string {
  return `${pose}-${size}.png`;
}

export function avatarFile(size: number): string {
  return `avatar-${size}.png`;
}

/** Widths of the generated avatar files. */
export const AVATAR_SIZES = [96, 192] as const;

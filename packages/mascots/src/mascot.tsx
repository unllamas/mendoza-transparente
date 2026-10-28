import {
  AVATAR_SIZES,
  assetPath,
  avatarFile,
  MASCOTS,
  type MascotId,
  type MascotManifest,
  type PoseId,
  poseFile,
  type StyleId,
  type StyleManifest,
} from "./manifest.ts";

const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

function warn(message: string): void {
  if (isDev) console.warn(`[@mt/mascots] ${message}`);
}

type Resolved = { id: string; mascot: MascotManifest; styleId: string; style: StyleManifest };

/** Looks the mascot and its style up; undefined when the mascot does not exist. */
function resolve(mascotId: string, styleId?: string): Resolved | undefined {
  const mascot = (MASCOTS as Record<string, MascotManifest>)[mascotId];
  if (!mascot) {
    warn(`la mascota "${mascotId}" no existe`);
    return undefined;
  }
  let style = styleId === undefined ? undefined : mascot.styles[styleId];
  let resolvedStyle = styleId;
  if (!style) {
    if (styleId !== undefined) warn(`${mascotId}: el estilo "${styleId}" no existe, se usa "${mascot.defaultStyle}"`);
    resolvedStyle = mascot.defaultStyle;
    style = mascot.styles[mascot.defaultStyle];
  }
  if (!style || resolvedStyle === undefined) return undefined;
  return { id: mascotId, mascot, styleId: resolvedStyle, style };
}

function srcSet(files: Array<{ size: number; url: string }>): string {
  return files.map((f) => `${f.url} ${f.size}w`).join(", ");
}

/** The smallest generated file that is at least `size` wide (or the largest one). */
function pickSrc(files: Array<{ size: number; url: string }>, size: number): string {
  const sorted = [...files].sort((a, b) => a.size - b.size);
  return (sorted.find((f) => f.size >= size) ?? sorted[sorted.length - 1])?.url ?? "";
}

type CommonProps = {
  /** Rendered width and height, in CSS px (the images are square). */
  size: number;
  className?: string;
  /** Pure decoration next to text that already says it: empty `alt`. */
  decorative?: boolean;
  /** Above the fold: loads right away instead of lazily. */
  priority?: boolean;
};

export type MascotProps<M extends MascotId = MascotId> = CommonProps & {
  mascot: M;
  pose: PoseId<M>;
  style?: StyleId<M>;
};

/** A pose of a mascot. A pose or style that does not exist falls back to the avatar pose and warns in development. */
export function Mascot<M extends MascotId>({
  mascot: mascotId,
  pose,
  style: styleId,
  size,
  className,
  decorative,
  priority,
}: MascotProps<M>) {
  const found = resolve(mascotId, styleId);
  if (!found) return null;
  const { style, styleId: resolvedStyle } = found;
  let poseId: string = pose;
  let info = style.poses[poseId];
  if (!info) {
    warn(`${mascotId}/${resolvedStyle}: la pose "${poseId}" no existe, se usa "${style.avatar.pose}"`);
    poseId = style.avatar.pose;
    info = style.poses[poseId];
  }
  const files = style.sizes.map((s) => ({ size: s, url: assetPath(mascotId, resolvedStyle, poseFile(poseId, s)) }));
  return (
    <img
      src={pickSrc(files, size * 2)}
      srcSet={srcSet(files)}
      sizes={`${size}px`}
      alt={decorative ? "" : (info?.alt ?? found.mascot.name)}
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}

export type MascotAvatarProps<M extends MascotId = MascotId> = Omit<CommonProps, "priority"> & {
  mascot: M;
  style?: StyleId<M>;
  priority?: boolean;
};

/** The head of a mascot in a round frame: for the header of a chat, a signature, a button. The blue is dark enough for the white feathers of the collar to show. */
export function MascotAvatar<M extends MascotId>({
  mascot: mascotId,
  style: styleId,
  size,
  className,
  decorative,
  priority,
}: MascotAvatarProps<M>) {
  const found = resolve(mascotId, styleId);
  if (!found) return null;
  const files = AVATAR_SIZES.map((s) => ({ size: s, url: assetPath(mascotId, found.styleId, avatarFile(s)) }));
  return (
    <img
      src={pickSrc(files, size * 2)}
      srcSet={srcSet(files)}
      sizes={`${size}px`}
      alt={decorative ? "" : found.mascot.name}
      width={size}
      height={size}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={`shrink-0 rounded-full bg-accent-300 object-cover ${className ?? ""}`.trim()}
    />
  );
}

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checkAssets } from "./check.ts";
import { AVATAR_SIZES, assetPath, MASCOTS, poseFile } from "./manifest.ts";
import { Mascot, MascotAvatar } from "./mascot.tsx";

describe("manifests", () => {
  test("every mascot has its id, a default style that exists and a pose for the avatar", () => {
    for (const [id, mascot] of Object.entries(MASCOTS)) {
      expect(mascot.id).toBe(id);
      expect(Object.keys(mascot.styles)).toContain(mascot.defaultStyle);
      for (const style of Object.values(mascot.styles)) {
        expect(Object.keys(style.poses)).toContain(style.avatar.pose);
        expect(style.sizes.length).toBeGreaterThan(0);
        expect(style.avatar.crop.size).toBeGreaterThan(0);
      }
    }
  });

  test("every pose has alt text and a use", () => {
    for (const mascot of Object.values(MASCOTS)) {
      for (const style of Object.values(mascot.styles)) {
        for (const pose of Object.values(style.poses)) {
          expect(pose.alt.length).toBeGreaterThan(0);
          expect(pose.use.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("generated files", () => {
  test("every pose has its original and its generated files within the weight budget", () => {
    expect(checkAssets()).toEqual([]);
  });
});

describe("<Mascot>", () => {
  test("renders a fixed-size image with srcSet, alt from the manifest and lazy loading", () => {
    const html = renderToStaticMarkup(createElement(Mascot, { mascot: "aco", pose: "wave", size: 128 }));
    expect(html).toContain('width="128"');
    expect(html).toContain('height="128"');
    expect(html).toContain('alt="Aco saludando con el ala"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain(`${assetPath("aco", "ilustracion", poseFile("wave", 256))} 256w`);
  });

  test("priority loads eagerly and decorative has an empty alt", () => {
    const html = renderToStaticMarkup(createElement(Mascot, { mascot: "aco", pose: "idle", size: 64, priority: true, decorative: true }));
    expect(html).toContain('loading="eager"');
    expect(html).toContain('alt=""');
  });

  test("an unknown pose falls back to the avatar pose", () => {
    // @ts-expect-error the pose does not exist on purpose
    const html = renderToStaticMarkup(createElement(Mascot, { mascot: "aco", pose: "dance", size: 64 }));
    expect(html).toContain("idle-");
  });

  test("an unknown mascot renders nothing", () => {
    // @ts-expect-error the mascot does not exist on purpose
    expect(renderToStaticMarkup(createElement(Mascot, { mascot: "nadie", pose: "idle", size: 64 }))).toBe("");
  });

  test("the avatar uses the avatar files", () => {
    const html = renderToStaticMarkup(createElement(MascotAvatar, { mascot: "aco", size: 40 }));
    for (const size of AVATAR_SIZES) expect(html).toContain(`avatar-${size}.png ${size}w`);
    expect(html).toContain('alt="Aco"');
  });
});

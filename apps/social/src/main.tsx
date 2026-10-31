/**
 * Estudio de piezas sociales. Cada escena vive en src/scenes/<nombre>/index.tsx.
 *   /                    lista de escenas
 *   /?scene=<nombre>     la escena sola, a tiempo real (la usan `bun run pieza:filmar` y la revisión a ojo)
 *   /?record=<nombre>    la escena con el reloj virtual del kit: el tiempo avanza solo cuando
 *                        `bun run pieza:grabar` llama a __stageshow.clock.step(), cuadro por cuadro
 */
import { type ComponentType, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installVirtualClock } from "../vendor/stageshow/kit/clock";
import "./styles.css";

const scenes = import.meta.glob<{ default: ComponentType }>("./scenes/*/index.tsx");
const sceneName = (path: string) => path.split("/")[2] ?? path;

async function boot() {
  const root = createRoot(document.getElementById("root") as HTMLElement);
  const params = new URLSearchParams(location.search);
  const recording = params.get("record");
  const name = recording ?? params.get("scene");
  if (!name) {
    root.render(<SceneList />);
    return;
  }
  if (recording) installVirtualClock({ fps: 30 });
  const load = scenes[`./scenes/${name}/index.tsx`];
  if (!load) {
    root.render(<p role="alert">No existe la escena «{name}».</p>);
    return;
  }
  const { default: Scene } = await load();
  root.render(
    <StrictMode>
      <div id="scene">
        <Scene />
      </div>
    </StrictMode>,
  );
}

function SceneList() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-8">
      <div className="font-semibold text-xl">Piezas sociales</div>
      <ul className="flex flex-col gap-2">
        {Object.keys(scenes).map((path) => (
          <li key={path}>
            <a className="text-(--color-text-link) underline" href={`?scene=${sceneName(path)}`}>
              {sceneName(path)}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}

boot();

/**
 * Pieza para X (4:5): alguien busca «clisa» desde la portada, toca CLISA INTERIOR S.A. y en su ficha
 * ve quién le compra. Datos reales del sitio al 29 de octubre de 2026 (/proveedores/clisa-interior-s-a-30707363971).
 *
 * Simplificaciones respecto del sitio, a propósito:
 * - El buscador muestra solo la sección Proveedores: el resto son personas y no hacen a la historia.
 * - La ficha no muestra «Quién es» ni el gráfico por año.
 * - Los nombres de los compradores van en dos líneas: cortados se pierde «Penitenciario».
 */
import { RiArrowRightLine, RiArrowRightSLine, RiSearchLine, RiStore2Line } from "@remixicon/react";
import { type Act, Phone, Stage } from "../../../vendor/stageshow/kit";
import { SiteHeader } from "../../site/header";
import { tap } from "../../site/touch";
import "../../site/site.css";
import "./scene.css";
import sky from "./sky.webp";

type Page = "home" | "provider";
type Touched = "field" | "result" | "logo" | null;
type S = { page: Page; search: boolean; query: string; results: boolean; fill: boolean; scroll: number; touched: Touched };

const START: S = { page: "home", search: false, query: "", results: false, fill: false, scroll: 0, touched: null };
const REST = { x: 300, y: 560 };
/** Cuánto sube la ficha para que entren los cuatro compradores */
const SCROLL = 166;
/** El ritmo de quien escribe: desparejo, pero igual en cada vuelta */
const RHYTHM = [1.2, 0.8, 1.4, 0.9, 1.1];
const QUERY = "clisa";

const RESULTS = [
  { name: "CLISA INTERIOR S.A.", detail: "$ 57 mil M en 19 procesos con el Estado" },
  { name: "CRISA SRL", detail: "$ 143,2 M en 35 procesos con el Estado" },
  { name: "RAFER SRL", detail: "$ 14,4 M en 6 procesos con el Estado" },
];

/** «Quién le compra»: la barra es la parte del mayor comprador, como en el sitio */
const BUYERS = [
  { name: "Dirección Gral. Servicio Penitenciario", amount: "$ 54.138 millones", count: "1 proceso", share: 1 },
  { name: "Hospital Teodoro Schestakow", amount: "$ 1.662 millones", count: "2 procesos", share: 0.031 },
  { name: "Hospital José Néstor Lencinas", amount: "$ 554 millones", count: "7 procesos", share: 0.01 },
  { name: "Hospital Saporiti", amount: "$ 532 millones", count: "8 procesos", share: 0.01 },
];

async function script(a: Act<S>) {
  await a.wait(1000);

  a.mark("search");
  await tap(a, "field");
  await a.set({ search: true, touched: null });
  await a.wait(500);
  for (let i = 1; i <= QUERY.length; i++) {
    await a.set({ query: QUERY.slice(0, i) });
    await a.wait(130 * (RHYTHM[i - 1] ?? 1));
  }
  await a.wait(150);
  await a.set({ results: true });
  await a.wait(1500);

  // La ficha aparece debajo del buscador y el buscador se va encima de ella: nunca se ven las dos a medias
  a.mark("pick");
  await tap(a, "result", { x: 0.4, y: 0.5 });
  await a.set({ page: "provider" });
  await a.wait(380);
  await a.set({ search: false });
  await a.wait(400);
  await a.snap({ query: "", results: false, touched: null });
  await a.wait(900);

  // Un deslizamiento hacia arriba lleva la ficha a «Quién le compra»
  a.mark("scroll");
  await a.move({ x: 280, y: 590 });
  await a.drag({ x: 280, y: 590 - SCROLL }, (at, from) => a.put({ scroll: Math.min(SCROLL, Math.max(0, from.y - at.y)) }), {
    duration: 650,
  });
  await a.set({ scroll: SCROLL });
  await a.wait(250);
  a.mark("buyers");
  await a.set({ fill: true });
  await a.wait(4200);

  // Vuelve a la portada por el nombre del sitio, como lo haría cualquiera; así la pieza se repite sin corte
  a.mark("back");
  await tap(a, "logo");
  await a.set({ page: "home", touched: null });
  await a.wait(400);
  await a.snap({ fill: false, scroll: 0 });
  await a.move(REST);
  await a.wait(600);
}

export default function ClisaBuyers() {
  return (
    <Stage<S>
      width={540}
      height={675}
      initial={START}
      poster={{ ...START, page: "provider", fill: true, scroll: SCROLL }}
      script={script}
      cursor={{ at: REST, style: "touch", ripple: true }}
      className="mt"
    >
      {(s) => (
        <>
          <div className="mt-ground" />
          <Phone width={440} className="cb-phone">
            <Home s={s} />
            <Provider s={s} />
            <Search s={s} />
          </Phone>
        </>
      )}
    </Stage>
  );
}

function Home({ s }: { s: S }) {
  return (
    <div className="mt-layer cb-home" data-show style={{ backgroundImage: `url(${sky})` }}>
      <SiteHeader logoTouched={s.touched === "logo"} />
      <div className="cb-hero">
        <span className="cb-count">
          <span className="cb-dot" />
          404.855 registros de 30 fuentes oficiales
        </span>
        <div className="cb-title">Mendoza, con los números sobre la mesa.</div>
        <p className="cb-lede">En qué se gasta la plata, quién decide y qué falta publicar, con la fuente de cada número.</p>
        <div className="cb-field" data-target="field" data-cursor="ibeam" data-touched={s.touched === "field" || undefined}>
          <RiSearchLine size={20} className="cb-field__icon" />
          <span>Buscá funcionarios, leyes, empresas…</span>
        </div>
        <div className="cb-select">Elegí tu departamento</div>
      </div>
    </div>
  );
}

function Search({ s }: { s: S }) {
  const typing = s.query.length > 0 && s.query.length < QUERY.length;
  return (
    <div className="mt-layer cb-search" data-show={s.search || undefined}>
      <div className="cb-search__bar">
        <RiSearchLine size={20} className="cb-field__icon" />
        <span className="cb-search__query">
          {s.query}
          <span className="cb-caret" data-typing={typing || undefined} />
        </span>
        <span className="cb-cancel">Cancelar</span>
      </div>
      <div className="cb-results" data-show={s.results || undefined}>
        <div className="cb-section">
          <RiStore2Line size={14} />
          Proveedores
        </div>
        {RESULTS.map((r, i) => (
          <div
            key={r.name}
            className="cb-result"
            data-target={i === 0 ? "result" : undefined}
            data-cursor="hand"
            data-touched={(i === 0 && s.touched === "result") || undefined}
            style={{ transitionDelay: `${i * 60}ms` }}
          >
            <span className="cb-result__name">{r.name}</span>
            <span className="cb-result__detail">{r.detail}</span>
          </div>
        ))}
        <span className="cb-more">
          Ver los 9 en proveedores <RiArrowRightLine size={14} />
        </span>
      </div>
    </div>
  );
}

function Provider({ s }: { s: S }) {
  return (
    <div className="mt-layer cb-provider" data-show={s.page === "provider" || undefined}>
      <SiteHeader solid logoTouched={s.touched === "logo"} />
      <div className="cb-body" style={{ transform: `translateY(${-s.scroll}px)` }}>
        <div className="cb-crumbs">
          <span>Proveedores</span>
          <RiArrowRightSLine size={14} />
          <span>CUIT 30707363971</span>
        </div>
        <div className="cb-name">CLISA INTERIOR S.A.</div>
        <div className="cb-stats">
          <div className="cb-stat">
            <span className="cb-stat__label">Total adjudicado</span>
            <span className="cb-stat__value">$ 56.992 millones</span>
          </div>
          <div className="cb-stat">
            <span className="cb-stat__label">Procesos ganados</span>
            <span className="cb-stat__value">19</span>
          </div>
        </div>
        <div className="cb-heading">Quién le compra</div>
        <div className="cb-hint">Tocá un organismo para ver todo lo que compra</div>
        <div className="cb-card">
          {BUYERS.map((b, i) => (
            <div key={b.name} className="cb-buyer">
              <div className="cb-buyer__top">
                <span className="cb-buyer__name">{b.name}</span>
                <span className="cb-buyer__amount">{b.amount}</span>
              </div>
              <div className="cb-buyer__bottom">
                <span className="cb-track">
                  <span
                    className="cb-fill"
                    style={{
                      width: s.fill ? `${Math.max(b.share * 100, 1.5)}%` : "0%",
                      transitionDelay: s.fill ? `${i * 140}ms` : "0ms",
                    }}
                  />
                </span>
                <span className="cb-buyer__count">{b.count}</span>
              </div>
              <RiArrowRightSLine size={20} className="cb-chevron" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

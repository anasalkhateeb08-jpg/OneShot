import { SCOPE } from "@oneshot/shared";
import type { BreathMode, Posture } from "@oneshot/shared";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEG = Math.PI / 180;

export interface HudState {
  scoped: boolean;
  /** Camera vertical field of view, degrees. */
  fovDeg: number;
  /** Viewport width / height. */
  aspect: number;
  lung: number;
  breathMode: BreathMode;
  /** Wind direction relative to the view: 0 = blowing straight away, +PI/2 = toward the right. */
  windRelativeRad: number;
  windSpeed: number;
  zeroM: number;
  /** Selected scope magnification (shown in the info line). */
  zoom: number;
  /** Index of the selected zoom level (drives the zoom ladder beside the lens). */
  zoomLevel: number;
  posture: Posture;
  /** Rangefinder: undefined = not in use, null = nothing in range, number = meters. */
  rangeM: number | null | undefined;
  /** Breathing pulse for the vignette, 0..1. */
  pulse: number;
  /** Practice only (D-028): predicted impact point relative to the crosshair, in mils. */
  impactMils: { right: number; up: number } | null;
  rounds: number;
  magazine: number;
  rifle: "ready" | "bolt" | "reload" | "empty";
}

const FLASH_MS = 2200;

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function div(className: string, parent: HTMLElement): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  parent.appendChild(el);
  return el;
}

/**
 * Heads-up display: scope overlay (circle, mil-dot reticle, lung meter, wind gauge),
 * breath vignette, rangefinder readout, and the zero/posture line.
 *
 * The reticle is drawn in MILLIRADIAN units and the SVG view box is set from the camera's
 * field of view every frame, so 1 mil on the reticle always covers exactly 1 milliradian of
 * the world (first focal plane). The geometry is identical for every player (master 18).
 * Text here is developer text; it moves to the localization system in phase 8.
 */
export class Hud {
  private readonly vignette: HTMLDivElement;
  private readonly scope: HTMLDivElement;
  private readonly reticle: SVGSVGElement;
  private readonly lungFill: HTMLDivElement;
  private readonly windArrow: HTMLDivElement;
  private readonly windText: HTMLDivElement;
  private readonly range: HTMLDivElement;
  private readonly info: HTMLDivElement;
  private readonly dot: HTMLDivElement;
  private readonly zoomSteps: HTMLDivElement[] = [];
  private readonly ammo: HTMLDivElement;
  private readonly impactDot: SVGGElement;
  private readonly impactHalo: SVGCircleElement;
  private readonly impactCore: SVGCircleElement;
  private readonly flashEl: HTMLDivElement;
  private flashUntil = 0;
  private lastAmmo = "";
  private lastZoomLevel = -1;
  private lastViewBox = "";
  private lastInfo = "";

  /** @param zoomLevels the scope's magnification levels, lowest first */
  constructor(root: HTMLElement, zoomLevels: readonly number[]) {
    this.vignette = div("hud-vignette", root);
    this.dot = div("hud-dot", root);

    this.scope = div("hud-scope", root);
    div("hud-scope-ring", this.scope);
    this.reticle = svg("svg", { class: "hud-reticle", preserveAspectRatio: "xMidYMid meet" });
    this.buildReticle(this.reticle);
    // Practice impact dot (owner request): fluorescent, glowing, gently pulsing, hard to miss.
    this.impactDot = svg("g", { class: "hud-impact" });
    this.impactHalo = svg("circle", { r: 0.75, class: "hud-impact-halo" });
    this.impactCore = svg("circle", { r: 0.32, class: "hud-impact-core" });
    this.impactDot.appendChild(this.impactHalo);
    this.impactDot.appendChild(this.impactCore);
    this.impactDot.style.display = "none";
    this.reticle.appendChild(this.impactDot);
    this.scope.appendChild(this.reticle);

    const lung = div("hud-lung", this.scope);
    this.lungFill = div("hud-lung-fill", lung);

    const wind = div("hud-wind", this.scope);
    this.windArrow = div("hud-wind-arrow", wind);
    this.windArrow.appendChild(this.buildArrow());
    this.windText = div("hud-wind-text", wind);

    // Zoom ladder on the black area beside the lens: one step per level, lowest at the bottom.
    // Steps up to the selected level turn green; the rest stay white.
    const ladder = div("hud-zoom", this.scope);
    const rows: HTMLDivElement[] = [];
    for (const z of zoomLevels) {
      const row = document.createElement("div");
      row.className = "hud-zoom-step";
      div("hud-zoom-tick", row);
      const label = div("hud-zoom-label", row);
      label.textContent = `${Math.round(z)}x`;
      rows.push(row);
    }
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (row) ladder.appendChild(row);
    }
    this.zoomSteps = rows;

    this.range = div("hud-range", root);
    this.info = div("hud-info", root);
    this.ammo = div("hud-ammo", root);
    this.flashEl = div("hud-flash", root);
    this.flashEl.hidden = true;
  }

  update(s: HudState): void {
    this.scope.hidden = !s.scoped;
    this.dot.hidden = s.scoped;

    if (s.scoped) {
      const halfH = Math.tan((s.fovDeg * DEG) / 2) * 1000;
      const halfW = halfH * s.aspect;
      const vb = `${(-halfW).toFixed(3)} ${(-halfH).toFixed(3)} ${(2 * halfW).toFixed(3)} ${(2 * halfH).toFixed(3)}`;
      if (vb !== this.lastViewBox) {
        this.reticle.setAttribute("viewBox", vb);
        this.lastViewBox = vb;
        // Keep the impact dot a fixed size on screen (core 6 px, halo 15 px) at every zoom.
        const pxPerMil = window.innerHeight / (2 * halfH);
        this.impactCore.setAttribute("r", (6 / pxPerMil).toFixed(4));
        this.impactHalo.setAttribute("r", (15 / pxPerMil).toFixed(4));
      }
      this.lungFill.style.inlineSize = `${Math.round(s.lung * 100)}%`;
      this.lungFill.dataset.mode = s.breathMode;
      this.windArrow.style.transform = `rotate(${s.windRelativeRad}rad)`;
      this.windText.textContent = `${s.windSpeed.toFixed(1)} m/s`;
      if (s.impactMils) {
        const x = s.impactMils.right.toFixed(3);
        const y = (-s.impactMils.up).toFixed(3);
        this.impactDot.setAttribute("transform", `translate(${x} ${y})`);
        this.impactDot.style.display = "";
      } else {
        this.impactDot.style.display = "none";
      }
      if (s.zoomLevel !== this.lastZoomLevel) {
        this.zoomSteps.forEach((row, i) => {
          row.dataset.on = i <= s.zoomLevel ? "1" : "0";
        });
        this.lastZoomLevel = s.zoomLevel;
      }
    }

    let vignette = 0;
    if (s.breathMode === "holding") vignette = 0.35 + 0.15 * s.pulse;
    else if (s.breathMode === "exhausted") vignette = 0.6 + 0.2 * s.pulse;
    this.vignette.style.opacity = vignette.toFixed(3);
    this.vignette.dataset.mode = s.breathMode;

    if (s.rangeM === undefined) {
      this.range.hidden = true;
    } else {
      this.range.hidden = false;
      this.range.textContent = s.rangeM === null ? "--- m" : `${Math.round(s.rangeM)} m`;
    }

    const pips = "|".repeat(s.rounds) + ".".repeat(Math.max(0, s.magazine - s.rounds));
    const status = s.rifle === "ready" ? "" : `  ${s.rifle.toUpperCase()}`;
    const ammo = `${pips}${status}`;
    if (ammo !== this.lastAmmo) {
      this.ammo.textContent = ammo;
      this.ammo.dataset.state = s.rifle;
      this.lastAmmo = ammo;
    }
    if (!this.flashEl.hidden && performance.now() > this.flashUntil) this.flashEl.hidden = true;

    const info = `ZERO ${s.zeroM} m  |  ${s.zoom.toFixed(0)}x  |  ${s.posture.toUpperCase()}`;
    if (info !== this.lastInfo) {
      this.info.textContent = info;
      this.lastInfo = info;
    }
  }

  /** Shows a short hit message (for example "HEAD  312 m"). */
  flash(text: string, lethal: boolean): void {
    this.flashEl.textContent = text;
    this.flashEl.dataset.lethal = lethal ? "1" : "0";
    this.flashEl.hidden = false;
    this.flashUntil = performance.now() + FLASH_MS;
  }

  private buildReticle(root: SVGSVGElement): void {
    const thin = {
      stroke: "currentColor",
      "stroke-width": 1,
      "vector-effect": "non-scaling-stroke",
    };
    const thick = {
      stroke: "currentColor",
      "stroke-width": 4,
      "vector-effect": "non-scaling-stroke",
    };
    const n = SCOPE.milDots;
    const inner = n + 1;
    const far = 2000;
    // Thin center lines out to just past the last dot, thick posts beyond.
    root.appendChild(svg("line", { x1: -inner, y1: 0, x2: inner, y2: 0, ...thin }));
    root.appendChild(svg("line", { x1: 0, y1: -inner, x2: 0, y2: inner, ...thin }));
    root.appendChild(svg("line", { x1: -far, y1: 0, x2: -inner, y2: 0, ...thick }));
    root.appendChild(svg("line", { x1: inner, y1: 0, x2: far, y2: 0, ...thick }));
    root.appendChild(svg("line", { x1: 0, y1: inner, x2: 0, y2: far, ...thick }));
    root.appendChild(svg("line", { x1: 0, y1: -far, x2: 0, y2: -inner, ...thick }));
    // Mil dots: 0.25 mil diameter at every whole mil.
    for (let k = 1; k <= n; k++) {
      for (const [x, y] of [
        [k, 0],
        [-k, 0],
        [0, k],
        [0, -k],
      ] as const) {
        root.appendChild(svg("circle", { cx: x, cy: y, r: 0.125, fill: "currentColor" }));
      }
    }
  }

  private buildArrow(): SVGSVGElement {
    const s = svg("svg", { viewBox: "-10 -10 20 20", class: "hud-wind-svg" });
    s.appendChild(
      svg("path", { d: "M0 -8 L5 1 L1.5 1 L1.5 8 L-1.5 8 L-1.5 1 L-5 1 Z", fill: "currentColor" }),
    );
    return s;
  }
}

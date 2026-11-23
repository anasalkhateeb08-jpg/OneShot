import { LESSONS, guideLanguage } from "./Lessons";
import type { GuideLang } from "./Lessons";

export interface CoachReading {
  distanceM: number;
  /** Crosswind, + blowing toward the shooter's right (m/s). */
  crosswind: number;
  /** Predicted impact offset from the crosshair (mils). */
  rightMils: number;
  upMils: number;
}

const COACH_TEXT: Record<
  GuideLang,
  {
    fromLeft: string;
    fromRight: string;
    left: string;
    right: string;
    up: string;
    down: string;
    noWind: string;
  }
> = {
  ar: {
    fromLeft: "من اليسار",
    fromRight: "من اليمين",
    left: "يسار",
    right: "يمين",
    up: "أعلى",
    down: "أسفل",
    noWind: "بلا ريح عرضية",
  },
  en: {
    fromLeft: "from the left",
    fromRight: "from the right",
    left: "left",
    right: "right",
    up: "up",
    down: "down",
    noWind: "no crosswind",
  },
};

/**
 * Practice-only training guide (D-028): a lesson panel (H show/hide, N next, P previous) and a
 * live coach line that explains the hold for the current distance and wind in mils.
 * Not present in real duels.
 */
export class Coach {
  private readonly lang: GuideLang = guideLanguage();
  private readonly panel: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly footer: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private index = 0;
  private lastLine = "";
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === "KeyH") this.panel.hidden = !this.panel.hidden;
    else if (e.code === "KeyN") this.show(this.index + 1);
    else if (e.code === "KeyP") this.show(this.index - 1);
  };

  constructor(root: HTMLElement) {
    const dir = this.lang === "ar" ? "rtl" : "ltr";
    this.panel = document.createElement("div");
    this.panel.className = "coach-panel";
    this.panel.dir = dir;
    this.title = document.createElement("div");
    this.title.className = "coach-title";
    this.body = document.createElement("div");
    this.body.className = "coach-body";
    this.footer = document.createElement("div");
    this.footer.className = "coach-footer";
    this.panel.append(this.title, this.body, this.footer);
    root.appendChild(this.panel);

    this.line = document.createElement("div");
    this.line.className = "coach-line";
    this.line.dir = dir;
    this.line.hidden = true;
    root.appendChild(this.line);

    window.addEventListener("keydown", this.onKey);
    this.show(0);
  }

  private show(i: number): void {
    const lessons = LESSONS[this.lang];
    this.index = Math.min(lessons.length - 1, Math.max(0, i));
    const lesson = lessons[this.index];
    if (!lesson) return;
    this.title.textContent = lesson.title;
    this.body.replaceChildren(
      ...lesson.lines.map((text) => {
        const p = document.createElement("p");
        p.textContent = text;
        return p;
      }),
    );
    this.footer.textContent =
      this.lang === "ar"
        ? `${this.index + 1} / ${lessons.length}   N التالي · P السابق · H إخفاء`
        : `${this.index + 1} / ${lessons.length}   N next · P previous · H hide`;
  }

  /** Live coach line while scoped; pass null to hide it. */
  update(reading: CoachReading | null): void {
    if (!reading) {
      this.line.hidden = true;
      return;
    }
    const t = COACH_TEXT[this.lang];
    const d = Math.round(reading.distanceM);
    const cw = Math.abs(reading.crosswind);
    const windText =
      cw < 0.2
        ? t.noWind
        : `${cw.toFixed(1)} ${this.lang === "ar" ? "م/ث" : "m/s"} ${reading.crosswind > 0 ? t.fromLeft : t.fromRight}`;
    // The hold is the opposite of where the bullet would land.
    const holdH = -reading.rightMils;
    const holdV = -reading.upMils;
    const hText = `${Math.abs(holdH).toFixed(1)} ${holdH >= 0 ? t.right : t.left}`;
    const vText = `${Math.abs(holdV).toFixed(1)} ${holdV >= 0 ? t.up : t.down}`;
    const text =
      this.lang === "ar"
        ? `المسافة ${d} م · الريح ${windText} · صوّب ${hText} ميل و ${vText} ميل`
        : `Distance ${d} m · wind ${windText} · hold ${hText} mil, ${vText} mil`;
    if (text !== this.lastLine) {
      this.line.textContent = text;
      this.lastLine = text;
    }
    this.line.hidden = false;
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKey);
    this.panel.remove();
    this.line.remove();
  }
}

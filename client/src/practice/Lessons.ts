/**
 * Practice training guide (D-028): step-by-step lessons on scope, breath, distance, zeroing,
 * bullet drop, and wind. Arabic and English for now; moved into the localization system with
 * review status in phase 8 (these drafts are NOT reviewed by a native editor yet).
 */

export type GuideLang = "ar" | "en";

export interface Lesson {
  title: string;
  lines: readonly string[];
}

export const LESSONS: Record<GuideLang, readonly Lesson[]> = {
  ar: [
    {
      title: "١. المنظار والنفَس",
      lines: [
        "زر الفأرة الأيمن مطولاً: المنظار. عجلة الفأرة أو V: التكبير.",
        "Shift مطولاً داخل المنظار: حبس النفَس. يثبت المنظار ويفرغ شريط الرئة أسفل العدسة.",
        "إذا فرغ الشريط ترتجف بقوة لثانيتين ونصف. أطلق قبل أن ينفد نفَسك.",
        "الانبطاح (Z) أقل اهتزازاً، والوقوف (X) أكثره.",
      ],
    },
    {
      title: "٢. المسافة والتصفير",
      lines: [
        "صوّب على الهدف واضغط B مطولاً لتقرأ مسافته.",
        "اضبط التصفير بـ Q و E على أقرب مسافة: 100 أو 200 أو 300 أو 400 متر.",
        "عند مسافة التصفير تصيب الرصاصة مركز التقاطع تماماً، إذا لم تكن هناك ريح.",
      ],
    },
    {
      title: "٣. هبوط الرصاصة",
      lines: [
        "إذا كان الهدف أبعد من التصفير تسقط الرصاصة أسفل المركز.",
        "كل نقطة على الخط العمودي = 1 ميل = 10 سم على 100 متر، و30 سم على 300 متر.",
        "ارفع تصويبك بعدد النقاط المناسب. النقطة الخضراء تُريك مكان السقوط.",
      ],
    },
    {
      title: "٤. قراءة الريح",
      lines: [
        "السهم في المنظار يُشير إلى حيث تهبّ الريح، والرقم سرعتها بالمتر في الثانية.",
        "الرصاصة تنجرف مع الريح. لذلك صوّب عكسها: ريح نحو اليمين = صوّب إلى اليسار.",
        "فقط الجزء العرضي من الريح يحرف الرصاصة. الريح من الأمام أو الخلف لا تحرفها جانبياً.",
      ],
    },
    {
      title: "٥. كم أعوّض؟",
      lines: [
        "كلما زادت الريح وزادت المسافة زاد الانحراف.",
        "تقريباً: كل 1 م/ث ريح عرضية على 300 متر ≈ 0.16 ميل، وعلى 450 متراً ≈ 0.26 ميل.",
        "سطر المدرّب أسفل الشاشة يكتب لك التعويض بالميل. قارنه بالنقطة الخضراء حتى تحفظه.",
      ],
    },
    {
      title: "٦. الأهداف المتحركة",
      lines: [
        "الرصاصة تحتاج وقتاً لتصل: نحو 0.4 ثانية إلى 300 متر.",
        "صوّب أمام الهدف في اتجاه حركته. النقطة الخضراء لا تحسب حركة الهدف.",
      ],
    },
    {
      title: "٧. في المبارزة",
      lines: [
        "في المبارزة الحقيقية لا توجد نقطة خضراء ولا مدرّب.",
        "تقرأ الريح والمسافة بنفسك. هنا يظهر القنّاص الحقيقي.",
      ],
    },
  ],
  en: [
    {
      title: "1. Scope and breath",
      lines: [
        "Hold right mouse: scope. Mouse wheel or V: zoom.",
        "Hold Shift while scoped: hold your breath. The scope steadies and the lung bar empties.",
        "When the bar is empty you shake hard for 2.5 s. Fire before your breath runs out.",
        "Prone (Z) sways least, standing (X) the most.",
      ],
    },
    {
      title: "2. Distance and zeroing",
      lines: [
        "Aim at the target and hold B to read its distance.",
        "Set the zero with Q and E to the closest value: 100, 200, 300, or 400 m.",
        "At the zero distance the bullet hits the center of the crosshair, if there is no wind.",
      ],
    },
    {
      title: "3. Bullet drop",
      lines: [
        "Beyond the zero distance the bullet lands below the center.",
        "Each dot on the vertical line = 1 mil = 10 cm at 100 m, 30 cm at 300 m.",
        "Aim higher by the right number of dots. The green dot shows where it will land.",
      ],
    },
    {
      title: "4. Reading the wind",
      lines: [
        "The arrow in the scope shows where the wind blows; the number is its speed in m/s.",
        "The bullet drifts WITH the wind, so aim INTO it: wind blowing right = aim left.",
        "Only the crosswind part moves the bullet sideways. Head or tail wind does not.",
      ],
    },
    {
      title: "5. How much to hold?",
      lines: [
        "More wind and more distance = more drift.",
        "Roughly: each 1 m/s of crosswind is 0.16 mil at 300 m and 0.26 mil at 450 m.",
        "The coach line at the bottom gives the hold in mils. Compare it with the green dot.",
      ],
    },
    {
      title: "6. Moving targets",
      lines: [
        "The bullet needs time: about 0.4 s to 300 m.",
        "Aim ahead of the target in its direction of travel. The green dot ignores target movement.",
      ],
    },
    {
      title: "7. In a duel",
      lines: [
        "Real duels have no green dot and no coach.",
        "You read the wind and the distance yourself. That is where real snipers show.",
      ],
    },
  ],
};

/** Arabic if the browser prefers Arabic, otherwise English (full language support in phase 8). */
export function guideLanguage(): GuideLang {
  const langs = navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  return langs.some((l) => l.toLowerCase().startsWith("ar")) ? "ar" : "en";
}

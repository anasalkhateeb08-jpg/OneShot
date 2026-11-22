═══════════════════════════════════════════════
ADD-ON MODULE: Mobile touch, localization (15 languages), APK shell, versioning
Append this at the END of the master prompt. It extends it; it does not replace it.
═══════════════════════════════════════════════

# A0. HOW THIS ADD-ON WORKS

- All rules in section 0 of the master prompt still apply. In particular: speak to the owner ONLY in Arabic, write tool names in Arabic letters inside Arabic sentences (Appendix C2 below adds the new names), and keep Latin letters for code only.
- Phases 7 to 10 run after Phase 6, one at a time, with the owner's explicit "start phase N".
- Where this add-on conflicts with the master prompt, this add-on wins ONLY for the topics listed here.

# A1. AMENDMENTS TO PHASES 0 AND 1 (do these NOW, not later)

- Phase 0: create `client/src/core/InputSource.ts` defining the InputSource interface (Appendix D). The game loop must read input ONLY through this interface, never directly from keyboard or mouse events.
- Phase 1: implement `KeyboardMouseInput` as the first InputSource. The rest of the game must not know which input is active.
- Phase 1: add mobile checks from the start: load the build on at least one real mid-range phone and record frame rate in PERF.md. A mobile frame-rate problem found in Phase 1 is cheap; found in Phase 7 it is expensive.
- Phase 3: the join message carries `inputClass`, `protocolVersion`, `clientBuild`, `shellVersionCode`, and `locale` (Appendix D). The server stores `inputClass` per match but does NOT use it for matching yet. Reason: the owner may split queues by input type later if playtests show a precision gap.

# A2. PHASE 7: MOBILE BROWSER AND TOUCH CONTROLS

Goal: the whole game is fully playable on a phone in the browser using touch only, at professional quality. No mouse or keyboard needed.

7.1 Input architecture
- `TouchInput` implements InputSource and produces the same ClientInput as keyboard and mouse. The server and the shared package do NOT change for touch.
- Auto-detect the input type on first interaction and with a coarse-pointer media query. Provide a manual switch in settings (hybrid devices exist).
- Use Pointer Events only (not legacy touch events). Each on-screen control owns its own pointer id, so five simultaneous fingers work. Handle pointercancel and lost pointer capture so a control never gets stuck pressed.

7.2 Controls (defaults; every number lives in the constants)
- Movement: a dynamic thumbstick. It appears wherever the left thumb lands inside the left 40% of the screen. It has a dead zone of 10% and analog speed.
- Look: dragging anywhere in the right zone rotates the view with a linear mapping and NO acceleration. While scoped, sensitivity is divided by the current zoom factor so aiming stays precise.
- Buttons: Scope (toggle, not hold), Fire (largest, bottom-right, fires on press), Breath-hold (hold), Posture (one tap cycles stand, crouch, prone), Zero up and Zero down (small), Rangefinder (hold), Pause.
- Minimum touch target 48 px. Fire 88 px, secondary buttons 64 px.
- Optional gyroscope fine-aim, ON only while scoped and only if the player enables it. On iOS it needs the explicit permission prompt. The server's look-rotation-speed validation (master section 13) applies unchanged.
- Optional haptics (vibration) where the browser supports it. Always guard the call; to my knowledge iOS Safari does not support it, so verify on real devices.

7.3 Fairness rules (non-negotiable)
- NO aim assist, NO auto-fire, NO snap-to-target, NO target magnetism, for any input type.
- Scope sway, breath-hold, bolt cycle, and ballistics are identical for touch and mouse (they are server-side anyway).

7.4 Layout editor
- Presets: Standard, Left-handed, Compact.
- Custom: the player drags each control, scales it between 70% and 140%, and sets opacity. Save to local storage inside try/catch and render correctly when storage is empty.
- Live preview on a real game frame, and a Reset button.

7.5 Screen and browser behavior
- Landscape only. Show a rotate prompt in portrait. Lock orientation where the browser allows it.
- Request fullscreen on the first tap where supported. To my knowledge iPhone Safari does not offer the Fullscreen API for pages, so on iPhone show a one-time hint to add the game to the home screen (installed web app mode). Verify on real devices.
- Disable browser gestures during play: no scroll, no pull-to-refresh, no double-tap zoom, no text selection, no context menu (touch-action none, overscroll-behavior none).
- Respect safe areas (notches) with safe-area insets, and use dynamic viewport height units.
- When the app goes to the background, pause local state and follow the master reconnect rules (15 seconds). On return, reconnect cleanly.
- Handle Wi-Fi to cellular switches: the WebSocket will drop, so reconnect automatically and show a small connection-quality indicator.

7.6 Mobile performance
- Start every mobile session at the Low preset. Cap pixel ratio at 0.75 initially (hard maximum device ratio 2). Shadows OFF by default on mobile. Shorter draw distance and fewer particles.
- Target 30 FPS on mid-range phones, with an optional 60 FPS mode. Adaptive quality keeps lowering settings if frame time rises (phones throttle when hot).
- Mobile texture memory budget about 48 MB (a first guess to measure).
- Handle WebGL context loss and restore without crashing the match.
- A battery-saver option that caps frame rate at 30.

7.7 Accessibility
- UI scale slider, colorblind-safe HUD colors, a reduce-motion option (no vignette pulse, no camera shake), and readable text sizes.

7.8 Onboarding
- A first-run interactive tutorial of at most 90 seconds, mostly WITHOUT text: icons and animated hints for scope, breath-hold, wind reading, and zeroing. Skippable and replayable. Any text it has goes through the localization system.

7.9 Done when
- A new player completes the tutorial and a practice match on a real phone using touch only.
- Five-finger multi-touch test passes (stick, look, fire, breath, scope at once, no stuck controls).
- Frame rates recorded in PERF.md on one low-end Android, one mid-range Android, and one iPhone.
- The owner has played a full real duel on a phone and gave feedback on feel.

# A3. PHASE 8: LOCALIZATION (15 LANGUAGES)

Supported languages (code: name), fixed list:
en: English
zh-Hans: Chinese (Simplified)
hi: Hindi
es: Spanish
fr: French
pt-BR: Portuguese (Brazil)
ru: Russian
ja: Japanese
de: German
id: Indonesian
tr: Turkish
ko: Korean
it: Italian
vi: Vietnamese
ar: Arabic (the 15th; the only right-to-left language)

8.1 Architecture
- ALL player-visible text lives in per-language JSON files, loaded lazily (only the active language is downloaded). English is the source and the fallback.
- No hardcoded strings anywhere in the code. No text baked into textures or images.
- Use i18next, with plurals via the built-in Intl.PluralRules, and numbers, dates, and times via the Intl APIs.
- Never build sentences by concatenating pieces. Every sentence is one key with named placeholders.
- Server messages to the client are CODES (for example CLIENT_OUTDATED, NO_TRIALS_LEFT), and the client translates them.
- Language choice order: saved choice, then browser language list, then English. A language selector is always one tap away in the menu.

8.2 Right-to-left (Arabic)
- Set the page direction from the language. Use logical CSS properties (start and end), not left and right.
- Mirror menus, lists, and text layouts. Do NOT mirror the game world, the scope reticle, the wind indicator, or the touch-control layout (the player's custom layout is respected).
- Numbers inside Arabic text follow the Intl default for the locale. Keep the match timer in a fixed, unambiguous format.

8.3 Fonts
- Chinese, Japanese, Korean, Hindi, and Arabic need extra fonts. Prefer system font stacks. If a custom font is required, ship a SUBSET and load it only when that language is active. Record the font license. Keep the first load under the master budget.

8.4 Layout safety
- Budget at least 35% text expansion (German and Russian run long). No fixed-width buttons with text. Provide a pseudo-localization debug mode (accented, lengthened fake text) to catch clipping.

8.5 Translation workflow
- Source English file, then a first draft of each language (the AI may draft), then mark each file with `reviewed: false` until a native speaker reviews it. Tell the owner clearly which languages are unreviewed. NEVER present a draft as reviewed.
- Keep a glossary file of fixed game terms (trial, bolt cycle, zeroing, sudden death, breath-hold, wind, rangefinder) with the approved translation per language, so terms stay consistent.
- Legal pages (privacy, terms) need professional review in each language before launch; flag this to the owner.
- Emails and the APK download page are localized too (A5).

8.6 Done when
- All 15 languages switch live without a reload.
- A CI script fails the build on any missing key, unused key, or placeholder mismatch.
- Pseudo-localization shows no clipped text on the main menu, HUD, shop, and tutorial.
- Arabic screenshots reviewed for correct mirroring.
- A table in docs lists each language and its review status.

# A4. PHASE 9: VERSIONING, INSTALLABLE WEB APP, AND ANDROID APK

9.1 Version handshake (protects live matches)
- The server defines `MIN_PROTOCOL_VERSION`. On join, if the client's `protocolVersion` is lower, the server rejects with the code CLIENT_OUTDATED, and the client shows a localized "reload to update" screen.
- Build files use content hashes in their names so browsers never serve stale code. Index files are never cached long-term.

9.2 Installable web app
- Add a web app manifest and a service worker (vite-plugin-pwa). Cache static assets only. NEVER cache API calls or the WebSocket. When a new version is detected, show a "new version available, reload" prompt instead of silently swapping files mid-match.
- This is the install path for iPhone users (home-screen web app). An APK is Android only.

9.3 Android shell (APK)
- Use Capacitor in a `shell/` folder. The shell loads the production website URL, so web updates reach installed apps WITHOUT reinstalling. The owner must be told: reinstall is needed only when the shell itself changes.
- Immersive fullscreen, landscape lock, keep the screen awake, correct hardware Back button (opens the pause menu), splash screen, adaptive icon.
- Permissions: INTERNET only. Cleartext traffic disabled. Navigation allowed only to the game's own domains and to the payment and ad domains. Everything else opens in the external browser.
- Open the Polar checkout in an in-app browser tab, not inside the game view.
- Ads inside the shell: when the owner gets approved for Google H5 Games Ads, follow Google's documentation for the app (AdMob slot) integration of that program. Do NOT code it before approval.
- Offline: show a clear localized offline screen with a retry button.
- Signing: create ONE release keystore, once. Tell the owner to back it up in two separate safe places and never put it in the repository. If it is lost, users cannot update and must uninstall. Increase versionCode on every release. Build with Android Studio and Gradle on Windows, with step-by-step PowerShell and click instructions for the owner.

9.4 Download page
- Hosted on the game's website, in all 15 languages: the APK button, the SHA-256 checksum, minimum Android version, and clear install steps (allow installs from this source, with screenshots). State plainly that the APK exists ONLY on the official site.
- Host the APK file on GitHub Releases or Cloudflare R2. To my knowledge Cloudflare Pages limits each file to about 25 MB, so verify before putting the APK there.
- iPhone visitors see the add-to-home-screen instructions instead.

9.5 Update notices
- The server exposes `GET /app-version` returning AppVersionInfo (Appendix D). The shell sends its version code in a request header.
- Shell version below `minShellVersionCode`: a blocking screen with a button to the download page.
- Shell version below `latestShellVersionCode`: a dismissible banner at most once per 24 hours.
- Email notice: a script run MANUALLY by the owner after a new shell release. It defaults to DRY-RUN (prints who would receive it) and needs an explicit confirm flag to send.
  - Recipients: only accounts that have used the APK and have OPTED IN to update emails (a clear, unticked checkbox at sign-up and in settings).
  - Content: a localized short message with a link to the official download page. NEVER attach the APK. Include a working unsubscribe link.
  - Sending: one transactional email provider (Resend), batches of 50 per minute, idempotent per release id (no duplicate sends), every send logged.
  - Before the first send, the owner sets up SPF, DKIM, and DMARC for the sending domain; give step-by-step instructions.
- New tables: `shell_installs(account_id, last_seen_version_code, last_seen_at)`, `email_prefs(account_id, updates_opt_in, locale)`, `email_log(release_id, account_id, sent_at)`.

9.6 Done when
- A client with an old protocol version is rejected cleanly with the localized message.
- An old APK sees the update banner and, after raising the minimum, the blocking screen.
- The dry-run email script lists the right recipients, and a test send reaches a test inbox exactly once even if run twice.
- The APK installs and plays a full match on a real Android phone.
- The signed APK's checksum matches the one on the download page.

# A5. PHASE 10: GROWTH TOOLS (optional, after Phase 9)

- Share clip: record the bullet-cam replay from the canvas (canvas capture plus MediaRecorder), 5 to 15 seconds, with a small watermark showing the game's address. Share through the Web Share API where available, else download. Browser support for recording varies; to my knowledge Safari is the weakest, so test and provide a fallback. Localized caption text.
- Privacy-friendly analytics, only with consent where required, and only these events with no personal data: app_open, tutorial_done, queue_enter, match_start, match_end, purchase, ad_watched, clip_shared. Purpose: measure the funnel and day-1 and day-7 return rates.
- Done when: a clip is created and shared on at least Android Chrome and one desktop browser, and the analytics events appear in the dashboard with consent respected.

# A6. ADDED PROHIBITIONS

- Never add aim assist of any kind.
- Never attach an APK to an email, and never link to anywhere except the official download page.
- Never send update emails to accounts that have not opted in.
- Never present an unreviewed translation as reviewed.
- Never cache API responses or the WebSocket in the service worker.
- Never commit the signing keystore or any secret.

═══════════════════════════════════════════════
APPENDIX D: Added types and constants
═══════════════════════════════════════════════

// shared/src/messages.ts additions
export type InputClass = "mouseKeyboard" | "touch";

export interface JoinOptions {
  timerPreset: TimerPreset;
  inputClass: InputClass;
  protocolVersion: number;
  clientBuild: string;
  shellVersionCode: number | null;
  locale: string;
}

export interface AppVersionInfo {
  latestShellVersionCode: number;
  minShellVersionCode: number;
  minProtocolVersion: number;
  downloadPageUrl: string;
  apkSha256: string;
  releaseNotesKey: string;
}

export type ServerErrorCode = "CLIENT_OUTDATED" | "NO_TRIALS_LEFT" | "QUEUE_TIMEOUT" | "RESTRICTED";

// client/src/core/InputSource.ts
export interface InputSource {
  readonly kind: InputClass;
  poll(dtSeconds: number): ClientInput;
  dispose(): void;
}

// client/src/input/touchTypes.ts
export type TouchControlId =
  | "stick" | "look" | "scope" | "fire" | "breath"
  | "posture" | "zeroUp" | "zeroDown" | "rangefinder" | "pause";

export interface TouchLayoutItem {
  id: TouchControlId;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface TouchLayout {
  preset: "standard" | "leftHanded" | "compact" | "custom";
  items: TouchLayoutItem[];
  lookSensitivity: number;
  scopedSensitivityFollowsZoom: boolean;
  gyroEnabled: boolean;
  hapticsEnabled: boolean;
}

// shared/src/constants.ts additions (first guesses, tune by playtesting)
export const TOUCH = {
  minTargetPx: 48,
  fireButtonPx: 88,
  secondaryButtonPx: 64,
  stickDeadZone: 0.1,
  stickRadiusPx: 64,
  stickZoneWidthFraction: 0.4,
  layoutScaleMin: 0.7,
  layoutScaleMax: 1.4,
  mobilePixelRatioCapStart: 0.75,
  mobileDevicePixelRatioMax: 2,
  mobileTargetFps: 30,
  mobileTextureBudgetMb: 48,
  tutorialMaxSeconds: 90,
};
export const VERSIONING = {
  shellBannerIntervalHours: 24,
  emailBatchSize: 50,
  emailBatchIntervalSeconds: 60,
  emailDryRunDefault: true,
};
export const LANGUAGES = [
  "en", "zh-Hans", "hi", "es", "fr", "pt-BR", "ru",
  "ja", "de", "id", "tr", "ko", "it", "vi", "ar",
] as const;
export const TEXT_EXPANSION_BUDGET = 1.35;

═══════════════════════════════════════════════
APPENDIX C2: Arabic spelling of the new tool names (for speaking to the owner)
═══════════════════════════════════════════════

Capacitor = كاباسيتور
Android Studio = أندرويد ستوديو
Gradle = غريدل
PWA (installable web app) = تطبيق ويب تقدمي
Service worker = عامل الخدمة
vite-plugin-pwa = إضافة فايت للتطبيقات التقدمية
i18next = آي 18 إن إكست
Resend = ريسيند
SHA-256 = إس إتش إيه 256
GitHub Releases = إصدارات غيت هب
Cloudflare R2 = كلاودفلير آر تو
AdMob = أدموب
Web Share API = واجهة المشاركة في الويب
MediaRecorder = مسجّل الوسائط
Pointer Events = أحداث المؤشر
SPF, DKIM, DMARC = إس بي إف، دي كيم، دي ماركس
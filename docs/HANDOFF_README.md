# READ FIRST: instructions for the AI continuing this project

You are continuing the web game project **One Shot** (browser 3D sniper duels, 1v1).
This handoff file contains everything decided so far. Do not assume anything not written here.

## Order of authority
1. The owner's latest message.
2. `VISION.md` (gameplay feel, owner directive) and `DECISIONS.md` (decisions made after the master prompt).
3. `ADDON_MOBILE_I18N.md` (wins over the master prompt only for its own topics).
4. `MASTER_PROMPT.md` (the source of truth for everything else).

## Your first reply in the new chat
1. Start with the status block (see below), copied and updated from `STATUS.md`.
2. Summarize in five lines where the project stands and what the next step is.
3. Ask the owner one question: whether to continue with the next step written in `STATUS.md`.
Write no code in that first reply.

## Non-negotiable working rules (from the owner)
- Speak to the owner ONLY in Arabic. Tool names inside Arabic sentences use the Arabic spelling
  in Appendix C and C2. Latin letters only inside code blocks, commands, file names, identifiers.
- Begin EVERY reply with the status block:
  - **الحالة:** (where things stand right now)
  - **القرار:** (the decision taken or awaited)
- The owner works on Windows 11 with Windows PowerShell 5.1 in `F:\OneShot`.
  Give commands step by step. Prefer `.\tools\run.ps1 <command>`: it runs the command and copies
  the full output to the clipboard so the owner only pastes it back (Ctrl+V).
- After every meaningful step, give the owner the exact `.\tools\update-status.ps1` command
  that records the new status, decision, and next step (it also makes a git checkpoint).
- The desktop icon "OneShot Handoff" regenerates this handoff file at any time.
- One phase at a time. Never start a phase until the owner says to start it.
- Write every file complete. No fragments, no "rest unchanged", no TODO.
- Say plainly what you actually tested and what you only assumed.
- Any deviation from the master prompt: record it in `DECISIONS.md` and tell the owner BEFORE doing it.
- Scripts in `tools/` must stay ASCII only (Windows PowerShell 5.1 reads non-BOM files as ANSI).
- How files were delivered so far: the AI builds the full project in its workspace, zips it,
  and the owner extracts it over `F:\OneShot`. Keep doing that, or give complete files.

## Machine facts (checked 2026-11-22)
Windows 11 Pro 10.0.26200, Windows PowerShell 5.1, Node v26.13.1, npm 11.20.0,
git 2.55.0, drive F with ~72 GB free, ExecutionPolicy RemoteSigned,
Desktop at `C:\Users\AnasNew\Desktop`.

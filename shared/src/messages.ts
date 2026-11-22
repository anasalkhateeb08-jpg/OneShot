/**
 * Message types between client and server.
 * Source: master prompt Appendix A and add-on Appendix D.
 * Must not import Three.js, Colyseus, DOM, or Node APIs.
 */

export type Vec3 = { x: number; y: number; z: number };
export type Posture = "stand" | "crouch" | "prone";
export type HitZone = "head" | "torso" | "limb";
export type TimerPreset = 180 | 300 | 600;
export type MatchPhase = "waiting" | "countdown" | "live" | "suddenDeath" | "ended";
export type MatchResult = "win" | "loss" | "draw";
export type InputClass = "mouseKeyboard" | "touch";

export interface ClientInput {
  seq: number;
  dt: number;
  moveX: number;
  moveZ: number;
  yaw: number;
  pitch: number;
  posture: Posture;
  scoped: boolean;
  holdBreath: boolean;
  zeroIndex: 0 | 1 | 2 | 3;
}

export interface FireMessage {
  seq: number;
  clientServerTimeMs: number;
}

export interface PlayerSnapshot {
  id: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  posture: Posture;
  scoped: boolean;
  lastProcessedInputSeq: number;
}

export interface ShotFired {
  shotId: number;
  shooterId: string;
  origin: Vec3;
  direction: Vec3;
  muzzleSpeed: number;
  serverTimeMs: number;
}

export interface HitConfirmed {
  shotId: number;
  victimId: string;
  zone: HitZone;
  lethal: boolean;
  distanceM: number;
  serverTimeMs: number;
  path: Vec3[];
}

export interface TimerSync {
  phase: MatchPhase;
  serverTimeMs: number;
  endsAtServerTimeMs: number;
}

export interface ExposureEvent {
  kind: "glint" | "shotCue" | "suddenDeathPulse" | "campCue";
  serverTimeMs: number;
  sectorCenterDeg: number;
  sectorWidthDeg: number;
}

export interface MatchEnded {
  result: MatchResult;
  rewardApplied: boolean;
  newFreeBalance: number;
}

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

export const MSG = {
  join: "join",
  input: "input",
  fire: "fire",
  ping: "ping",
  pong: "pong",
  shotFired: "shotFired",
  hitConfirmed: "hitConfirmed",
  timerSync: "timerSync",
  exposure: "exposure",
  matchEnded: "matchEnded",
} as const;

export type MessageName = (typeof MSG)[keyof typeof MSG];

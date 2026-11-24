export type GamePhase = 'intro' | 'transition' | 'playing';
export type ItemCategory = 'snack' | 'beer';

export interface MissionConfig {
  id: number;
  code: string;
  xpLabel: string;
  title: string;
  hebrewCue: string;
  icon: 'cookie' | 'beer' | 'party';
  targetCategory: ItemCategory | 'any';
  targetCount: number;
  xpReward: number;
}

export interface CatchEvent {
  category: ItemCategory;
  isTarget: boolean;
  screenX: number;
  screenY: number;
  displayDelta: number;
  combo: number;
}

export interface GameSnapshot {
  phase: GamePhase;
  mission: MissionConfig;
  missionProgress: number;
  totalCaught: number;
  xp: number;
  combo: number;
  autoplay: boolean;
  muted: boolean;
  cleanMode: boolean;
  audioUnlocked: boolean;
  subtitleOverride: string | null;
}

export interface AssetManifestItem {
  id: string;
  path: string;
  category: ItemCategory;
  width: number;
  height: number;
  subsurfaceTint: string;
}

export interface AssetManifest {
  logicalWidth: 576;
  logicalHeight: 1024;
  characterCanvasWidth: number;
  characterCanvasHeight: number;
  characterAnchorOffsetX: number;
  sackMouth: {
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    clipFloorY: number;
  };
  characterPivot: { x: number; y: number };
  sackPivot: { x: number; y: number };
  background: string;
  characterBack: string;
  sackFront: string;
  items: AssetManifestItem[];
}

export interface RecordCatchResult {
  isTarget: boolean;
  displayDelta: number;
  missionAdvanced: boolean;
  completedMission: MissionConfig | null;
  combo: number;
  xpAwarded: number;
}

export interface HudCallbacks {
  onReplayIntro: () => void;
  onSkipIntro: () => void;
  onToggleAutoplay: () => void;
  onToggleMute: () => void;
  onToggleCleanMode: () => void;
  onUnlockAudio?: () => void;
}

export interface AgudaDebugAPI {
  jumpToPhase: (phase: GamePhase) => void;
  setMission: (missionId: number) => void;
  spawnItemNow: (category?: ItemCategory, x?: number) => void;
  triggerCatchDemo: (category?: ItemCategory) => void;
  setAutoplay: (enabled: boolean) => void;
  setCleanMode: (enabled: boolean) => void;
  getState: () => GameSnapshot & {
    playerDeltaX: number;
    activeItems: number;
    fps: number;
  };
}

declare global {
  interface Window {
    __agudaDebug?: AgudaDebugAPI;
  }
}

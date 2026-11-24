import type { ItemCategory, MissionConfig, RecordCatchResult } from '../types';

const BASE_MISSIONS: readonly MissionConfig[] = [
  {
    id: 1,
    code: 'MISSION 01',
    xpLabel: '+100 XP',
    title: 'SNACKS COLLECTED',
    hebrewCue: 'אוספים את הנשנושים',
    icon: 'cookie',
    targetCategory: 'snack',
    targetCount: 5,
    xpReward: 100,
  },
  {
    id: 2,
    code: 'MISSION 02',
    xpLabel: '+200 XP',
    title: 'BEERS COLLECTED',
    hebrewCue: 'עכשיו אוספים את הבירות',
    icon: 'beer',
    targetCategory: 'beer',
    targetCount: 5,
    xpReward: 200,
  },
  {
    id: 3,
    code: 'MISSION 03',
    xpLabel: '+300 XP',
    title: 'PARTY PACK COLLECTED',
    hebrewCue: 'אוספים הכול למסיבה',
    icon: 'party',
    targetCategory: 'any',
    targetCount: 8,
    xpReward: 300,
  },
];

const CELEBRATORY_CATCH_CUE = 'יופי, עוד אחד לשק!';
const SUBTITLE_OVERRIDE_MS = 1600;
const CATCH_XP_BONUS = 10;

function buildMissionConfig(id: number): MissionConfig {
  const normalizedId = Math.max(1, Math.floor(id));
  if (normalizedId <= BASE_MISSIONS.length) {
    return { ...BASE_MISSIONS[normalizedId - 1] };
  }

  const codeNumber = String(normalizedId).padStart(2, '0');
  const xpReward = normalizedId * 100;
  return {
    id: normalizedId,
    code: `MISSION ${codeNumber}`,
    xpLabel: `+${xpReward} XP`,
    title: 'PARTY PACK COLLECTED',
    hebrewCue: 'אוספים הכול למסיבה',
    icon: 'party',
    targetCategory: 'any',
    targetCount: 8,
    xpReward,
  };
}

/**
 * Tracks active mission state, catch combo streaks, XP progression,
 * and temporary Hebrew celebratory subtitle overrides.
 */
export class MissionManager {
  private readonly onChange?: () => void;
  private mission: MissionConfig;
  private progress = 0;
  private totalCaught = 0;
  private xp = 0;
  private combo = 0;
  private subtitleOverride: string | null = null;
  private subtitleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(onChange?: () => void) {
    this.onChange = onChange;
    this.mission = buildMissionConfig(1);
  }

  getCurrentMission(): MissionConfig {
    return { ...this.mission };
  }

  getProgress(): number {
    return this.progress;
  }

  getTotalCaught(): number {
    return this.totalCaught;
  }

  getXP(): number {
    return this.xp;
  }

  getCombo(): number {
    return this.combo;
  }

  getSubtitleOverride(): string | null {
    return this.subtitleOverride;
  }

  recordCatch(category: ItemCategory): RecordCatchResult {
    const isTarget =
      this.mission.targetCategory === 'any' || this.mission.targetCategory === category;

    if (!isTarget) {
      this.combo = 0;
      this.onChange?.();
      return {
        isTarget: false,
        displayDelta: 0,
        missionAdvanced: false,
        completedMission: null,
        combo: this.combo,
        xpAwarded: 0,
      };
    }

    this.combo += 1;
    this.totalCaught += 1;
    this.progress += 1;

    const displayDelta = this.combo;
    let xpAwarded = CATCH_XP_BONUS;
    let missionAdvanced = false;
    let completedMission: MissionConfig | null = null;

    if (this.progress >= this.mission.targetCount) {
      completedMission = { ...this.mission };
      xpAwarded += completedMission.xpReward;
      missionAdvanced = true;
      this.mission = buildMissionConfig(this.mission.id + 1);
      this.progress = 0;
      this.clearSubtitleOverride();
    } else if (this.isMilestoneCatch()) {
      this.triggerCelebratoryCue();
    }

    this.xp += xpAwarded;
    this.onChange?.();

    return {
      isTarget: true,
      displayDelta,
      missionAdvanced,
      completedMission,
      combo: this.combo,
      xpAwarded,
    };
  }

  setMissionById(id: number): void {
    this.mission = buildMissionConfig(id);
    this.progress = 0;
    this.clearSubtitleOverride();
    this.onChange?.();
  }

  reset(): void {
    this.mission = buildMissionConfig(1);
    this.progress = 0;
    this.totalCaught = 0;
    this.xp = 0;
    this.combo = 0;
    this.clearSubtitleOverride();
    this.onChange?.();
  }

  private isMilestoneCatch(): boolean {
    return this.progress === 2 || this.progress === 4 || this.combo % 3 === 0;
  }

  private triggerCelebratoryCue(): void {
    this.clearSubtitleOverride();
    this.subtitleOverride = CELEBRATORY_CATCH_CUE;
    this.subtitleTimer = globalThis.setTimeout(() => {
      this.subtitleTimer = null;
      this.subtitleOverride = null;
      this.onChange?.();
    }, SUBTITLE_OVERRIDE_MS);
  }

  private clearSubtitleOverride(): void {
    if (this.subtitleTimer !== null) {
      globalThis.clearTimeout(this.subtitleTimer);
      this.subtitleTimer = null;
    }
    this.subtitleOverride = null;
  }
}

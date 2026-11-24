import type { ItemCategory } from '../types';

export interface TrackableItem {
  x: number;
  y: number;
  vy: number;
  category: ItemCategory;
  state: 'falling' | 'catching';
}

export class AutoplayAI {
  private smoothedTargetDeltaX = 0;

  public reset(currentDeltaX: number): void {
    this.smoothedTargetDeltaX = currentDeltaX;
  }

  public computeTargetDeltaX(
    dt: number,
    elapsedTime: number,
    currentDeltaX: number,
    mouthBaseX: number,
    mouthY: number,
    targetCategory: ItemCategory | 'any',
    items: readonly TrackableItem[],
    minDeltaX: number,
    maxDeltaX: number,
  ): number {
    const currentMouthX = mouthBaseX + currentDeltaX;
    let bestItem: TrackableItem | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const item of items) {
      if (item.state !== 'falling') continue;
      if (item.y > mouthY + 24) continue;

      const isTarget = targetCategory === 'any' || item.category === targetCategory;
      const timeToMouth = Math.max(0.05, (mouthY - item.y) / Math.max(120, item.vy));
      const horizDist = Math.abs(item.x - currentMouthX);

      // Strongly prefer mission-target items; penalize wrong-category items
      const categoryPenalty = isTarget ? 0 : 12.0;
      const score = timeToMouth + horizDist * 0.0018 + categoryPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    let rawDesiredDeltaX: number;
    if (bestItem) {
      const isTarget = targetCategory === 'any' || bestItem.category === targetCategory;
      if (isTarget) {
        // Gentle organic micro-offset so catches look natural rather than robotic center-lock
        const organicMicro = Math.sin(elapsedTime * 1.9) * 6;
        rawDesiredDeltaX = bestItem.x - mouthBaseX + organicMicro;
      } else {
        // If only a wrong-category item is falling, step aside gently
        const dodgeDir = bestItem.x > currentMouthX ? -1 : 1;
        rawDesiredDeltaX = currentDeltaX + dodgeDir * 95;
      }
    } else {
      // Idle organic sway around center courtyard stance
      rawDesiredDeltaX = Math.sin(elapsedTime * 1.15) * 28;
    }

    const clampedTarget = Math.max(minDeltaX, Math.min(maxDeltaX, rawDesiredDeltaX));

    // Human-like exponential smoothing before spring movement
    const followRate = 1 - Math.exp(-dt * 5.8);
    this.smoothedTargetDeltaX += (clampedTarget - this.smoothedTargetDeltaX) * followRate;
    return this.smoothedTargetDeltaX;
  }
}

import * as THREE from 'three';
import type {
  AgudaDebugAPI,
  AssetManifest,
  AssetManifestItem,
  GamePhase,
  GameSnapshot,
  ItemCategory,
} from '../types';
import { AudioEngine } from '../audio/AudioEngine';
import { MissionManager } from '../game/MissionManager';
import { HudOverlay } from '../ui/HudOverlay';
import { AutoplayAI } from './AutoplayAI';
import { CinematicsController } from './CinematicsController';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, SceneRenderer } from './SceneRenderer';

interface ActiveItem {
  id: number;
  config: AssetManifestItem;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  category: ItemCategory;
  state: 'falling' | 'catching';
  x: number;
  y: number;
  vy: number;
  rotation: number;
  rotSpeed: number;
  catchOffsetX: number;
}

const FALLBACK_MANIFEST: AssetManifest = {
  logicalWidth: 576,
  logicalHeight: 1024,
  characterCanvasWidth: 768,
  characterCanvasHeight: 1024,
  characterAnchorOffsetX: -140,
  sackMouth: {
    cx: 390,
    cy: 675,
    rx: 82,
    ry: 36,
    clipFloorY: 820,
  },
  characterPivot: { x: 360, y: 512 },
  sackPivot: { x: 360, y: 780 },
  background: './assets/bg_courtyard.png',
  characterBack: './assets/character_back.png',
  sackFront: './assets/sack_front.png',
  items: [
    {
      id: 'snack_bag_orange_blue',
      path: './assets/items/snack_bag_orange_blue.png',
      category: 'snack',
      width: 116,
      height: 152,
      subsurfaceTint: '#FFA23A',
    },
    {
      id: 'beer_amber_1',
      path: './assets/items/beer_amber_1.png',
      category: 'beer',
      width: 78,
      height: 182,
      subsurfaceTint: '#FFAA33',
    },
  ],
};

export interface EngineMountNodes {
  stageEl: HTMLElement;
  webglEl: HTMLElement;
  cinematicsEl: HTMLElement;
  dockEl: HTMLElement;
}

export class GameEngine {
  private readonly stageEl: HTMLElement;
  private readonly renderer: SceneRenderer;
  private readonly missionManager: MissionManager;
  private readonly audio: AudioEngine;
  private readonly hud: HudOverlay;
  private readonly cinematics: CinematicsController;
  private readonly autoplayAI = new AutoplayAI();

  private manifest: AssetManifest = FALLBACK_MANIFEST;
  private phase: GamePhase = 'intro';
  private autoplay = false;
  private cleanMode = false;

  private playerDeltaX = 0;
  private targetDeltaX = 0;
  private playerVelocityX = 0;
  private minDeltaX = -240;
  private maxDeltaX = 120;

  private readonly activeItems: ActiveItem[] = [];
  private nextItemId = 1;
  private lastSpawnId: string | null = null;
  private lastSpawnX = 288;
  private nextSpawnTimer = 0.4;

  private readonly keysHeld = new Set<'left' | 'right'>();
  private draggingPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartDeltaX = 0;

  private rafId: number | null = null;
  private lastFrameMs = 0;
  private elapsedTime = 0;
  private fpsSmoothed = 60;
  private paused = false;
  private disposed = false;

  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onKeyUpBound: (e: KeyboardEvent) => void;
  private readonly onBlurBound: () => void;
  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;

  constructor(nodes: EngineMountNodes) {
    this.stageEl = nodes.stageEl;
    this.renderer = new SceneRenderer(nodes.webglEl);
    this.audio = new AudioEngine();
    this.missionManager = new MissionManager(() => this.emitSnapshot());

    this.hud = new HudOverlay(nodes.stageEl, nodes.dockEl, {
      onReplayIntro: () => this.replayIntro(),
      onSkipIntro: () => this.skipCinematics(),
      onToggleAutoplay: () => this.setAutoplay(!this.autoplay),
      onToggleMute: () => this.toggleMute(),
      onToggleCleanMode: () => this.setCleanMode(!this.cleanMode),
      onUnlockAudio: () => void this.unlockAudio(),
    });

    this.cinematics = new CinematicsController(nodes.cinematicsEl, {
      onPhaseChange: (nextPhase) => this.handlePhaseChange(nextPhase),
      onStartIntroTrack: () => this.audio.playCinematicsTrack(0),
      onStartMission1Voice: () => this.audio.playVoiceMission1(),
      onCrossfadeToGameplay: () => this.audio.startGameplayBeat(),
    });

    this.onKeyDownBound = (e) => this.handleKeyDown(e);
    this.onKeyUpBound = (e) => this.handleKeyUp(e);
    this.onBlurBound = () => this.keysHeld.clear();
    this.onPointerDownBound = (e) => this.handlePointerDown(e);
    this.onPointerMoveBound = (e) => this.handlePointerMove(e);
    this.onPointerUpBound = (e) => this.handlePointerUp(e);

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    this.stageEl.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerUpBound);

    this.installDebugAPI();
  }

  public async init(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const cleanParam = params.get('clean');
    const autoplayParam = params.get('autoplay');
    const missionParam = params.get('mission');
    const phaseParam = params.get('phase') as GamePhase | null;
    const seekParam = params.get('seek');
    const spawnParam = params.get('spawn');
    const demoCatchParam = params.get('demoCatch');
    const advanceMsParam = params.get('advanceMs');
    const pauseParam = params.get('pause');

    if (cleanParam === '1' || cleanParam === 'true') {
      this.cleanMode = true;
    }
    if (autoplayParam === '1' || autoplayParam === 'true') {
      this.autoplay = true;
    }
    if (missionParam !== null) {
      const mId = Number(missionParam);
      if (Number.isFinite(mId) && mId >= 1) {
        this.missionManager.setMissionById(mId);
      }
    }

    this.paused = pauseParam === '1' || pauseParam === 'true';

    const effectivePhase: GamePhase =
      spawnParam || demoCatchParam
        ? 'playing'
        : phaseParam === 'intro' || phaseParam === 'transition' || phaseParam === 'playing'
          ? phaseParam
          : 'intro';

    const seekSeconds =
      seekParam !== null && Number.isFinite(Number(seekParam))
        ? Math.max(0, Number(seekParam))
        : effectivePhase === 'transition'
          ? 0.5
          : 0;

    this.emitSnapshot();

    if (effectivePhase === 'playing') {
      this.cinematics.jumpToPhase('playing');
    } else if (!this.paused) {
      this.cinematics.jumpToPhase(effectivePhase, seekSeconds);
    }

    if (!this.paused) {
      this.startLoop();
    }

    const fontReady =
      typeof document !== 'undefined' && 'fonts' in document
        ? Promise.race([
            document.fonts.load('900 196px Montserrat').then(() => undefined),
            new Promise<void>((r) => window.setTimeout(r, 600)),
          ]).catch(() => undefined)
        : Promise.resolve();

    const [, loadedManifest] = await Promise.all([
      this.audio.preload(),
      this.loadManifest(),
      fontReady,
    ]);

    if (this.disposed) return;

    this.manifest = loadedManifest;
    this.computeMovementBounds();
    await this.renderer.loadManifestAssets(this.manifest);

    if (this.disposed) return;

    if (this.paused && effectivePhase !== 'playing') {
      await this.cinematics.pauseAt(effectivePhase, seekSeconds);
    }

    if (spawnParam) {
      const byExactId = this.manifest.items.find((item) => item.id === spawnParam);
      const bagPreferred =
        spawnParam === 'snack'
          ? this.manifest.items.find((item) => item.id.startsWith('snack_bag_'))
          : undefined;
      const categoryFallback =
        spawnParam === 'snack' || spawnParam === 'beer'
          ? this.pickItemConfig(spawnParam)
          : undefined;
      const config = byExactId ?? bagPreferred ?? categoryFallback;
      if (config) {
        const mouthX = this.manifest.sackMouth.cx + this.playerDeltaX;
        this.spawnItemEntity(config, mouthX, 340);
      }
    }

    if (demoCatchParam) {
      const byExactId = this.manifest.items.find((item) => item.id === demoCatchParam);
      if (byExactId) {
        const mouthX = this.manifest.sackMouth.cx + this.playerDeltaX;
        const mouthY = this.manifest.sackMouth.cy;
        const entryY = mouthY - byExactId.height * 0.08;
        const item = this.spawnItemEntity(byExactId, mouthX, entryY, 260);
        item.rotation = 0.04;
        this.handleCatch(item, mouthX, mouthY);
        this.syncItemMesh(item, this.activeItems.length - 1);
      } else if (demoCatchParam === 'snack' || demoCatchParam === 'beer') {
        window.__agudaDebug?.triggerCatchDemo(demoCatchParam);
      }
    }

    const advanceMs = advanceMsParam !== null ? Math.max(0, Number(advanceMsParam) || 0) : 0;
    if (advanceMs > 0) {
      this.stepSimulation(advanceMs);
    } else if (this.paused) {
      this.renderer.update(0.001, this.elapsedTime, this.playerDeltaX, this.playerVelocityX);
    }

    this.emitSnapshot();
  }

  private stepSimulation(totalMs: number): void {
    const stepSec = 1 / 60;
    let remainingSec = totalMs / 1000;
    while (remainingSec > 0.0001) {
      const dt = Math.min(stepSec, remainingSec);
      this.elapsedTime += dt;
      this.update(dt);
      remainingSec -= dt;
    }
    this.renderer.update(0.001, this.elapsedTime, this.playerDeltaX, this.playerVelocityX);
  }

  private async loadManifest(): Promise<AssetManifest> {
    try {
      const response = await fetch('./assets/manifest.json', { cache: 'no-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const parsed = (await response.json()) as AssetManifest;
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
        throw new Error('Invalid manifest items');
      }
      return parsed;
    } catch (err) {
      console.warn('[GameEngine] Using fallback manifest:', err);
      return FALLBACK_MANIFEST;
    }
  }

  private computeMovementBounds(): void {
    const mouthCx = this.manifest.sackMouth.cx;
    const anchorOffsetX = this.manifest.characterAnchorOffsetX;

    // Keep left edge of character canvas unclipped while letting mouth travel across courtyard
    this.minDeltaX = Math.max(-265, 86 - mouthCx);
    this.maxDeltaX = Math.min(-anchorOffsetX - 2, 505 - mouthCx);
    if (this.maxDeltaX < this.minDeltaX) {
      this.maxDeltaX = 110;
    }
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    this.lastFrameMs = performance.now();

    const tick = (nowMs: number) => {
      if (this.disposed) return;
      const rawDt = Math.max(0.001, (nowMs - this.lastFrameMs) / 1000);
      const dt = Math.min(rawDt, 0.05);
      this.lastFrameMs = nowMs;
      this.elapsedTime += dt;

      const instantFps = 1 / rawDt;
      this.fpsSmoothed = this.fpsSmoothed * 0.92 + instantFps * 0.08;

      this.update(dt);
      this.rafId = window.requestAnimationFrame(tick);
    };

    this.rafId = window.requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    if (this.phase === 'playing') {
      this.updatePlayerMovement(dt);
      this.updateSpawner(dt);
      this.updateItems(dt);
    } else {
      // Smoothly return player stance to rest during cinematics
      this.playerDeltaX += (0 - this.playerDeltaX) * (1 - Math.exp(-dt * 8));
      this.targetDeltaX = this.playerDeltaX;
      this.playerVelocityX = 0;
    }

    this.renderer.update(dt, this.elapsedTime, this.playerDeltaX, this.playerVelocityX);
  }

  private updatePlayerMovement(dt: number): void {
    const moveDir =
      (this.keysHeld.has('right') ? 1 : 0) - (this.keysHeld.has('left') ? 1 : 0);

    if (moveDir !== 0) {
      this.targetDeltaX = this.clampDeltaX(this.targetDeltaX + moveDir * 520 * dt);
    } else if (this.autoplay && this.draggingPointerId === null) {
      const mission = this.missionManager.getCurrentMission();
      this.targetDeltaX = this.autoplayAI.computeTargetDeltaX(
        dt,
        this.elapsedTime,
        this.playerDeltaX,
        this.manifest.sackMouth.cx,
        this.manifest.sackMouth.cy,
        mission.targetCategory,
        this.activeItems,
        this.minDeltaX,
        this.maxDeltaX,
      );
    }

    const prevX = this.playerDeltaX;
    const follow = 1 - Math.exp(-dt * 16);
    this.playerDeltaX = this.clampDeltaX(
      this.playerDeltaX + (this.targetDeltaX - this.playerDeltaX) * follow,
    );
    this.playerVelocityX = (this.playerDeltaX - prevX) / Math.max(0.001, dt);
  }

  private updateSpawner(dt: number): void {
    this.nextSpawnTimer -= dt;
    if (this.nextSpawnTimer > 0) return;

    this.spawnRandomItem();
    this.nextSpawnTimer = 1.08 + Math.random() * 0.42;
  }

  private pickItemConfig(preferredCategory?: ItemCategory): AssetManifestItem {
    const items = this.manifest.items;
    const mission = this.missionManager.getCurrentMission();

    let categoryFilter: ItemCategory | 'any';
    if (preferredCategory) {
      categoryFilter = preferredCategory;
    } else if (mission.targetCategory === 'any') {
      categoryFilter = 'any';
    } else {
      const useTarget = Math.random() < 0.82;
      if (useTarget) {
        categoryFilter = mission.targetCategory;
      } else {
        categoryFilter = mission.targetCategory === 'snack' ? 'beer' : 'snack';
      }
    }

    let pool =
      categoryFilter === 'any'
        ? items
        : items.filter((item) => item.category === categoryFilter);
    if (pool.length === 0) {
      pool = items;
    }

    if (pool.length > 1 && this.lastSpawnId) {
      const filtered = pool.filter((item) => item.id !== this.lastSpawnId);
      if (filtered.length > 0) {
        pool = filtered;
      }
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    this.lastSpawnId = chosen.id;
    return chosen;
  }

  private spawnRandomItem(): void {
    const config = this.pickItemConfig();
    const minMouthX = Math.max(88, this.manifest.sackMouth.cx + this.minDeltaX + 12);
    const maxMouthX = Math.min(488, this.manifest.sackMouth.cx + this.maxDeltaX - 12);

    let spawnX = minMouthX + Math.random() * Math.max(40, maxMouthX - minMouthX);
    if (Math.abs(spawnX - this.lastSpawnX) < 55) {
      const shift = spawnX < (minMouthX + maxMouthX) * 0.5 ? 85 : -85;
      spawnX = Math.max(minMouthX, Math.min(maxMouthX, spawnX + shift));
    }
    this.lastSpawnX = spawnX;

    this.spawnItemEntity(config, spawnX, -config.height * 0.48);
  }

  private spawnItemEntity(
    config: AssetManifestItem,
    x: number,
    y: number,
    vyOverride?: number,
  ): ActiveItem {
    const mesh = this.renderer.createItemMesh(config);
    const mission = this.missionManager.getCurrentMission();
    const baseSpeed = 325 + Math.random() * 110 + Math.min(mission.id - 1, 4) * 18;
    const item: ActiveItem = {
      id: this.nextItemId++,
      config,
      mesh,
      category: config.category,
      state: 'falling',
      x,
      y,
      vy: vyOverride ?? baseSpeed,
      rotation: (Math.random() - 0.5) * 0.28,
      rotSpeed: (Math.random() - 0.5) * 0.52,
      catchOffsetX: 0,
    };

    this.activeItems.push(item);
    this.syncItemMesh(item, this.activeItems.length - 1);
    return item;
  }

  private updateItems(dt: number): void {
    const mouthX = this.manifest.sackMouth.cx + this.playerDeltaX;
    const mouthY = this.manifest.sackMouth.cy;
    const clipFloorY = this.manifest.sackMouth.clipFloorY;
    const rx = this.manifest.sackMouth.rx * 1.08;
    const ry = this.manifest.sackMouth.ry * 1.25;

    for (let i = this.activeItems.length - 1; i >= 0; i--) {
      const item = this.activeItems[i];

      if (item.state === 'falling') {
        item.y += item.vy * dt;
        item.rotation += item.rotSpeed * dt;

        // Check if lower body of item enters the open sack mouth oval
        const catchProbeY = item.y + item.config.height * 0.26;
        const dx = (item.x - mouthX) / Math.max(16, rx);
        const dy = (catchProbeY - mouthY) / Math.max(12, ry);

        if (
          dx * dx + dy * dy <= 1.0 &&
          item.y >= mouthY - item.config.height * 0.55 &&
          item.y <= mouthY + 46
        ) {
          this.handleCatch(item, mouthX, mouthY);
        } else if (item.y - item.config.height * 0.5 > LOGICAL_HEIGHT + 40) {
          this.removeActiveItemAt(i);
          continue;
        }
      } else {
        // Caught inside sack: drop cleanly behind sack_front.png until clipFloorY
        item.vy = Math.max(item.vy + 220 * dt, 440);
        item.y += item.vy * dt;
        item.catchOffsetX *= Math.exp(-dt * 9.5);
        item.x = mouthX + item.catchOffsetX;
        item.rotation *= Math.exp(-dt * 8.0);

        if (item.y - item.config.height * 0.5 > clipFloorY + 8) {
          this.removeActiveItemAt(i);
          continue;
        }
      }

      this.syncItemMesh(item, i);
    }
  }

  private handleCatch(item: ActiveItem, mouthX: number, mouthY: number): void {
    item.state = 'catching';
    item.catchOffsetX = (item.x - mouthX) * 0.45;

    const clipWorldY = LOGICAL_HEIGHT - this.manifest.sackMouth.clipFloorY;
    item.mesh.material.uniforms.uClipEnabled.value = 1;
    item.mesh.material.uniforms.uClipY.value = clipWorldY;

    const result = this.missionManager.recordCatch(item.category);

    this.renderer.triggerCatchEffects(
      mouthX,
      mouthY - 6,
      result.displayDelta,
      result.isTarget,
    );

    this.audio.playCatchSfx(item.category, result.isTarget);

    if (result.missionAdvanced) {
      this.hud.triggerMissionTransition();
      this.audio.playMissionComplete();
    } else if (result.isTarget && (result.displayDelta % 2 === 1 || result.combo === 2)) {
      this.audio.playVoiceCatch();
    }

    this.emitSnapshot();
  }

  private syncItemMesh(item: ActiveItem, index: number): void {
    item.mesh.position.set(item.x, LOGICAL_HEIGHT - item.y, -index * 0.02);
    item.mesh.rotation.z = -item.rotation;
    item.mesh.material.uniforms.uVelocityY.value = item.vy;
  }

  private removeActiveItemAt(index: number): void {
    const [removed] = this.activeItems.splice(index, 1);
    if (removed) {
      this.renderer.removeItemMesh(removed.mesh);
    }
  }

  private clearActiveItems(): void {
    while (this.activeItems.length > 0) {
      this.removeActiveItemAt(this.activeItems.length - 1);
    }
  }

  private handlePhaseChange(nextPhase: GamePhase): void {
    this.phase = nextPhase;
    if (nextPhase === 'playing') {
      this.nextSpawnTimer = 0.35;
      this.autoplayAI.reset(this.playerDeltaX);
    } else {
      this.clearActiveItems();
      this.renderer.clearVfx();
    }
    this.emitSnapshot();
  }

  public replayIntro(): void {
    void this.unlockAudio();
    this.clearActiveItems();
    this.renderer.clearVfx();
    this.missionManager.reset();
    this.playerDeltaX = 0;
    this.targetDeltaX = 0;
    this.playerVelocityX = 0;
    this.cinematics.replay();
    this.emitSnapshot();
  }

  public skipCinematics(): void {
    void this.unlockAudio();
    this.cinematics.skip();
  }

  public setAutoplay(enabled: boolean): void {
    this.autoplay = enabled;
    if (enabled) {
      this.autoplayAI.reset(this.playerDeltaX);
    }
    this.emitSnapshot();
  }

  public toggleMute(): void {
    void this.unlockAudio();
    this.audio.setMuted(!this.audio.isMuted());
    this.emitSnapshot();
  }

  public setCleanMode(enabled: boolean): void {
    this.cleanMode = enabled;
    this.emitSnapshot();
  }

  private async unlockAudio(): Promise<void> {
    const wasUnlocked = this.audio.isUnlocked();
    const unlocked = await this.audio.unlock();
    if (unlocked && !wasUnlocked) {
      this.emitSnapshot();
    }
  }

  private getSnapshot(): GameSnapshot {
    return {
      phase: this.phase,
      mission: this.missionManager.getCurrentMission(),
      missionProgress: this.missionManager.getProgress(),
      totalCaught: this.missionManager.getTotalCaught(),
      xp: this.missionManager.getXP(),
      combo: this.missionManager.getCombo(),
      autoplay: this.autoplay,
      muted: this.audio.isMuted(),
      cleanMode: this.cleanMode,
      audioUnlocked: this.audio.isUnlocked(),
      subtitleOverride: this.missionManager.getSubtitleOverride(),
    };
  }

  private emitSnapshot(): void {
    this.hud.update(this.getSnapshot());
  }

  private clampDeltaX(val: number): number {
    return Math.max(this.minDeltaX, Math.min(this.maxDeltaX, val));
  }

  private getStageScale(): number {
    const rect = this.stageEl.getBoundingClientRect();
    return rect.width > 10 ? rect.width / LOGICAL_WIDTH : 1;
  }

  private handlePointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    void this.unlockAudio();

    if (this.phase !== 'playing') {
      this.cinematics.skip();
      return;
    }

    this.draggingPointerId = e.pointerId;
    this.dragStartX = e.clientX;
    this.dragStartDeltaX = this.targetDeltaX;
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.draggingPointerId !== e.pointerId || this.phase !== 'playing') return;
    const dxLogical = (e.clientX - this.dragStartX) / this.getStageScale();
    if (this.autoplay && Math.abs(dxLogical) > 10) {
      this.setAutoplay(false);
    }
    this.targetDeltaX = this.clampDeltaX(this.dragStartDeltaX + dxLogical);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (this.draggingPointerId === e.pointerId) {
      this.draggingPointerId = null;
    }
  }

  private resolveMoveDirection(e: KeyboardEvent): 'left' | 'right' | null {
    const keyLower = (e.key || '').toLowerCase();
    if (
      e.code === 'ArrowLeft' ||
      e.key === 'ArrowLeft' ||
      e.code === 'KeyA' ||
      keyLower === 'a'
    ) {
      return 'left';
    }
    if (
      e.code === 'ArrowRight' ||
      e.key === 'ArrowRight' ||
      e.code === 'KeyD' ||
      keyLower === 'd'
    ) {
      return 'right';
    }
    return null;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const targetTag = (e.target as HTMLElement | null)?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

    void this.unlockAudio();

    const keyLower = (e.key || '').toLowerCase();

    if (e.code === 'Space' || e.key === ' ') {
      if (this.phase !== 'playing') {
        e.preventDefault();
        this.cinematics.skip();
      }
      return;
    }

    if ((e.code === 'KeyR' || keyLower === 'r') && !e.repeat) {
      this.setAutoplay(!this.autoplay);
      return;
    }

    if ((e.code === 'KeyM' || keyLower === 'm') && !e.repeat) {
      this.toggleMute();
      return;
    }

    if ((e.code === 'KeyH' || keyLower === 'h') && !e.repeat) {
      this.setCleanMode(!this.cleanMode);
      return;
    }

    const missionDigit =
      e.code === 'Digit1' || e.key === '1'
        ? 1
        : e.code === 'Digit2' || e.key === '2'
          ? 2
          : e.code === 'Digit3' || e.key === '3'
            ? 3
            : 0;
    if (!e.repeat && missionDigit > 0) {
      this.missionManager.setMissionById(missionDigit);
      this.hud.triggerMissionTransition();
      this.emitSnapshot();
      return;
    }

    const moveDir = this.resolveMoveDirection(e);
    if (moveDir) {
      e.preventDefault();
      if (this.autoplay) {
        this.setAutoplay(false);
      }
      this.keysHeld.add(moveDir);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const moveDir = this.resolveMoveDirection(e);
    if (moveDir) {
      this.keysHeld.delete(moveDir);
    }
  }

  private installDebugAPI(): void {
    const api: AgudaDebugAPI = {
      jumpToPhase: (phase: GamePhase) => {
        if (phase !== 'playing') {
          this.clearActiveItems();
          this.renderer.clearVfx();
        }
        const seekDefault = phase === 'intro' ? 0.95 : phase === 'transition' ? 0.5 : 0;
        this.cinematics.jumpToPhase(phase, seekDefault);
        this.emitSnapshot();
        if (this.paused) {
          this.renderer.update(0.001, this.elapsedTime, this.playerDeltaX, this.playerVelocityX);
        }
      },
      setMission: (missionId: number) => {
        this.missionManager.setMissionById(missionId);
        this.hud.triggerMissionTransition();
        this.emitSnapshot();
      },
      spawnItemNow: (category?: ItemCategory, x?: number) => {
        if (this.phase !== 'playing') {
          this.cinematics.jumpToPhase('playing');
        }
        const config = this.pickItemConfig(category);
        const targetX = x ?? this.manifest.sackMouth.cx + this.playerDeltaX;
        this.spawnItemEntity(config, targetX, 200);
        if (this.paused) {
          this.renderer.update(0.001, this.elapsedTime, this.playerDeltaX, this.playerVelocityX);
        }
      },
      triggerCatchDemo: (category?: ItemCategory) => {
        if (this.phase !== 'playing') {
          this.cinematics.jumpToPhase('playing');
        }
        const mission = this.missionManager.getCurrentMission();
        const cat =
          category ?? (mission.targetCategory === 'any' ? 'beer' : mission.targetCategory);
        const config = this.pickItemConfig(cat);
        const mouthX = this.manifest.sackMouth.cx + this.playerDeltaX;
        const mouthY = this.manifest.sackMouth.cy;
        // Place item mid-entry inside the open sack mouth so bottom goes behind sack_front
        const entryY = mouthY - config.height * 0.08;
        const item = this.spawnItemEntity(config, mouthX, entryY, 260);
        item.rotation = 0.04;
        this.handleCatch(item, mouthX, mouthY);
        this.syncItemMesh(item, this.activeItems.length - 1);
        if (this.paused) {
          this.renderer.update(0.001, this.elapsedTime, this.playerDeltaX, this.playerVelocityX);
        }
      },
      setAutoplay: (enabled: boolean) => {
        this.setAutoplay(enabled);
      },
      setCleanMode: (enabled: boolean) => {
        this.setCleanMode(enabled);
      },
      getState: () => ({
        ...this.getSnapshot(),
        playerDeltaX: this.playerDeltaX,
        activeItems: this.activeItems.length,
        fps: Math.round(this.fpsSmoothed),
      }),
    };

    window.__agudaDebug = api;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    this.stageEl.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);

    this.clearActiveItems();
    this.cinematics.dispose();
    this.hud.destroy();
    this.renderer.dispose();
    this.audio.stopCinematicsTrack();
    this.audio.stopGameplayBeat();

    if (window.__agudaDebug) {
      delete window.__agudaDebug;
    }
  }
}

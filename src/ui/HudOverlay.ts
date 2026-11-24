import './hud.css';
import type { GameSnapshot, HudCallbacks, MissionConfig } from '../types';
import { getMissionIconSvg } from './icons';

const LOGICAL_WIDTH = 576;
const LOGICAL_HEIGHT = 1024;
const TRANSITION_ANIM_MS = 680;

/**
 * Manages the SOURCE.mp4-matched 9:16 HUD inside `#game-stage`,
 * responsive uniform `--stage-scale` sizing, and external `#controls-dock`.
 */
export class HudOverlay {
  private readonly stageElement: HTMLElement;
  private readonly dockRoot: HTMLElement;
  private readonly callbacks: HudCallbacks;

  private readonly hudRoot: HTMLDivElement;
  private readonly missionCard: HTMLDivElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly subtitleEl: HTMLParagraphElement;
  private readonly iconEl: HTMLDivElement;
  private readonly subtitleBar: HTMLDivElement;
  private readonly subtitleTextEl: HTMLSpanElement;

  private readonly phaseBadgeEl: HTMLSpanElement;
  private readonly progressStatEl: HTMLSpanElement;
  private readonly xpStatEl: HTMLSpanElement;
  private readonly comboStatEl: HTMLSpanElement;
  private readonly replayBtn: HTMLButtonElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly autoplayBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly cleanBtn: HTMLButtonElement;
  private readonly audioUnlockBtn: HTMLButtonElement;

  private readonly resizeObserver: ResizeObserver | null = null;
  private readonly onWindowResize: () => void;

  private lastIcon: MissionConfig['icon'] | null = null;
  private lastTitle = '';
  private lastSubtitle = '';
  private lastSubBarText = '';
  private transitionTimer: number | null = null;

  constructor(stageElement: HTMLElement, dockRoot: HTMLElement, callbacks: HudCallbacks) {
    this.stageElement = stageElement;
    this.dockRoot = dockRoot;
    this.callbacks = callbacks;

    // 1. Build pure SOURCE.mp4 HUD overlay inside #game-stage
    this.hudRoot = document.createElement('div');
    this.hudRoot.id = 'hud-root';

    this.missionCard = document.createElement('div');
    this.missionCard.className = 'hud-mission-card';
    this.missionCard.setAttribute('role', 'status');
    this.missionCard.setAttribute('aria-live', 'polite');

    const copyWrap = document.createElement('div');
    copyWrap.className = 'hud-mission-copy';

    this.titleEl = document.createElement('h1');
    this.titleEl.className = 'hud-mission-title';

    this.subtitleEl = document.createElement('p');
    this.subtitleEl.className = 'hud-mission-subtitle';

    copyWrap.append(this.titleEl, this.subtitleEl);

    this.iconEl = document.createElement('div');
    this.iconEl.className = 'hud-mission-icon';

    this.missionCard.append(copyWrap, this.iconEl);

    this.subtitleBar = document.createElement('div');
    this.subtitleBar.className = 'hud-subtitle-bar';
    this.subtitleBar.dir = 'rtl';

    this.subtitleTextEl = document.createElement('span');
    this.subtitleTextEl.className = 'hud-subtitle-text';
    this.subtitleBar.append(this.subtitleTextEl);

    this.hudRoot.append(this.missionCard, this.subtitleBar);
    this.stageElement.append(this.hudRoot);

    // 2. Build external utility controls dock strictly OUTSIDE #game-stage
    this.dockRoot.replaceChildren();

    const header = document.createElement('div');
    header.className = 'dock-header';
    const brand = document.createElement('span');
    brand.textContent = 'AGUDA 107';
    this.phaseBadgeEl = document.createElement('span');
    this.phaseBadgeEl.className = 'dock-phase-badge';
    header.append(brand, this.phaseBadgeEl);

    const stats = document.createElement('div');
    stats.className = 'dock-stats';

    const progressWrap = this.createStatBlock('Progress');
    this.progressStatEl = progressWrap.valueEl;
    const xpWrap = this.createStatBlock('XP', true);
    this.xpStatEl = xpWrap.valueEl;
    const comboWrap = this.createStatBlock('Combo');
    this.comboStatEl = comboWrap.valueEl;
    stats.append(progressWrap.container, xpWrap.container, comboWrap.container);

    const actions = document.createElement('div');
    actions.className = 'dock-actions';

    this.replayBtn = this.createDockButton('Replay Intro', undefined, () => {
      this.callbacks.onReplayIntro();
    });
    this.skipBtn = this.createDockButton('Skip Cinematics', 'Space', () => {
      this.callbacks.onSkipIntro();
    });
    this.autoplayBtn = this.createDockButton('Autoplay', 'R', () => {
      this.callbacks.onToggleAutoplay();
    });
    this.muteBtn = this.createDockButton('Mute', 'M', () => {
      this.callbacks.onToggleMute();
    });
    this.cleanBtn = this.createDockButton('Clean View', 'H', () => {
      this.callbacks.onToggleCleanMode();
    });
    this.audioUnlockBtn = this.createDockButton('Enable Sound', 'Click', () => {
      this.callbacks.onUnlockAudio?.();
    });
    this.audioUnlockBtn.classList.add('is-audio-prompt');

    actions.append(
      this.audioUnlockBtn,
      this.replayBtn,
      this.skipBtn,
      this.autoplayBtn,
      this.muteBtn,
      this.cleanBtn,
    );

    const hint = document.createElement('p');
    hint.className = 'dock-hint';
    hint.textContent = 'Move: A/D, ←/→ or Drag · R Auto · M Mute · H Clean';

    this.dockRoot.append(header, stats, actions, hint);

    // 3. Responsive uniform scaling (--stage-scale)
    this.onWindowResize = () => this.updateStageScale();
    this.updateStageScale();

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.onWindowResize);
      this.resizeObserver.observe(document.documentElement);
    }
    window.addEventListener('resize', this.onWindowResize, { passive: true });
  }

  update(snapshot: GameSnapshot): void {
    const { mission } = snapshot;

    if (mission.title !== this.lastTitle) {
      this.lastTitle = mission.title;
      this.titleEl.textContent = mission.title;
      this.titleEl.classList.toggle('is-long', mission.title.length >= 19);
    }

    const subtitleLabel = `${mission.code}  /  ${mission.xpLabel}`;
    if (subtitleLabel !== this.lastSubtitle) {
      this.lastSubtitle = subtitleLabel;
      this.subtitleEl.textContent = subtitleLabel;
    }

    if (mission.icon !== this.lastIcon) {
      this.lastIcon = mission.icon;
      this.iconEl.innerHTML = getMissionIconSvg(mission.icon);
    }

    const activeHebrewText = snapshot.subtitleOverride ?? mission.hebrewCue;
    if (activeHebrewText !== this.lastSubBarText) {
      this.lastSubBarText = activeHebrewText;
      this.subtitleTextEl.textContent = activeHebrewText;
    }
    this.subtitleBar.classList.toggle('is-celebratory', snapshot.subtitleOverride !== null);

    // Sync clean mode visibility
    document.body.classList.toggle('clean-mode', snapshot.cleanMode);
    this.dockRoot.classList.toggle('is-hidden', snapshot.cleanMode);

    // Update external dock telemetry & controls
    this.phaseBadgeEl.textContent =
      snapshot.phase === 'playing' ? 'LIVE' : snapshot.phase.toUpperCase();
    this.progressStatEl.textContent = `${snapshot.missionProgress}/${mission.targetCount}`;
    this.xpStatEl.textContent = `${snapshot.xp}`;
    this.comboStatEl.textContent = `x${snapshot.combo}`;

    const isCinematic = snapshot.phase !== 'playing';
    this.skipBtn.disabled = !isCinematic;

    this.autoplayBtn.classList.toggle('is-active', snapshot.autoplay);
    this.autoplayBtn.setAttribute('aria-pressed', String(snapshot.autoplay));

    const muteLabelEl = this.muteBtn.querySelector('.dock-btn-label');
    if (muteLabelEl) {
      muteLabelEl.textContent = snapshot.muted ? 'Unmute' : 'Mute';
    }
    this.muteBtn.classList.toggle('is-muted', snapshot.muted);
    this.muteBtn.setAttribute('aria-pressed', String(snapshot.muted));

    this.cleanBtn.classList.toggle('is-active', snapshot.cleanMode);
    this.cleanBtn.setAttribute('aria-pressed', String(snapshot.cleanMode));

    const showAudioHint = !snapshot.audioUnlocked && !snapshot.muted;
    this.audioUnlockBtn.style.display = showAudioHint ? 'flex' : 'none';
  }

  triggerMissionTransition(): void {
    if (this.transitionTimer !== null) {
      window.clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }

    this.missionCard.classList.remove('mission-transition');
    // Force reflow so rapid consecutive mission changes re-trigger CSS animation
    void this.missionCard.offsetWidth;
    this.missionCard.classList.add('mission-transition');

    this.transitionTimer = window.setTimeout(() => {
      this.transitionTimer = null;
      this.missionCard.classList.remove('mission-transition');
    }, TRANSITION_ANIM_MS);
  }

  destroy(): void {
    if (this.transitionTimer !== null) {
      window.clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    window.removeEventListener('resize', this.onWindowResize);
    document.body.classList.remove('clean-mode');
    this.hudRoot.remove();
    this.dockRoot.replaceChildren();
  }

  private updateStageScale(): void {
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    if (vw <= 0 || vh <= 0) {
      return;
    }
    const scale = Math.min(vw / LOGICAL_WIDTH, vh / LOGICAL_HEIGHT);
    document.documentElement.style.setProperty('--stage-scale', scale.toFixed(6));

    const freeSideGutter = (vw - LOGICAL_WIDTH * scale) * 0.5;
    this.dockRoot.classList.toggle('is-dock-bottom', freeSideGutter < 276);
  }

  private createStatBlock(
    label: string,
    isXp = false,
  ): { container: HTMLDivElement; valueEl: HTMLSpanElement } {
    const container = document.createElement('div');
    container.className = 'dock-stat';

    const labelEl = document.createElement('span');
    labelEl.className = 'dock-stat-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = isXp ? 'dock-stat-value is-xp' : 'dock-stat-value';
    valueEl.textContent = '0';

    container.append(labelEl, valueEl);
    return { container, valueEl };
  }

  private createDockButton(
    label: string,
    shortcut: string | undefined,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dock-btn';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dock-btn-label';
    labelSpan.textContent = label;
    btn.append(labelSpan);

    if (shortcut) {
      const kbd = document.createElement('span');
      kbd.className = 'dock-kbd';
      kbd.textContent = shortcut;
      btn.append(kbd);
    }

    btn.addEventListener('click', (event) => {
      (event.currentTarget as HTMLButtonElement).blur();
      onClick();
    });

    return btn;
  }
}

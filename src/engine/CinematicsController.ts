import type { GamePhase } from '../types';

export interface CinematicsCallbacks {
  onPhaseChange: (phase: GamePhase) => void;
  onStartIntroTrack?: () => void;
  onStartMission1Voice?: () => void;
  onCrossfadeToGameplay?: () => void;
}

export class CinematicsController {
  private readonly layerEl: HTMLElement;
  private readonly introVideo: HTMLVideoElement;
  private readonly transitionVideo: HTMLVideoElement;
  private readonly callbacks: CinematicsCallbacks;

  private phase: GamePhase = 'intro';
  private crossfadeTimer: number | null = null;
  private fallbackTimer: number | null = null;
  private voTriggered = false;
  private disposed = false;

  constructor(layerEl: HTMLElement, callbacks: CinematicsCallbacks) {
    this.layerEl = layerEl;
    this.callbacks = callbacks;

    this.introVideo = this.createVideoElement('./media/intro.mp4', 2);
    this.transitionVideo = this.createVideoElement('./media/transition.mp4', 1);
    this.transitionVideo.style.opacity = '0';

    this.layerEl.replaceChildren(this.transitionVideo, this.introVideo);

    this.introVideo.addEventListener('ended', () => {
      if (!this.disposed && this.phase === 'intro') {
        this.beginTransition(0);
      }
    });

    this.introVideo.addEventListener('error', () => {
      if (!this.disposed && this.phase === 'intro') {
        this.beginTransition(0);
      }
    });

    this.transitionVideo.addEventListener('ended', () => {
      if (!this.disposed && this.phase === 'transition') {
        this.finishCinematics();
      }
    });

    this.transitionVideo.addEventListener('error', () => {
      if (!this.disposed && this.phase === 'transition') {
        this.finishCinematics();
      }
    });
  }

  private createVideoElement(src: string, zIndex: number): HTMLVideoElement {
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.zIndex = String(zIndex);
    video.style.transition = 'opacity 180ms ease';
    return video;
  }

  private clearTimers(): void {
    if (this.crossfadeTimer !== null) {
      window.clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    if (this.fallbackTimer !== null) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  public start(): void {
    this.jumpToPhase('intro', 0);
  }

  public replay(): void {
    this.start();
  }

  public skip(): void {
    if (this.phase === 'playing') return;
    this.finishCinematics();
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public jumpToPhase(targetPhase: GamePhase, seekSeconds = 0): void {
    if (this.disposed) return;
    this.clearTimers();

    if (targetPhase === 'intro') {
      this.phase = 'intro';
      this.voTriggered = false;
      this.layerEl.classList.remove('is-hidden');
      this.layerEl.style.display = 'block';

      this.transitionVideo.pause();
      this.transitionVideo.currentTime = 0;
      this.transitionVideo.style.opacity = '0';

      this.introVideo.style.opacity = '1';
      this.safeSeekAndPlay(this.introVideo, 'intro', seekSeconds, () => {
        if (!this.disposed && this.phase === 'intro') {
          this.beginTransition(0);
        }
      }, 4200);

      this.callbacks.onPhaseChange('intro');
      this.callbacks.onStartIntroTrack?.();
      return;
    }

    if (targetPhase === 'transition') {
      this.beginTransition(seekSeconds);
      return;
    }

    this.finishCinematics(true);
  }

  public async pauseAt(targetPhase: 'intro' | 'transition', seekSeconds = 0): Promise<void> {
    if (this.disposed) return;
    this.clearTimers();
    this.phase = targetPhase;

    this.layerEl.classList.remove('is-hidden');
    this.layerEl.style.display = 'block';

    const activeVideo = targetPhase === 'intro' ? this.introVideo : this.transitionVideo;
    const idleVideo = targetPhase === 'intro' ? this.transitionVideo : this.introVideo;

    idleVideo.pause();
    idleVideo.style.opacity = '0';
    activeVideo.style.opacity = '1';
    activeVideo.pause();

    this.callbacks.onPhaseChange(targetPhase);

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        activeVideo.pause();
        resolve();
      };

      const applySeek = () => {
        if (this.disposed) {
          done();
          return;
        }
        const duration = Number.isFinite(activeVideo.duration) && activeVideo.duration > 0
          ? activeVideo.duration
          : 10;
        const clamped = Math.min(Math.max(0, seekSeconds), Math.max(0, duration - 0.05));
        if (Math.abs(activeVideo.currentTime - clamped) < 0.01 && activeVideo.readyState >= 2) {
          done();
          return;
        }
        activeVideo.addEventListener('seeked', done, { once: true });
        activeVideo.currentTime = clamped;
      };

      if (activeVideo.readyState >= 1) {
        applySeek();
      } else {
        activeVideo.addEventListener('loadedmetadata', applySeek, { once: true });
      }

      window.setTimeout(done, 1500);
    });
  }

  private beginTransition(seekSeconds = 0): void {
    if (this.disposed) return;
    this.clearTimers();
    this.phase = 'transition';

    this.layerEl.classList.remove('is-hidden');
    this.layerEl.style.display = 'block';

    this.introVideo.pause();
    this.transitionVideo.style.opacity = '1';
    this.introVideo.style.opacity = '0';

    if (!this.voTriggered) {
      this.voTriggered = true;
      this.callbacks.onStartMission1Voice?.();
    }

    this.callbacks.onPhaseChange('transition');

    this.safeSeekAndPlay(this.transitionVideo, 'transition', seekSeconds, () => {
      if (!this.disposed && this.phase === 'transition') {
        this.finishCinematics();
      }
    }, 3000);
  }

  private finishCinematics(immediate = false): void {
    if (this.disposed) return;
    this.clearTimers();
    this.phase = 'playing';

    this.callbacks.onPhaseChange('playing');
    this.callbacks.onCrossfadeToGameplay?.();

    if (immediate) {
      this.introVideo.pause();
      this.transitionVideo.pause();
      this.layerEl.classList.add('is-hidden');
      this.layerEl.style.display = 'none';
      return;
    }

    this.layerEl.classList.add('is-hidden');
    this.crossfadeTimer = window.setTimeout(() => {
      this.introVideo.pause();
      this.transitionVideo.pause();
      if (this.phase === 'playing') {
        this.layerEl.style.display = 'none';
      }
    }, 360);
  }

  private safeSeekAndPlay(
    video: HTMLVideoElement,
    expectedPhase: GamePhase,
    seekSeconds: number,
    onFallback: () => void,
    fallbackMs: number,
  ): void {
    const applySeek = () => {
      if (this.disposed || this.phase !== expectedPhase) return;
      if (seekSeconds > 0 && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(seekSeconds, Math.max(0, video.duration - 0.05));
      } else {
        video.currentTime = Math.max(0, seekSeconds);
      }
    };

    if (video.readyState >= 1) {
      applySeek();
    } else {
      video.addEventListener('loadedmetadata', applySeek, { once: true });
    }

    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Fallback if video missing or playback blocked in headless environment
        this.fallbackTimer = window.setTimeout(onFallback, Math.min(fallbackMs, 1800));
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.introVideo.pause();
    this.transitionVideo.pause();
    this.introVideo.removeAttribute('src');
    this.transitionVideo.removeAttribute('src');
    this.introVideo.load();
    this.transitionVideo.load();
  }
}

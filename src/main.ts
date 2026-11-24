import { GameEngine } from './engine/GameEngine';

function bootstrap(): void {
  const stageEl = document.getElementById('game-stage');
  const webglEl = document.getElementById('webgl-layer');
  const cinematicsEl = document.getElementById('cinematics-layer');
  const dockEl = document.getElementById('controls-dock');

  if (!stageEl || !webglEl || !cinematicsEl || !dockEl) {
    throw new Error('Required Aguda stage DOM containers are missing from index.html');
  }

  const engine = new GameEngine({
    stageEl,
    webglEl,
    cinematicsEl,
    dockEl,
  });

  void engine.init();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}

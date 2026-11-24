import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import type { AssetManifest, AssetManifestItem } from '../types';
import { createBackgroundMaterial } from './shaders/BackgroundShader';
import { createCharacterMaterial } from './shaders/CharacterShader';
import { createItemMaterial } from './shaders/ItemShader';
import { createSackClothMaterial } from './shaders/SackClothShader';
import { GoldenGradeShader } from './shaders/GoldenGradeShader';
import { BokehDustSystem } from './BokehDustSystem';
import { SparkParticleSystem } from './SparkParticleSystem';
import { FloatingCounterSystem } from './FloatingCounterSystem';

export const LOGICAL_WIDTH = 576;
export const LOGICAL_HEIGHT = 1024;

interface LoadedItemTexture {
  texture: THREE.Texture;
  pixelWidth: number;
  pixelHeight: number;
}

export class SceneRenderer {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.OrthographicCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly gradePass: ShaderPass;

  private readonly bokehDust: BokehDustSystem;
  private readonly sparks: SparkParticleSystem;
  private readonly counters: FloatingCounterSystem;
  private readonly itemsGroup = new THREE.Group();

  private bgMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private characterMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private sackMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;

  private manifest: AssetManifest | null = null;
  private readonly itemTextures = new Map<string, LoadedItemTexture>();
  private readonly itemGeometryCache = new Map<string, THREE.PlaneGeometry>();
  private readonly textureLoader = new THREE.TextureLoader();

  // Damped spring state for burlap sack recoil and mouth widening
  private recoilY = 0;
  private recoilVel = 0;
  private stretchX = 0;
  private stretchVel = 0;
  private catchGlow = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      alpha: false,
    });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(LOGICAL_WIDTH, LOGICAL_HEIGHT, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.00;

    container.replaceChildren(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f1d);

    // Three.js Y-up orthographic space: screenY (0 top .. 1024 bottom) -> worldY = 1024 - screenY
    this.camera = new THREE.OrthographicCamera(0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0, -500, 500);
    this.camera.position.set(0, 0, 100);

    // Leave THREE.Group containers at default renderOrder=0 so Three.js sorts strictly by leaf renderOrder
    this.itemsGroup.position.z = 30;
    this.scene.add(this.itemsGroup);

    this.bokehDust = new BokehDustSystem(10);
    this.bokehDust.points.renderOrder = 1;
    this.bokehDust.setPixelRatio(dpr);
    this.scene.add(this.bokehDust.points);

    this.sparks = new SparkParticleSystem(50);
    this.sparks.points.renderOrder = 5;
    this.sparks.setPixelRatio(dpr);
    this.scene.add(this.sparks.points);

    this.counters = new FloatingCounterSystem(60);
    this.scene.add(this.counters.group);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(LOGICAL_WIDTH, LOGICAL_HEIGHT),
      0.50,
      0.38,
      0.95,
    );
    this.composer.addPass(this.bloomPass);

    this.gradePass = new ShaderPass(GoldenGradeShader);
    this.gradePass.uniforms.uResolution.value.set(LOGICAL_WIDTH * dpr, LOGICAL_HEIGHT * dpr);
    this.composer.addPass(this.gradePass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  private loadTexture(path: string): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        path,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
          tex.generateMipmaps = true;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  public async loadManifestAssets(manifest: AssetManifest): Promise<void> {
    this.manifest = manifest;

    const [bgTex, charTex, sackTex] = await Promise.all([
      this.loadTexture(manifest.background).catch((e) => {
        console.warn('[SceneRenderer] Failed to load background texture:', e);
        return null;
      }),
      this.loadTexture(manifest.characterBack).catch((e) => {
        console.warn('[SceneRenderer] Failed to load characterBack texture:', e);
        return null;
      }),
      this.loadTexture(manifest.sackFront).catch((e) => {
        console.warn('[SceneRenderer] Failed to load sackFront texture:', e);
        return null;
      }),
    ]);

    await Promise.all(
      manifest.items.map(async (item) => {
        try {
          const tex = await this.loadTexture(item.path);
          const img = tex.image as { width?: number; height?: number } | undefined;
          this.itemTextures.set(item.id, {
            texture: tex,
            pixelWidth: img?.width || item.width,
            pixelHeight: img?.height || item.height,
          });
        } catch (err) {
          console.warn(`[SceneRenderer] Failed to load item texture ${item.id}:`, err);
        }
      }),
    );

    this.buildLayeredMeshes(manifest, bgTex, charTex, sackTex);
    this.renderer.compile(this.scene, this.camera);
  }

  private buildLayeredMeshes(
    manifest: AssetManifest,
    bgTex: THREE.Texture | null,
    charTex: THREE.Texture | null,
    sackTex: THREE.Texture | null,
  ): void {
    // Clear previous meshes if re-initializing
    if (this.bgMesh) {
      this.scene.remove(this.bgMesh);
      this.bgMesh.geometry.dispose();
      this.bgMesh.material.dispose();
    }
    if (this.characterMesh) {
      this.scene.remove(this.characterMesh);
      this.characterMesh.geometry.dispose();
      this.characterMesh.material.dispose();
    }
    if (this.sackMesh) {
      this.scene.remove(this.sackMesh);
      this.sackMesh.geometry.dispose();
      this.sackMesh.material.dispose();
    }

    // Z = 0: Oversized 1.14x+ courtyard background plate for parallax & breathing sway
    const bgImg = bgTex?.image as { width?: number; height?: number } | undefined;
    const bgW = Math.max(LOGICAL_WIDTH * 1.18, bgImg?.width || 680);
    const bgH = Math.max(LOGICAL_HEIGHT * 1.14, bgImg?.height || 1140);
    const bgGeo = new THREE.PlaneGeometry(bgW, bgH);
    const bgMat = createBackgroundMaterial(bgTex);
    this.bgMesh = new THREE.Mesh(bgGeo, bgMat);
    this.bgMesh.position.set(LOGICAL_WIDTH * 0.5, LOGICAL_HEIGHT * 0.5, 0);
    this.bgMesh.renderOrder = 0;
    this.scene.add(this.bgMesh);

    const charW = manifest.characterCanvasWidth;
    const charH = manifest.characterCanvasHeight;
    const charPivotWorldY = LOGICAL_HEIGHT - manifest.characterPivot.y;
    const restX = manifest.characterAnchorOffsetX + charW * 0.5;
    const restY = charH * 0.5;

    // Z = 20: Character back + shadowed interior of open sack mouth (12x12 mesh)
    const charGeo = new THREE.PlaneGeometry(charW, charH, 12, 12);
    const charMat = createCharacterMaterial(charTex, charPivotWorldY, charW, charH);
    this.characterMesh = new THREE.Mesh(charGeo, charMat);
    this.characterMesh.position.set(restX, restY, 20);
    this.characterMesh.renderOrder = 2;
    this.scene.add(this.characterMesh);

    // Z = 40: Front burlap lip, woven front sack, and gripping hand (16x16 cloth mesh)
    const mouthUvX = (manifest.sackMouth.cx - manifest.characterAnchorOffsetX) / charW;
    const mouthUvY = 1.0 - manifest.sackMouth.cy / charH;
    const sackGeo = new THREE.PlaneGeometry(charW, charH, 16, 16);
    const sackMat = createSackClothMaterial(sackTex, mouthUvX, mouthUvY, charW, charH);
    this.sackMesh = new THREE.Mesh(sackGeo, sackMat);
    this.sackMesh.position.set(restX, restY, 40);
    this.sackMesh.renderOrder = 4;
    this.scene.add(this.sackMesh);
  }

  public createItemMesh(item: AssetManifestItem): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    let geo = this.itemGeometryCache.get(item.id);
    if (!geo) {
      geo = new THREE.PlaneGeometry(item.width, item.height, 1, 10);
      this.itemGeometryCache.set(item.id, geo);
    }

    const loaded = this.itemTextures.get(item.id);
    const mat = createItemMaterial(
      loaded?.texture ?? null,
      item.subsurfaceTint,
      loaded?.pixelWidth ?? item.width,
      loaded?.pixelHeight ?? item.height,
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    this.itemsGroup.add(mesh);
    return mesh;
  }

  public removeItemMesh(mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>): void {
    this.itemsGroup.remove(mesh);
    mesh.material.dispose();
  }

  public triggerCatchEffects(
    screenX: number,
    screenY: number,
    displayDelta: number,
    isTarget: boolean,
  ): void {
    const worldX = screenX;
    const worldY = LOGICAL_HEIGHT - screenY;

    // Soft spring impulses on burlap sack belly (keeps hand aligned with forearm)
    this.recoilVel -= isTarget ? 125 : 75;
    this.stretchVel += isTarget ? 0.95 : 0.55;
    this.catchGlow = isTarget ? 1.0 : 0.45;

    // HDR golden-white firework fountain & blooming +N counter
    this.sparks.emitBurst(worldX, worldY, isTarget);
    if (displayDelta > 0) {
      this.counters.spawn(worldX, worldY, displayDelta, isTarget);
    }
  }

  public clearVfx(): void {
    this.sparks.clear();
    this.counters.clear();
    this.recoilY = 0;
    this.recoilVel = 0;
    this.stretchX = 0;
    this.stretchVel = 0;
    this.catchGlow = 0;
  }

  public update(dt: number, elapsedTime: number, playerDeltaX: number, playerVelocityX: number): void {
    const safeDt = Math.min(dt, 0.05);

    // Damped spring physics for sack cloth recoil & mouth stretch
    const recoilForce = -240 * this.recoilY - 15.5 * this.recoilVel;
    this.recoilVel += recoilForce * safeDt;
    this.recoilY += this.recoilVel * safeDt;

    const stretchForce = -220 * this.stretchX - 15.0 * this.stretchVel;
    this.stretchVel += stretchForce * safeDt;
    this.stretchX += this.stretchVel * safeDt;

    this.catchGlow = Math.max(0, this.catchGlow - safeDt * 3.2);

    // Z = 0: Background parallax + organic breathing camera sway
    if (this.bgMesh) {
      const swayX = Math.sin(elapsedTime * 0.65) * 3.2;
      const swayY = Math.cos(elapsedTime * 0.48) * 2.4;
      this.bgMesh.position.x = LOGICAL_WIDTH * 0.5 - playerDeltaX * 0.14 + swayX;
      this.bgMesh.position.y = LOGICAL_HEIGHT * 0.5 + swayY;
      this.bgMesh.material.uniforms.uTime.value = elapsedTime;
    }

    // Z = 20 & Z = 40: Registered protagonist + sack front layer
    if (this.manifest && this.characterMesh && this.sackMesh) {
      const posX =
        this.manifest.characterAnchorOffsetX +
        playerDeltaX +
        this.manifest.characterCanvasWidth * 0.5;
      const posY = this.manifest.characterCanvasHeight * 0.5;

      this.characterMesh.position.x = posX;
      this.characterMesh.position.y = posY;
      this.characterMesh.material.uniforms.uTime.value = elapsedTime;
      this.characterMesh.material.uniforms.uVelocityX.value = playerVelocityX;

      this.sackMesh.position.x = posX;
      this.sackMesh.position.y = posY;
      this.sackMesh.material.uniforms.uTime.value = elapsedTime;
      this.sackMesh.material.uniforms.uRecoilY.value = this.recoilY;
      this.sackMesh.material.uniforms.uStretchX.value = this.stretchX;
      this.sackMesh.material.uniforms.uCatchGlow.value = this.catchGlow;
      this.sackMesh.material.uniforms.uVelocityX.value = playerVelocityX;
    }

    this.bokehDust.update(safeDt, elapsedTime);
    this.sparks.update(safeDt, elapsedTime);
    this.counters.update(safeDt);

    this.gradePass.uniforms.uTime.value = elapsedTime;
    this.composer.render(safeDt);
  }

  public dispose(): void {
    this.clearVfx();
    this.bokehDust.dispose();
    this.sparks.dispose();
    this.counters.dispose();

    for (const geo of this.itemGeometryCache.values()) {
      geo.dispose();
    }
    this.itemGeometryCache.clear();

    for (const loaded of this.itemTextures.values()) {
      loaded.texture.dispose();
    }
    this.itemTextures.clear();

    this.bgMesh?.geometry.dispose();
    this.bgMesh?.material.dispose();
    this.characterMesh?.geometry.dispose();
    this.characterMesh?.material.dispose();
    this.sackMesh?.geometry.dispose();
    this.sackMesh?.material.dispose();

    this.composer.dispose();
    this.renderer.dispose();
  }
}

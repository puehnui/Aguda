import * as THREE from 'three';

const POOL_SIZE = 10;

interface CounterSlot {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  active: boolean;
  label: string;
  age: number;
  duration: number;
  startX: number;
  startY: number;
  driftX: number;
}

export class FloatingCounterSystem {
  public readonly group = new THREE.Group();
  private readonly slots: CounterSlot[] = [];
  private readonly textureCache = new Map<string, THREE.CanvasTexture>();
  private readonly sharedGeometry = new THREE.PlaneGeometry(290, 168);
  private cursor = 0;

  constructor(zLayer = 60) {
    this.group.position.z = zLayer;

    for (let i = 0; i < POOL_SIZE; i++) {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null as THREE.Texture | null },
          uOpacity: { value: 0 },
          uHdrLuminance: { value: new THREE.Vector3(1.48, 1.44, 1.36) },
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uMap;
          uniform float uOpacity;
          uniform vec3 uHdrLuminance;
          varying vec2 vUv;

          void main() {
            vec4 tex = texture2D(uMap, vUv);
            if (tex.a < 0.01) discard;
            vec3 col = tex.rgb * uHdrLuminance;
            gl_FragColor = vec4(col, tex.a * uOpacity);
          }
        `,
      });

      const mesh = new THREE.Mesh(this.sharedGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 6;
      mesh.position.z = i * 0.04;
      this.group.add(mesh);

      this.slots.push({
        mesh,
        active: false,
        label: '',
        age: 0,
        duration: 0.90,
        startX: 0,
        startY: 0,
        driftX: 0,
      });
    }

    // Safely refresh cached textures once Montserrat 900 loads without pulling live textures out from active slots
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.load('900 196px Montserrat').then(() => {
        const oldTextures = Array.from(this.textureCache.values());
        this.textureCache.clear();
        for (const slot of this.slots) {
          if (slot.active && slot.label) {
            slot.mesh.material.uniforms.uMap.value = this.getLabelTexture(slot.label);
          }
        }
        for (const tex of oldTextures) {
          tex.dispose();
        }
      });
    }
  }

  private getLabelTexture(label: string): THREE.CanvasTexture {
    const cached = this.textureCache.get(label);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 520;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 196px Montserrat, "Arial Black", sans-serif';

      // Warm sunset contrast halo so bright white glyphs pop clearly over the archway
      ctx.shadowColor = 'rgba(135, 65, 25, 0.72)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, canvas.width * 0.5, canvas.height * 0.52);

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(label, canvas.width * 0.5, canvas.height * 0.52);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    this.textureCache.set(label, texture);
    return texture;
  }

  public spawn(worldX: number, worldY: number, displayDelta: number, isTarget = true): void {
    const slot = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % POOL_SIZE;

    const label = `+${Math.max(1, displayDelta)}`;
    const texture = this.getLabelTexture(label);
    const uniforms = slot.mesh.material.uniforms;
    uniforms.uMap.value = texture;
    uniforms.uHdrLuminance.value.set(
      isTarget ? 1.48 : 1.15,
      isTarget ? 1.44 : 1.12,
      isTarget ? 1.36 : 1.04,
    );
    uniforms.uOpacity.value = 1;

    slot.active = true;
    slot.label = label;
    slot.age = 0;
    slot.duration = 0.90;
    slot.startX = worldX + (Math.random() - 0.5) * 14;
    slot.startY = worldY + 145;
    slot.driftX = (Math.random() - 0.5) * 10;

    slot.mesh.position.x = slot.startX;
    slot.mesh.position.y = slot.startY;
    slot.mesh.scale.setScalar(0.45);
    slot.mesh.visible = true;
  }

  public update(dt: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;

      slot.age += dt;
      const t = slot.age / slot.duration;
      if (t >= 1) {
        slot.active = false;
        slot.label = '';
        slot.mesh.visible = false;
        continue;
      }

      // Crisp elastic pop-in peaking around t~0.11, settled cleanly near 1.0 by t~0.19
      let scale = 1.0;
      if (t < 0.11) {
        const p = t / 0.11;
        scale = 0.45 + (1.18 - 0.45) * (1 - Math.pow(1 - p, 3));
      } else if (t < 0.22) {
        const p = (t - 0.11) / 0.11;
        scale = 1.18 - 0.18 * (p * (2 - p));
      }

      const riseEase = 1 - Math.pow(1 - t, 2.1);
      const opacity = t < 0.68 ? 1 : Math.max(0, 1 - (t - 0.68) / 0.32);

      slot.mesh.position.x = slot.startX + slot.driftX * riseEase;
      slot.mesh.position.y = slot.startY + 65 * riseEase;
      slot.mesh.scale.setScalar(scale);
      slot.mesh.material.uniforms.uOpacity.value = opacity;
    }
  }

  public clear(): void {
    for (const slot of this.slots) {
      slot.active = false;
      slot.label = '';
      slot.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.sharedGeometry.dispose();
    for (const slot of this.slots) {
      slot.mesh.material.dispose();
    }
    for (const tex of this.textureCache.values()) {
      tex.dispose();
    }
    this.textureCache.clear();
  }
}

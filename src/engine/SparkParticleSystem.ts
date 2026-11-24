import * as THREE from 'three';

const MAX_SPARKS = 360;

interface SparkSlot {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  twinkle: number;
  r: number;
  g: number;
  b: number;
}

export class SparkParticleSystem {
  public readonly points: THREE.Points;
  private readonly slots: SparkSlot[] = [];
  private readonly positions = new Float32Array(MAX_SPARKS * 3);
  private readonly colors = new Float32Array(MAX_SPARKS * 3);
  private readonly sizes = new Float32Array(MAX_SPARKS);
  private readonly lives = new Float32Array(MAX_SPARKS);
  private readonly twinkles = new Float32Array(MAX_SPARKS);

  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly lifeAttr: THREE.BufferAttribute;
  private readonly twinkleAttr: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private cursor = 0;

  constructor(zLayer = 50) {
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.slots.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 0,
        life: 1,
        size: 0,
        twinkle: 0,
        r: 1,
        g: 1,
        b: 1,
      });
    }

    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.colAttr = new THREE.BufferAttribute(this.colors, 3);
    this.sizeAttr = new THREE.BufferAttribute(this.sizes, 1);
    this.lifeAttr = new THREE.BufferAttribute(this.lives, 1);
    this.twinkleAttr = new THREE.BufferAttribute(this.twinkles, 1);

    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr.setUsage(THREE.DynamicDrawUsage);
    this.lifeAttr.setUsage(THREE.DynamicDrawUsage);
    this.twinkleAttr.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute('position', this.posAttr);
    geometry.setAttribute('aColor', this.colAttr);
    geometry.setAttribute('aSize', this.sizeAttr);
    geometry.setAttribute('aLife', this.lifeAttr);
    geometry.setAttribute('aTwinkle', this.twinkleAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aLife;
        attribute float aTwinkle;
        uniform float uPixelRatio;

        varying vec3 vColor;
        varying float vLife;
        varying float vTwinkle;

        void main() {
          vColor = aColor;
          vLife = aLife;
          vTwinkle = aTwinkle;

          if (aLife <= 0.001) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            return;
          }

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          float lifeScale = 0.6 + 0.48 * sin(clamp(aLife, 0.0, 1.0) * 3.14159);
          gl_PointSize = aSize * uPixelRatio * lifeScale;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vColor;
        varying float vLife;
        varying float vTwinkle;

        void main() {
          if (vLife <= 0.001) discard;

          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          if (d > 1.0) discard;

          // Crisp pinpoint star core + delicate 4-point flare + soft golden halo
          float core = exp(-d * d * 15.0);
          float flareX = exp(-abs(p.x) * 19.0) * exp(-abs(p.y) * 5.8);
          float flareY = exp(-abs(p.y) * 19.0) * exp(-abs(p.x) * 5.8);
          float halo = exp(-d * d * 3.5) * 0.22;
          float shape = core + (flareX + flareY) * 0.45 + halo;

          float twinkle = 0.65 + 0.52 * sin(uTime * 28.0 + vTwinkle);
          float fadeOut = smoothstep(0.0, 0.30, vLife);

          vec3 hdrCol = vColor * shape * twinkle * fadeOut;
          gl_FragColor = vec4(hdrCol, clamp(shape * fadeOut, 0.0, 1.0));
        }
      `,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.position.z = zLayer;
    this.points.frustumCulled = false;
  }

  public setPixelRatio(dpr: number): void {
    this.material.uniforms.uPixelRatio.value = dpr;
  }

  public emitBurst(worldX: number, worldY: number, isTarget = true): void {
    const count = isTarget ? 130 : 50;
    for (let i = 0; i < count; i++) {
      const slot = this.slots[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_SPARKS;

      // Airy wide firework fountain fanning across courtyard above sack mouth (worldX +- 110, high lift)
      const spreadAngle = (Math.random() - 0.5) * Math.PI * 1.18;
      const speed = (isTarget ? 290 : 195) + Math.random() * (isTarget ? 340 : 210);
      const isWhiteHot = Math.random() < 0.35;
      const highFlyer = Math.random() < 0.34 ? 140 : 0;

      slot.active = true;
      slot.x = worldX + (Math.random() - 0.5) * 180;
      slot.y = worldY + 24 + Math.random() * 42;
      slot.vx = Math.sin(spreadAngle) * speed;
      slot.vy = Math.cos(spreadAngle) * speed + 150 + Math.random() * 130 + highFlyer;
      slot.age = 0;
      slot.life = 0.50 + Math.random() * 0.54;
      slot.size = 9 + Math.random() * 13;
      slot.twinkle = Math.random() * Math.PI * 2;

      if (isWhiteHot) {
        // Warm-white pinpoint star (~35%)
        slot.r = 2.05 + Math.random() * 0.20;
        slot.g = 1.72 + Math.random() * 0.18;
        slot.b = 1.05 + Math.random() * 0.15;
      } else {
        // Golden-amber firework ember (~65%)
        slot.r = 2.00 + Math.random() * 0.24;
        slot.g = 1.18 + Math.random() * 0.18;
        slot.b = 0.34 + Math.random() * 0.10;
      }
    }
  }

  public update(dt: number, elapsedTime: number): void {
    this.material.uniforms.uTime.value = elapsedTime;
    const gravity = -540;
    const drag = Math.pow(0.45, dt);

    for (let i = 0; i < MAX_SPARKS; i++) {
      const s = this.slots[i];
      if (!s.active) {
        this.lives[i] = 0;
        continue;
      }

      s.age += dt;
      const remaining = 1 - s.age / s.life;
      if (remaining <= 0) {
        s.active = false;
        this.lives[i] = 0;
        continue;
      }

      s.vx *= drag;
      s.vy = s.vy * drag + gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      const idx3 = i * 3;
      this.positions[idx3] = s.x;
      this.positions[idx3 + 1] = s.y;
      this.positions[idx3 + 2] = 0;

      this.colors[idx3] = s.r;
      this.colors[idx3 + 1] = s.g;
      this.colors[idx3 + 2] = s.b;

      this.sizes[i] = s.size;
      this.lives[i] = remaining;
      this.twinkles[i] = s.twinkle;
    }

    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.lifeAttr.needsUpdate = true;
    this.twinkleAttr.needsUpdate = true;
  }

  public clear(): void {
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.slots[i].active = false;
      this.lives[i] = 0;
    }
    this.lifeAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

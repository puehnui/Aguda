import * as THREE from 'three';

const MOTE_COUNT = 35;

interface MoteState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  alpha: number;
}

export class BokehDustSystem {
  public readonly points: THREE.Points;
  private readonly motes: MoteState[] = [];
  private readonly positions = new Float32Array(MOTE_COUNT * 3);
  private readonly sizes = new Float32Array(MOTE_COUNT);
  private readonly alphas = new Float32Array(MOTE_COUNT);
  private readonly posAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(zLayer = 10) {
    for (let i = 0; i < MOTE_COUNT; i++) {
      this.motes.push({
        x: Math.random() * 576,
        y: 160 + Math.random() * 820,
        vx: (Math.random() - 0.42) * 14,
        vy: 8 + Math.random() * 18,
        size: 6 + Math.random() * 16,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.2 + Math.random() * 0.45,
      });
      this.sizes[i] = this.motes[i].size;
    }

    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1);
    const sizeAttr = new THREE.BufferAttribute(this.sizes, 1);

    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);

    geometry.setAttribute('position', this.posAttr);
    geometry.setAttribute('aSize', sizeAttr);
    geometry.setAttribute('aAlpha', this.alphaAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPixelRatio;
        varying float vAlpha;

        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;

        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          if (d > 1.0) discard;

          float disc = smoothstep(1.0, 0.35, d);
          float rim = smoothstep(0.45, 0.85, d) * 0.25;
          vec3 golden = vec3(1.18, 0.82, 0.44);
          gl_FragColor = vec4(golden, (disc * 0.6 + rim) * vAlpha);
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

  public update(dt: number, elapsedTime: number): void {
    for (let i = 0; i < MOTE_COUNT; i++) {
      const m = this.motes[i];
      m.x += (m.vx + Math.sin(elapsedTime * 0.7 + m.phase) * 7) * dt;
      m.y += m.vy * dt;

      if (m.y > 1030) m.y = 140;
      if (m.x < -20) m.x = 596;
      if (m.x > 596) m.x = -20;

      const idx3 = i * 3;
      this.positions[idx3] = m.x;
      this.positions[idx3 + 1] = m.y;
      this.positions[idx3 + 2] = 0;

      this.alphas[i] = m.alpha * (0.62 + 0.38 * Math.sin(elapsedTime * 1.4 + m.phase));
    }

    this.posAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  public dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

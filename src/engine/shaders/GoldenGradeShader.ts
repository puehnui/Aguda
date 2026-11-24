import * as THREE from 'three';

export const GoldenGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(576, 1024) },
    uWarmth: { value: 0.18 },
    uVignette: { value: 0.22 },
    uGrain: { value: 0.016 },
    uLift: { value: 1.00 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uWarmth;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uLift;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb * uLift;

      // Subtle warm twilight shadow depth matching SOURCE.mp4 without washing out darks
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float highlightMask = smoothstep(0.22, 0.92, luma);
      float shadowMask = 1.0 - smoothstep(0.0, 0.42, luma);

      col += vec3(0.014, 0.006, 0.012) * shadowMask;

      // Peach-amber golden-hour split grade
      vec3 warmHighlight = col * vec3(1.09, 1.01, 0.90);
      vec3 twilightShadow = col * vec3(0.98, 0.94, 1.04);
      col = mix(col, warmHighlight, highlightMask * uWarmth);
      col = mix(col, twilightShadow, shadowMask * (uWarmth * 0.5));

      // Soft warm sunset vignette around edges
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);
      float vig = 1.0 - smoothstep(0.18, 0.68, r2) * uVignette;
      col *= vig;

      // Micro film grain matching photorealistic footage
      float n = hash12(vUv * uResolution + fract(uTime * 59.94) * 256.0) - 0.5;
      col += n * uGrain * clamp(0.4 + luma, 0.25, 1.0);

      gl_FragColor = vec4(max(col, vec3(0.0)), src.a);
    }
  `,
};

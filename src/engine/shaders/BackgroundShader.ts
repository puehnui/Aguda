import * as THREE from 'three';

export interface BackgroundShaderUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uMap: THREE.IUniform<THREE.Texture | null>;
  uTime: THREE.IUniform<number>;
  uSunCenter: THREE.IUniform<THREE.Vector2>;
  uSunIntensity: THREE.IUniform<number>;
}

export function createBackgroundMaterial(texture: THREE.Texture | null): THREE.ShaderMaterial {
  const uniforms: BackgroundShaderUniforms = {
    uMap: { value: texture },
    uTime: { value: 0 },
    uSunCenter: { value: new THREE.Vector2(0.51, 0.72) },
    uSunIntensity: { value: 0.055 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    depthTest: true,
    transparent: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uTime;
      uniform vec2 uSunCenter;
      uniform float uSunIntensity;
      varying vec2 vUv;

      void main() {
        vec4 tex = texture2D(uMap, vUv);
        vec2 aspectUv = vec2((vUv.x - uSunCenter.x) * 0.5625, vUv.y - uSunCenter.y);
        float dist = length(aspectUv);

        // Soft warm radial golden-hour glow centered near the courtyard archway
        float breath = 0.92 + 0.08 * sin(uTime * 1.15);
        float sunGlow = exp(-dist * dist * 7.5) * uSunIntensity * breath;
        float wideHaze = exp(-dist * dist * 2.1) * (uSunIntensity * 0.42);

        vec3 sunColor = vec3(1.0, 0.68, 0.34);
        vec3 hazeColor = vec3(0.96, 0.56, 0.32);

        vec3 col = tex.rgb + sunColor * sunGlow + hazeColor * wideHaze;
        // Keep archway sky rich warm peach-gold below bloom threshold so +1 & sparks pop cleanly
        col = col / (1.0 + max(vec3(0.0), col - 0.68) * 0.85);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

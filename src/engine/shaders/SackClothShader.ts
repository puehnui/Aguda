import * as THREE from 'three';

export interface SackClothShaderUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uMap: THREE.IUniform<THREE.Texture | null>;
  uTime: THREE.IUniform<number>;
  uRecoilY: THREE.IUniform<number>;
  uStretchX: THREE.IUniform<number>;
  uCatchGlow: THREE.IUniform<number>;
  uMouthUv: THREE.IUniform<THREE.Vector2>;
  uVelocityX: THREE.IUniform<number>;
  uTexelSize: THREE.IUniform<THREE.Vector2>;
}

export function createSackClothMaterial(
  texture: THREE.Texture | null,
  mouthUvX: number,
  mouthUvY: number,
  texWidth: number,
  texHeight: number,
): THREE.ShaderMaterial {
  const uniforms: SackClothShaderUniforms = {
    uMap: { value: texture },
    uTime: { value: 0 },
    uRecoilY: { value: 0 },
    uStretchX: { value: 0 },
    uCatchGlow: { value: 0 },
    uMouthUv: { value: new THREE.Vector2(mouthUvX, mouthUvY) },
    uVelocityX: { value: 0 },
    uTexelSize: { value: new THREE.Vector2(1 / Math.max(1, texWidth), 1 / Math.max(1, texHeight)) },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uRecoilY;
      uniform float uStretchX;
      uniform vec2 uMouthUv;
      uniform float uVelocityX;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Lock deformation to 0 at forearm/hand seam and concentrate recoil on the lower sack belly
        float seamLock = smoothstep(uMouthUv.x - 0.14, uMouthUv.x - 0.02, uv.x);
        float sackBellyMask = smoothstep(uMouthUv.y - 0.035, uMouthUv.y - 0.13, uv.y);

        vec2 dMouth = uv - uMouthUv;
        float mouthBandX = exp(-pow(dMouth.x / 0.22, 2.0));

        // Subtle mouth widening confined below the hand grip
        pos.x += dMouth.x * uStretchX * 150.0 * sackBellyMask * mouthBandX * seamLock;

        // Gentle damped downward catch recoil + traveling cloth ripple on burlap belly
        float dist = length(vec2(dMouth.x * 1.4, dMouth.y));
        float ripple = sin(dist * 34.0 - uTime * 20.0) * abs(uRecoilY) * 0.14 * exp(-dist * 5.0);
        pos.y += (uRecoilY * sackBellyMask + ripple * sackBellyMask) * mouthBandX * seamLock;

        // Subtle cloth drag inertia while sliding horizontally
        float lowerPendulum = smoothstep(uMouthUv.y - 0.04, uMouthUv.y - 0.25, uv.y);
        pos.x -= clamp(uVelocityX * 0.012, -10.0, 10.0) * lowerPendulum * seamLock;

        // Sync breathing subtly with character torso seam
        float torsoMask = smoothstep(0.18, 0.72, uv.y);
        float breath = sin(uTime * 2.15) * 1.45 * torsoMask;
        pos.y += breath;
        pos.x += (uv.x - 0.5) * sin(uTime * 2.15) * 1.1 * torsoMask;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uCatchGlow;
      uniform vec2 uMouthUv;
      varying vec2 vUv;

      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.01) discard;

        // Very subtle warm amber bounce strictly on burlap belly below the gripping hand (never washes out hand/wrist)
        vec2 dMouth = vUv - uMouthUv;
        float bellyMask = smoothstep(uMouthUv.y - 0.055, uMouthUv.y - 0.14, vUv.y);
        float lipBounce = exp(-pow(dMouth.x / 0.12, 2.0)) * bellyMask;
        vec3 col = tex.rgb + vec3(0.95, 0.52, 0.16) * lipBounce * uCatchGlow * 0.06;

        gl_FragColor = vec4(col, tex.a);
      }
    `,
  });
}

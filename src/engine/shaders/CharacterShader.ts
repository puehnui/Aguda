import * as THREE from 'three';

export interface CharacterShaderUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uMap: THREE.IUniform<THREE.Texture | null>;
  uTime: THREE.IUniform<number>;
  uVelocityX: THREE.IUniform<number>;
  uPivotY: THREE.IUniform<number>;
  uTexelSize: THREE.IUniform<THREE.Vector2>;
  uRimStrength: THREE.IUniform<number>;
}

export function createCharacterMaterial(
  texture: THREE.Texture | null,
  pivotYWorld: number,
  texWidth: number,
  texHeight: number,
): THREE.ShaderMaterial {
  const uniforms: CharacterShaderUniforms = {
    uMap: { value: texture },
    uTime: { value: 0 },
    uVelocityX: { value: 0 },
    uPivotY: { value: pivotYWorld },
    uTexelSize: { value: new THREE.Vector2(1 / Math.max(1, texWidth), 1 / Math.max(1, texHeight)) },
    uRimStrength: { value: 0.24 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uVelocityX;
      uniform float uPivotY;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec3 pos = position;

        // Subtle organic idle breathing concentrated on torso & shoulders
        float torsoMask = smoothstep(0.18, 0.72, uv.y);
        float breath = sin(uTime * 2.15) * 1.45 * torsoMask;
        pos.y += breath;
        pos.x += (uv.x - 0.5) * sin(uTime * 2.15) * 1.1 * torsoMask;

        // Subtle momentum lean around lower pivot when sliding left/right
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        float heightAbovePivot = max(0.0, worldPos.y - uPivotY);
        float lean = clamp(uVelocityX * 0.00018, -0.055, 0.055);
        pos.x += lean * heightAbovePivot;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec2 uTexelSize;
      uniform float uRimStrength;
      varying vec2 vUv;

      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.01) discard;

        vec3 col = tex.rgb;

        // Soft optical golden-hour sunset halation rim strictly on sunlit top & right silhouette
        float aUp = texture2D(uMap, clamp(vUv + vec2(0.0, uTexelSize.y * 5.0), 0.0, 1.0)).a;
        float aRight = texture2D(uMap, clamp(vUv + vec2(uTexelSize.x * 5.0, 0.0), 0.0, 1.0)).a;

        float topEdge = clamp(tex.a - aUp, 0.0, 1.0);
        float rightEdge = clamp(tex.a - aRight, 0.0, 1.0);
        float sunHeightMask = smoothstep(0.32, 0.92, vUv.y);
        float rim = clamp(topEdge * 0.75 + rightEdge * 0.45, 0.0, 1.0) * sunHeightMask;

        vec3 sunsetRim = vec3(1.02, 0.68, 0.36);
        col += sunsetRim * rim * uRimStrength;

        gl_FragColor = vec4(col, tex.a);
      }
    `,
  });
}

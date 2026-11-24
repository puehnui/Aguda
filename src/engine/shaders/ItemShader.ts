import * as THREE from 'three';

export interface ItemShaderUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uMap: THREE.IUniform<THREE.Texture | null>;
  uVelocityY: THREE.IUniform<number>;
  uSubsurfaceTint: THREE.IUniform<THREE.Color>;
  uClipEnabled: THREE.IUniform<number>;
  uClipY: THREE.IUniform<number>;
  uSunGlow: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uTexelSize: THREE.IUniform<THREE.Vector2>;
}

export function createItemMaterial(
  texture: THREE.Texture | null,
  subsurfaceTintHex: string,
  texWidth = 256,
  texHeight = 256,
): THREE.ShaderMaterial {
  const uniforms: ItemShaderUniforms = {
    uMap: { value: texture },
    uVelocityY: { value: 0 },
    uSubsurfaceTint: { value: new THREE.Color(subsurfaceTintHex) },
    uClipEnabled: { value: 0 },
    uClipY: { value: 0 },
    uSunGlow: { value: 0.34 },
    uOpacity: { value: 1 },
    uTexelSize: { value: new THREE.Vector2(1 / Math.max(1, texWidth), 1 / Math.max(1, texHeight)) },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uVelocityY;
      uniform vec3 uSubsurfaceTint;
      uniform float uClipEnabled;
      uniform float uClipY;
      uniform float uSunGlow;
      uniform float uOpacity;
      uniform vec2 uTexelSize;

      varying vec2 vUv;
      varying vec3 vWorldPos;

      vec4 sampleSafe(vec2 uv) {
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          return vec4(0.0);
        }
        return texture2D(uMap, uv);
      }

      void main() {
        // Hard clip inside the bottom of the burlap sack so items vanish cleanly
        if (uClipEnabled > 0.5 && vWorldPos.y < uClipY) {
          discard;
        }

        // Alpha-weighted directional vertical motion blur + subtle optical lens softness
        float speedNorm = clamp(abs(uVelocityY) / 860.0, 0.0, 1.0);
        float blurSpan = max(0.004, speedNorm * 0.022);
        float horizSoft = uTexelSize.x * 1.4;

        vec4 center = sampleSafe(vUv);
        vec4 s1 = sampleSafe(vUv + vec2(0.0, blurSpan * 0.5));
        vec4 s2 = sampleSafe(vUv - vec2(0.0, blurSpan * 0.5));
        vec4 s3 = sampleSafe(vUv + vec2(0.0, blurSpan));
        vec4 s4 = sampleSafe(vUv - vec2(0.0, blurSpan));
        vec4 h1 = sampleSafe(vUv + vec2(horizSoft, 0.0));
        vec4 h2 = sampleSafe(vUv - vec2(horizSoft, 0.0));

        float w0 = 0.28;
        float w1 = 0.17;
        float w2 = 0.11;
        float wh = 0.08;

        vec3 premulRgb =
          center.rgb * center.a * w0 +
          (s1.rgb * s1.a + s2.rgb * s2.a) * w1 +
          (s3.rgb * s3.a + s4.rgb * s4.a) * w2 +
          (h1.rgb * h1.a + h2.rgb * h2.a) * wh;
        float totalAlpha =
          center.a * w0 +
          (s1.a + s2.a) * w1 +
          (s3.a + s4.a) * w2 +
          (h1.a + h2.a) * wh;

        vec4 tex = vec4(totalAlpha > 0.001 ? premulRgb / totalAlpha : vec3(0.0), totalAlpha);
        if (tex.a < 0.015) discard;

        // Preserve rich contrast while gently wrapping with golden-hour sunset warmth
        float luma = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 col = mix(tex.rgb, tex.rgb * vec3(1.03, 0.97, 0.90), 0.18);

        // Sunset rim & warm amber/subsurface specular glow
        float aUp = sampleSafe(vUv + vec2(0.0, uTexelSize.y * 3.5)).a;
        float aLeft = sampleSafe(vUv + vec2(-uTexelSize.x * 3.5, 0.0)).a;
        float aRight = sampleSafe(vUv + vec2(uTexelSize.x * 3.5, 0.0)).a;
        float rim = clamp((tex.a - aUp) * 0.7 + (tex.a - min(aLeft, aRight)) * 0.5, 0.0, 1.0);
        float specular = smoothstep(0.60, 0.96, luma);

        col += uSubsurfaceTint * (rim * 0.34 + specular * uSunGlow);

        float clipFade = 1.0;
        if (uClipEnabled > 0.5) {
          clipFade = smoothstep(uClipY, uClipY + 5.0, vWorldPos.y);
        }

        gl_FragColor = vec4(col, tex.a * uOpacity * clipFade);
      }
    `,
  });
}

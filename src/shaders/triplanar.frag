uniform sampler2D uVideoTexture;
uniform float uTileScale;
uniform float uBlendSharp;
uniform vec3 uBoundsMin;
uniform vec3 uBoundsSize;
uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

// Mirror-tiling via modulo — no texture wrap duplication
vec2 mirrorFract(vec2 uv) {
  return abs(fract(uv * 0.5) * 2.0 - 1.0);
}

void main() {
  // Normalise world position within model bounds, then scale for tiling
  vec3 localPos = (vWorldPosition - uBoundsMin) / uBoundsSize * uTileScale;

  // Sample three axis-aligned projections
  vec4 colXY = texture2D(uVideoTexture, mirrorFract(localPos.xy));
  vec4 colXZ = texture2D(uVideoTexture, mirrorFract(localPos.xz));
  vec4 colYZ = texture2D(uVideoTexture, mirrorFract(localPos.yz));

  // Blend weights from absolute world normal, sharpened by uBlendSharp
  vec3 blend = pow(abs(vWorldNormal), vec3(uBlendSharp));
  blend /= (blend.x + blend.y + blend.z + 0.001);

  // Weighted sum: XY uses Z-facing normals, XZ uses Y-facing, YZ uses X-facing
  gl_FragColor = colXY * blend.z + colXZ * blend.y + colYZ * blend.x;
}

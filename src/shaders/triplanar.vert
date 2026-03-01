varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

void main() {
  // World position for triplanar UV projection
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;

  // World-space normal for blend weights
  vWorldNormal = normalize(mat3(modelMatrix) * normal);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}

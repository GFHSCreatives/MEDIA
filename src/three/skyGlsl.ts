/** Shared atmosphere model — used by the sky dome AND as the clouds' aerial-perspective fog,
 *  so distant cloud banks dissolve seamlessly into the horizon glow. Output is display-space RGB. */
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform float uDawn;

vec3 skyColor(vec3 dir) {
  float e = dir.y;
  float h = clamp(e, 0.0, 1.0);
  vec3 zen = mix(vec3(0.015, 0.03, 0.09), vec3(0.11, 0.22, 0.45), uDawn);
  vec3 mid = mix(vec3(0.05, 0.08, 0.19), vec3(0.40, 0.47, 0.66), uDawn);
  vec3 hor = mix(vec3(0.26, 0.17, 0.25), vec3(1.00, 0.66, 0.42), uDawn);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.14, h));
  col = mix(col, zen, smoothstep(0.12, 0.7, h));

  // sunward warmth along the horizon band
  vec2 dxz = normalize(dir.xz + 1e-5);
  vec2 sxz = normalize(uSunDir.xz + 1e-5);
  float az = max(dot(dxz, sxz), 0.0);
  float band = exp(-abs(e) * 14.0);
  col += vec3(1.0, 0.42, 0.16) * pow(az, 2.5) * band * (0.35 + 0.75 * uDawn);
  col += vec3(1.0, 0.62, 0.34) * pow(az, 12.0) * band * (0.2 + 0.6 * uDawn);

  // Mie halo around the sun
  float cosA = clamp(dot(dir, uSunDir), -1.0, 1.0);
  float ang = acos(cosA);
  col += vec3(1.0, 0.52, 0.22) * exp(-ang * 4.5) * (0.15 + 0.75 * uDawn);
  col += vec3(1.0, 0.74, 0.50) * exp(-ang * 22.0) * (0.25 + 1.4 * uDawn);

  // below the horizon: haze over the cloud sea
  if (e < 0.0) {
    col = mix(col, hor * 0.82 + vec3(0.05, 0.02, 0.04), smoothstep(0.0, -0.08, e));
  }
  return col;
}

// Hue-preserving highlight roll-off: compresses the brightest channel above 0.8
// so additive glows never skew toward yellow-green when they clip.
vec3 rolloff(vec3 col) {
  float m = max(max(col.r, col.g), col.b);
  if (m <= 0.8) return col;
  float mc = 0.8 + 0.2 * (1.0 - exp(-(m - 0.8) / 0.2));
  return col * (mc / m);
}
`;

export const HASH_GLSL = /* glsl */ `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

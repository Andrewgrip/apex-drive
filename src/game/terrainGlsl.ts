import * as THREE from "three";
import { ARENA, CITY_HALF } from "./world";

const f = (n: number) => n.toFixed(4);
const rgb = (hex: string) => {
  const c = new THREE.Color(hex);
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;
};

/**
 * GPU twin of `terrainHeight()` in world.ts. Keep both formulas identical: physics samples the
 * CPU version, the rendered ground uses this one, so the car sits exactly on the visible surface.
 */
export const TERRAIN_GLSL = /* glsl */ `
float aSmooth(float e0, float e1, float x) {
  float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float terrainH(vec2 p) {
  float x = p.x;
  float z = p.y;
  float cheb = max(abs(x), abs(z));
  float mask = aSmooth(${f(CITY_HALF + 8)}, ${f(CITY_HALF + 55)}, cheb);
  float h = 5.5 * sin(x * 0.021) * cos(z * 0.017)
          + 3.2 * sin((x + z) * 0.031 + 1.3)
          + 1.6 * sin(x * 0.05 - z * 0.043)
          + 0.6 * sin(x * 0.11 + z * 0.09);
  float corridor = 1.0 - (1.0 - aSmooth(14.0, 90.0, abs(z))) * aSmooth(232.0, 330.0, x);
  float arena = aSmooth(${f(ARENA.r + 10)}, ${f(ARENA.r + 90)}, length(vec2(x - ${f(ARENA.x)}, z - ${f(ARENA.z)})));
  return (h + 4.0) * mask * corridor * arena;
}

vec3 terrainColor(vec2 p, float h) {
  float n = 0.5 + 0.5 * sin(p.x * 0.13 + p.y * 0.07) * cos(p.y * 0.11 - p.x * 0.05);
  vec3 c = mix(${rgb("#5c8a3c")}, ${rgb("#7aa04a")}, n);
  return mix(c, ${rgb("#9a9a5a")}, clamp((h - 8.0) / 10.0, 0.0, 1.0) * 0.6);
}
`;

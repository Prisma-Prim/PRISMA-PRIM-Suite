export const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uLayer;
  uniform float uDark;
  uniform float uCompact;
  uniform float uMobile;
  uniform vec2 uView;
  uniform vec2 uPointer;
  varying vec2 vUv;
  varying vec3 vPosition;
  varying float vFold;

  void main() {
    vUv = uv;
    float t = uv.y;
    float s = (uv.x - 0.5) * 2.0;
    float phase = uTime * 0.22;
    float layer = uLayer;
    float twist = -1.10 + t * 3.55 + 0.34 * sin(t * 5.4 - phase) + layer * 0.13;
    float width = 0.325 + 0.11 * sin(t * 3.14159);
    float center = 0.41 + 0.69 * t + 0.14 * sin(t * 5.8 - 0.4 + phase * 0.8);
    center += layer * 0.038 + uPointer.x * 0.012;
    center = mix(center, center + 0.13, uCompact);
    center = mix(center, 0.63 + 0.33 * t + 0.17 * sin(t * 5.8 + phase * 0.8), uMobile);
    float nx = center * 2.0 - 1.0 + s * width * cos(twist);
    float ny = 1.44 - 2.95 * t + s * 0.105 * sin(twist * 0.8);
    float nz = s * width * sin(twist) * 1.6;
    nz += sin(t * 4.3 - phase * 0.6) * 0.22 - layer * 0.19;
    nz += (s*s - 0.33) * (0.085 + 0.05 * sin(t * 7.0 - phase));
    // A shallow travelling fold keeps the fabric continuous without moving its edges abruptly.
    float fold = sin(t * 10.0 - phase * 1.2 + s * 1.5) * sin(uv.x * 3.14159);
    nz += fold * 0.045;
    ny += uPointer.y * 0.008;
    if (uDark > 0.5) {
      float angle = -0.45 + 1.75 * sin(t * 4.5 - phase * 0.7 + layer * 0.21);
      nx = -1.36 + t * 2.74;
      ny = -0.34 + 0.20 * sin(t * 5.5 + phase * 0.7 + layer * 0.37);
      ny += s * 0.39 * cos(angle) + layer * 0.025;
      nz = s * 0.76 * sin(angle) + 0.17 * cos(t * 5.1 - phase) - layer * 0.16;
      ny += fold * 0.028 + uPointer.y * 0.012;
    }
    vec3 surface = vec3(nx * uView.x, ny * uView.y, nz);
    vec4 viewPosition = modelViewMatrix * vec4(surface, 1.0);
    vPosition = viewPosition.xyz;
    vFold = fold;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

export const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uLayer;
  uniform float uDark;
  varying vec2 vUv;
  varying vec3 vPosition;
  varying float vFold;

  vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 spectrum(float x) {
    vec3 lilac = srgbToLinear(vec3(0.63, 0.53, 0.98));
    vec3 violet = srgbToLinear(vec3(0.46, 0.26, 0.91));
    vec3 rose = srgbToLinear(vec3(0.98, 0.43, 0.75));
    vec3 coral = srgbToLinear(vec3(1.0, 0.48, 0.35));
    vec3 amber = srgbToLinear(vec3(1.0, 0.72, 0.23));
    vec3 cream = srgbToLinear(vec3(1.0, 0.89, 0.58));
    vec3 color = mix(lilac, violet, smoothstep(0.0, 0.18, x));
    color = mix(color, rose, smoothstep(0.16, 0.42, x));
    color = mix(color, coral, smoothstep(0.39, 0.66, x));
    color = mix(color, amber, smoothstep(0.62, 0.85, x));
    return mix(color, cream, smoothstep(0.87, 1.0, x));
  }

  // Long, irregular material-space strands, not screen-space grain.
  float fiberHash(vec2 p) {
    vec2 q = fract(p * vec2(0.1031, 0.0973));
    q += dot(q, q.yx + 33.33);
    return fract((q.x + q.y) * q.x);
  }
  float fiberNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 blend = f * f * (3.0 - 2.0 * f);
    return mix(mix(fiberHash(cell), fiberHash(cell + vec2(1.0, 0.0)), blend.x),
               mix(fiberHash(cell + vec2(0.0, 1.0)), fiberHash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
  }
  float resolvedFiber(vec2 coordinate) {
    // Fade each scale independently as it becomes subpixel; retain the coarser bundles.
    float footprint = max(fwidth(coordinate.x), fwidth(coordinate.y));
    float visibility = 1.0 - smoothstep(0.55, 1.6, footprint);
    return mix(0.5, fiberNoise(coordinate), visibility);
  }

  void main() {
    vec3 n = normalize(cross(dFdx(vPosition), dFdy(vPosition)));
    if (!gl_FrontFacing) n = -n;
    vec3 view = normalize(-vPosition);
    if (dot(n, view) < 0.0) n = -n;

    vec3 dx = dFdx(vPosition), dy = dFdy(vPosition);
    vec2 uvDx = dFdx(vUv), uvDy = dFdy(vUv);
    vec3 across = normalize(dx * uvDy.y - dy * uvDx.y);
    vec3 along = normalize(dy * uvDx.x - dx * uvDy.x);
    float strandU = vUv.x + 0.0035 * sin(vUv.y * 7.0 + uLayer * 0.8)
                              + 0.0012 * sin(vUv.y * 21.0 + vUv.x * 17.0);
    vec2 strandCoordinates = vec2(strandU * 260.0, vUv.y * 4.5 + uLayer * 4.7);
    float reliefVisibility = 1.0 - smoothstep(0.5, 1.4, fwidth(strandCoordinates.x));
    float fiberSlope = fiberNoise(strandCoordinates + vec2(0.17, 0.0))
                     - fiberNoise(strandCoordinates - vec2(0.17, 0.0));
    n = normalize(n + across * fiberSlope * reliefVisibility * 0.18);
    vec3 key = normalize(vec3(-0.65, 0.75, 1.5));
    vec3 halfLight = normalize(key + view);
    float diffuse = max(dot(n, key), 0.0);
    float fresnel = pow(1.0 - max(dot(n, view), 0.0), 2.7);
    float gloss = pow(max(dot(n, halfLight), 0.0), 48.0);
    float coordinate = clamp(vUv.x * 0.82 + vUv.y * 0.24 + uLayer * 0.115 + 0.05 * sin(vUv.y * 5.0 - uTime * 0.05), 0.0, 1.0);
    vec3 color = spectrum(coordinate);
    color *= 0.61 + diffuse * 0.53;
    color += srgbToLinear(vec3(0.75, 0.82, 1.0)) * fresnel * 0.48;
    color += vec3(1.0, 0.93, 0.84) * gloss * 0.29;

    // Material hierarchy: loose bundles, visible strands and resolved microfibers.
    float bundles = resolvedFiber(vec2(strandU * 36.0, vUv.y * 1.15 + uLayer * 3.2));
    float strands = resolvedFiber(strandCoordinates);
    float fineStrands = resolvedFiber(vec2(strandU * 620.0, vUv.y * 14.0 + uLayer * 7.3));
    float microStrands = resolvedFiber(vec2(strandU * 1080.0, vUv.y * 12.0 + uLayer * 13.2));
    float fiberBody = (bundles - 0.5) * 0.04 + (strands - 0.5) * 0.18
                   + (fineStrands - 0.5) * 0.20 + (microStrands - 0.5) * 0.12;
    color *= 1.0 + fiberBody;
    // Elongated sheen follows each strand as the underlying surface bends.
    float longitudinalSheen = pow(max(0.0, 1.0 - abs(dot(along, halfLight))), 8.0);
    float litFace = pow(max(dot(n, halfLight), 0.0), 3.0);
    float brightStrands = smoothstep(0.36, 0.9, 0.58 * strands + 0.42 * fineStrands);
    color += vec3(0.88, 0.77, 0.95) * longitudinalSheen * litFace * brightStrands * 0.045;
    float fineVariation = resolvedFiber(vec2(strandU * 520.0, vUv.y * 175.0));
    color *= 1.0 + (fineVariation - 0.5) * 0.06;
    float selvedge = pow(abs(vUv.x - 0.5) * 2.0, 100.0);
    color += selvedge * vec3(0.24, 0.17, 0.28);
    if (uDark > 0.5) color *= 0.88;
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
    #include <colorspace_fragment>
  }
`;

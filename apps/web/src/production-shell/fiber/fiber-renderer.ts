import {
  DoubleSide,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { fragmentShader, vertexShader } from './fiber-shaders';

export type FiberVariant = 'light' | 'dark';
export type FiberState = 'loading' | 'animated' | 'still' | 'fallback';
export interface FiberController {
  setMotion(enabled: boolean): void;
  dispose(): void;
}

// Owns only the graphics lifecycle; the accepted v3 material lives in fiber-shaders.
export function mountFiber({
  host,
  variant,
  motion,
  onState,
}: {
  host: HTMLDivElement;
  variant: FiberVariant;
  motion: boolean;
  onState: (state: FiberState) => void;
}): FiberController {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: false,
  });
  if (!context) throw new Error('WebGL2 unavailable');
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      context,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch (error) {
    context.getExtension('WEBGL_lose_context')?.loseContext();
    throw error;
  }
  host.append(canvas);
  const parent = host.parentElement ?? host;
  const dark = variant === 'dark';
  let lifecycle: 'ready' | 'lost' | 'failed' | 'disposed' = 'ready';
  let active = motion;
  let visible = false;
  let phase = 0;
  let frameId = 0;
  let lastFrame = 0;
  let renderedFrames = 0;
  let previousState: FiberState | undefined;
  const pointer = new Vector2();
  const smoothPointer = new Vector2();
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 20);
  camera.position.z = 6;
  const halfHeight = Math.tan(MathUtils.degToRad(35) / 2) * camera.position.z;
  // Original v3 topology and three depth-tested layers, unchanged from the prototype.
  const geometry = new PlaneGeometry(1, 1, 64, 176);
  const layers = [2, 1, 0].map((layer) => {
    const uniforms = {
      uTime: { value: phase },
      uLayer: { value: layer },
      uDark: { value: dark ? 1 : 0 },
      uCompact: { value: variant === 'light' ? 1 : 0 },
      uMobile: { value: 0 },
      uView: { value: new Vector2() },
      uPointer: { value: smoothPointer },
    };
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      side: DoubleSide,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      uniforms,
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { material, uniforms };
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  function report(state: FiberState) {
    if (state === previousState) return;
    previousState = state;
    onState(state);
  }

  function stopFrames() {
    cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = 0;
  }

  function fallback() {
    stopFrames();
    canvas.style.visibility = 'hidden';
    report('fallback');
  }

  renderer.debug.onShaderError = () => {
    lifecycle = 'failed';
    fallback();
  };

  function draw() {
    if (lifecycle !== 'ready') return;
    for (const layer of layers) layer.uniforms.uTime.value = phase;
    try {
      renderer.render(scene, camera);
    } catch {
      lifecycle = 'failed';
      fallback();
      return;
    }
    // Shader failure can be reported synchronously by renderer.render.
    if (previousState === 'fallback') return;
    canvas.style.visibility = 'visible';
    canvas.dataset.phase = phase.toFixed(4);
    canvas.dataset.frames = String(++renderedFrames);
    report(active ? 'animated' : 'still');
  }

  function tick(now: number) {
    frameId = 0;
    if (lifecycle !== 'ready' || !active || !visible || document.hidden) return;
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
    lastFrame = now;
    phase += delta;
    smoothPointer.lerp(pointer, 1 - Math.exp(-delta * 2.8));
    draw();
    if (lifecycle === 'ready') frameId = requestAnimationFrame(tick);
  }

  function schedule() {
    stopFrames();
    if (lifecycle === 'ready' && active && visible && !document.hidden)
      frameId = requestAnimationFrame(tick);
  }

  function resize() {
    if (lifecycle !== 'ready') return;
    const rect = host.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const mobile = window.innerWidth <= 700;
    const maxPixels = mobile ? 1050000 : 2100000;
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      mobile ? 1.5 : 1.75,
      Math.sqrt(maxPixels / (width * height)),
    );
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    for (const layer of layers) {
      layer.uniforms.uView.value.set(halfHeight * camera.aspect, halfHeight);
      layer.uniforms.uMobile.value = mobile && !dark ? 1 : 0;
    }
    draw();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    schedule();
  });
  intersection.observe(host);
  document.addEventListener('visibilitychange', schedule);

  function move(event: PointerEvent) {
    if (!active || event.pointerType !== 'mouse') return;
    const rect = parent.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    pointer.set(
      (event.clientX - rect.left) / rect.width - 0.5,
      (event.clientY - rect.top) / rect.height - 0.5,
    );
  }
  function leave() {
    pointer.set(0, 0);
  }
  function lost(event: Event) {
    event.preventDefault();
    lifecycle = 'lost';
    fallback();
  }
  function restored() {
    if (lifecycle === 'disposed') return;
    lifecycle = 'ready';
    previousState = undefined;
    resize();
    schedule();
  }
  parent.addEventListener('pointermove', move, { passive: true });
  parent.addEventListener('pointerleave', leave);
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  resize();

  return {
    setMotion(enabled) {
      active = enabled;
      if (lifecycle === 'ready') report(active ? 'animated' : 'still');
      schedule();
    },
    dispose() {
      if (lifecycle === 'disposed') return;
      lifecycle = 'disposed';
      stopFrames();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', schedule);
      parent.removeEventListener('pointermove', move);
      parent.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      geometry.dispose();
      for (const layer of layers) layer.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

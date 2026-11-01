// Sandbox: render the three storybook pages from the Quaternius/KayKit kits,
// then run a painterly "storybook" filter over them. ?page=1..3 &raw=1
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const q = new URLSearchParams(location.search);
const PAGE = Number(q.get("page") ?? 1);
const RAW = q.has("raw");
const W = 1200, H = 750;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 600);
const loader = new GLTFLoader();
const B = "/models/";
const cache = new Map<string, Promise<THREE.Object3D>>();
function model(kit: string, name: string, ext = "gltf") {
  const key = `${kit}/${name}`;
  if (!cache.has(key)) cache.set(key, loader.loadAsync(`${B}${kit}/${name}.${ext}`).then((g) => {
    g.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
    return g.scene;
  }));
  return cache.get(key)!.then((o) => o.clone());
}
function put(o: THREE.Object3D, x: number, y: number, z: number, ry = 0, s: number | THREE.Vector3Tuple = 1) {
  o.position.set(x, y, z); o.rotation.y = ry;
  if (typeof s === "number") o.scale.setScalar(s); else o.scale.set(...s);
  scene.add(o); return o;
}
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- shared pieces ----------
function mountain(r: number, h: number, snow: string, rock: string, segs = 9) {
  const g = new THREE.ConeGeometry(r, h, segs, 6, false);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = (v.y + h / 2) / h;
    if (t < 0.98) { v.x *= 0.85 + rnd() * 0.3; v.z *= 0.85 + rnd() * 0.3; v.y += (rnd() - 0.5) * h * 0.05; }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const g2 = g.toNonIndexed(); g2.computeVertexNormals();
  const col: number[] = []; const p2 = g2.attributes.position;
  const cs = new THREE.Color(snow), cr = new THREE.Color(rock);
  for (let i = 0; i < p2.count; i += 3) {
    const y = (p2.getY(i) + p2.getY(i + 1) + p2.getY(i + 2)) / 3;
    const c = (y + h / 2) / h > 0.62 + rnd() * 0.1 ? cs : cr;
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  g2.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  m.position.y = h / 2; m.receiveShadow = true;
  const grp = new THREE.Group(); grp.add(m); return grp;
}
function hills(color: string, y = 0, size = 400) {
  const g = new THREE.PlaneGeometry(size, size, 60, 60);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getY(i);
    const far = THREE.MathUtils.smoothstep(Math.hypot(x, z), 25, 60);
    p.setZ(i, far * (Math.sin(x * 0.05) * 3 + Math.cos(z * 0.07) * 2.5 + Math.sin((x + z) * 0.11) * 1.0) - 0.05);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; m.receiveShadow = true; scene.add(m); return m;
}
function glow(color: string, size: number, x: number, y: number, z: number, strength = 1) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!; const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(255,255,255,${strength})`); gr.addColorStop(0.25, color); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.position.set(x, y, z); s.scale.setScalar(size); scene.add(s); return s;
}
function stars(n: number) {
  const g = new THREE.BufferGeometry(); const a: number[] = [];
  for (let i = 0; i < n; i++) {
    const th = rnd() * Math.PI * 2, ph = rnd() * 0.45 + 0.08;
    a.push(Math.cos(th) * 300 * Math.cos(ph), 300 * Math.sin(ph), Math.sin(th) * 300 * Math.cos(ph));
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: "#fff4d8", size: 2.2, sizeAttenuation: false, fog: false })));
}
function skyDome(top: string, bottom: string) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = smoothstep(-0.05,0.5,vP.y); gl_FragColor = vec4(mix(bottom,top,t),1.); }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), m));
}
async function scatter(names: string[], n: number, area: (i: number) => [number, number], s: () => number, y = (_x: number, _z: number) => 0) {
  for (let i = 0; i < n; i++) {
    const [x, z] = area(i);
    put(await model("nature", names[Math.floor(rnd() * names.length)]), x, y(x, z), z, rnd() * 6.3, s());
  }
}
function summitLantern(x: number, y: number, z: number, scale: number) {
  return model("props", "Lantern_Wall").then((l) => {
    put(l, x, y, z, 0, scale);
    const light = new THREE.PointLight("#ffc76a", 400 * scale, 40 * scale, 1.6); light.position.set(x, y + 0.4 * scale, z + 0.3 * scale); scene.add(light);
    glow("rgba(255,190,90,0.9)", 9 * scale, x, y + 0.45 * scale, z + 0.2, 1);
    glow("rgba(255,170,70,0.35)", 30 * scale, x, y + 0.45 * scale, z, 0.5);
  });
}
async function traveler(x: number, z: number, ry: number) {
  const [char, moves] = await Promise.all([
    loader.loadAsync(`${B}kaykit/Ranger.glb`),
    loader.loadAsync(`${B}kaykit/Rig_Medium_MovementBasic.glb`),
  ]);
  const o = char.scene; o.traverse((m) => { const mm = m as THREE.Mesh; if (mm.isMesh) mm.castShadow = true; if (m.name === "Quiver") m.visible = false; });
  put(o, x, 0, z, ry, 0.7);
  const clip = moves.animations.find((a) => /walk/i.test(a.name)) ?? moves.animations[0];
  const mixer = new THREE.AnimationMixer(o); mixer.clipAction(clip).play(); mixer.update(0.35);
  return o;
}

// ---------- the three pages ----------
async function page1() {
  renderer.toneMappingExposure = 1.7;
  // Every so often, the lantern on the Summit lights itself. (night, the lit peak)
  skyDome("#1a2656", "#6a5f8a"); stars(500);
  scene.fog = new THREE.Fog("#4a4870", 60, 260);
  scene.add(new THREE.HemisphereLight("#9aa8e8", "#3c4a38", 2.0));
  const moon = new THREE.DirectionalLight("#b4c4ff", 1.8); moon.position.set(-40, 60, 30); scene.add(moon);
  const peak = mountain(40, 56, "#e6ecf8", "#6a7090", 11); peak.position.set(0, 0, -110); scene.add(peak);
  const p2 = mountain(40, 42, "#c7cfe0", "#4a4f66", 9); p2.position.set(-55, 0, -110); scene.add(p2);
  const p3 = mountain(36, 36, "#c7cfe0", "#4a4f66", 9); p3.position.set(52, 0, -100); scene.add(p3);
  hills("#2c3b2a");
  await summitLantern(0, 55.2, -110, 4);
  await scatter(["Pine_1", "Pine_2", "Pine_3", "Pine_4", "Pine_5"], 26, (i) => [(i % 2 ? 1 : -1) * (18 + rnd() * 30) + 6, 40 - rnd() * 40], () => 1.2 + rnd() * 1.0);
  await scatter(["Rock_Medium_1", "Rock_Medium_2", "Grass_Wispy_Tall", "Fern_1"], 10, () => [(rnd() - 0.5) * 18 + 6, 50 - rnd() * 6], () => 0.5 + rnd() * 0.4);
  camera.position.set(6, 6, 70); camera.lookAt(0, 22, -110);
}
async function page2() {
  renderer.toneMappingExposure = 1.4;
  // Nobody knows why. (a village cottage at night, someone at the window looking up)
  skyDome("#141a3a", "#4b4566"); stars(400);
  scene.fog = new THREE.Fog("#2d2d48", 25, 160);
  scene.add(new THREE.HemisphereLight("#7a86c4", "#20261c", 0.8));
  const moonL = new THREE.DirectionalLight("#b8c6ff", 1.4); moonL.position.set(30, 40, 20); moonL.castShadow = true; scene.add(moonL);
  const moonS = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 12), new THREE.MeshBasicMaterial({ color: "#fff2c8", fog: false }));
  moonS.position.set(55, 60, -120); scene.add(moonS); glow("rgba(255,240,200,0.5)", 40, 55, 60, -121, 0.4);
  hills("#334430");
  const peak = mountain(40, 60, "#d5dcec", "#545a74", 11); peak.position.set(-30, 0, -140); scene.add(peak);
  await summitLantern(-30, 59.2, -140, 3);
  // cottage, 4 x 4 m, built from Medieval Village kit pieces
  const [wall, winWall, doorWall, win, corner, roof, chim, door] = await Promise.all([
    model("village", "Wall_Plaster_Straight"), model("village", "Wall_Plaster_Window_Wide_Round"), model("village", "Wall_Plaster_Door_Round"),
    model("village", "Window_Wide_Round1"), model("village", "Corner_Exterior_Wood"), model("village", "Roof_RoundTiles_8x8"),
    model("village", "Prop_Chimney"), model("village", "Door_1_Round"),
  ]);
  const cx = 4, cz = -6, Wd = 4, O = 0.31, hw = Wd / 2 + O;
  const c = (o: THREE.Object3D) => o.clone();
  put(winWall, cx - 1, 0, cz + hw, 0); put(win, cx - 1, 0, cz + hw, 0); put(doorWall, cx + 1, 0, cz + hw, 0); put(door, cx + 1, 0, cz + hw, 0);
  for (const x of [-1, 1]) put(c(wall), cx + x, 0, cz - hw, Math.PI);
  for (const z of [-1, 1]) { put(c(wall), cx - hw, 0, cz + z, -Math.PI / 2); put(c(wall), cx + hw, 0, cz + z, Math.PI / 2); }
  for (const [x, z, r] of [[-1, -1, Math.PI], [1, -1, Math.PI / 2], [1, 1, 0], [-1, 1, -Math.PI / 2]] as const) put(c(corner), cx + x * hw, 0, cz + z * hw, r);
  put(roof, cx, 3.1, cz, Math.PI / 2, [(Wd + 1.2) / 10.33, 0.9, (Wd + 1.2) / 9.95]);
  put(chim, cx - 1.2, 2.9, cz - 0.4);
  // warm window light
  const wl = new THREE.PointLight("#ffb35a", 25, 10, 1.6); wl.position.set(cx - 1, 1.6, cz + hw + 0.8); scene.add(wl);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.2), new THREE.MeshBasicMaterial({ color: "#ffc067" }));
  pane.position.set(cx - 1, 1.55, cz + hw - 0.12); scene.add(pane);
  glow("rgba(255,180,90,0.5)", 2.5, cx - 1, 1.6, cz + hw + 0.2, 0.6);
  for (const x of [-3, -1.2, 0.6]) put(await model("village", "Prop_WoodenFence_Single"), cx + x - 1, 0, cz + hw + 3, 0, 1);
  await scatter(["CommonTree_1", "CommonTree_3", "Pine_2", "Pine_4"], 9, (i) => [cx + (i % 2 ? 9 : -9) + (rnd() - 0.5) * 8, cz - 4 - rnd() * 14], () => 1 + rnd() * 0.5);
  await scatter(["Bush_Common_Flowers", "Grass_Common_Tall", "Flower_3_Group", "Rock_Medium_2"], 14, () => [cx + (rnd() - 0.5) * 14, cz + hw + 1 + rnd() * 6], () => 0.35 + rnd() * 0.3);
  camera.position.set(cx + 9, 2.4, cz + 20); camera.lookAt(cx - 9, 7, cz - 30);
}
async function page3() {
  // Those who walk to it come back... different. More themselves. (dawn, a traveler on the trail)
  skyDome("#f2c39a", "#fde7c8");
  scene.fog = new THREE.Fog("#f6d9b8", 60, 420);
  scene.add(new THREE.HemisphereLight("#ffe7cc", "#5f7a3a", 1.3));
  const sun = new THREE.DirectionalLight("#ffd29a", 2.6); sun.position.set(-20, 14, -30); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -20; sc.right = sc.top = 20; scene.add(sun);
  hills("#86a752");
  const peak = mountain(34, 42, "#fff6ee", "#7f86a0", 11); peak.position.set(10, 0, -150); scene.add(peak);
  const p2 = mountain(30, 26, "#f3e6dc", "#8c8ca4", 9); p2.position.set(-55, 0, -140); scene.add(p2);
  await summitLantern(10, 41.2, -150, 3.5);
  glow("rgba(255,230,180,0.8)", 60, -60, 18, -200, 0.6);
  // a winding stone path
  for (let i = 0; i < 40; i++) {
    const t = i / 40; const z = 6 - t * 60; const x = Math.sin(t * 5) * 4 * (1 - t * 0.5);
    put(await model("nature", i % 3 ? "RockPath_Round_Small_1" : "RockPath_Round_Wide"), x + (rnd() - 0.5), 0.02, z, rnd() * 6, 0.8);
  }
  await traveler(Math.sin(0.2 * 5) * 4 * 0.9 + 0.3, 6 - 0.2 * 60, Math.PI + 0.35);
  await scatter(["CommonTree_1", "CommonTree_2", "CommonTree_4", "CommonTree_5", "Pine_3"], 18, (i) => [(i % 2 ? 1 : -1) * (9 + rnd() * 18), -5 - rnd() * 50], () => 0.9 + rnd() * 0.5);
  await scatter(["Grass_Common_Tall", "Grass_Wispy_Tall", "Flower_3_Group", "Flower_4_Group", "Bush_Common_Flowers", "Clover_1"], 70, () => {
    let x = 0; const z = 4 - rnd() * 40; do { x = (rnd() - 0.5) * 30; } while (Math.abs(x - Math.sin(((6 - z) / 60) * 5) * 4) < 1.6); return [x, z];
  }, () => 0.35 + rnd() * 0.3);
  camera.position.set(5, 2.6, 4); camera.lookAt(1, 6.5, -60);
}

// ---------- the storybook filter ----------
// 1) Kuwahara smoothing turns surfaces into soft brush dabs
// 2) a soft ink line where colors change sharply
// 3) paper grain, slight color bleed at the edges, warm vignette
const PAINT = new THREE.ShaderMaterial({
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(W, H) }, radius: { value: 5 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform int radius; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
    vec3 tex(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
    void main(){
      vec2 px = 1.0/res;
      // wobble the lookup a little, like wet paint spreading
      vec2 uv = vUv + (vec2(fbm(vUv*18.), fbm(vUv*18.+7.))-.5)*px*6.;
      vec3 m[4]; vec3 s[4];
      for(int k=0;k<4;k++){ m[k]=vec3(0.); s[k]=vec3(0.); }
      float n = float((radius+1)*(radius+1));
      for(int j=0;j<=6;j++){ if(j>radius) break; for(int i=0;i<=6;i++){ if(i>radius) break;
        vec3 c;
        c = tex(uv + vec2(-i,-j)*px); m[0]+=c; s[0]+=c*c;
        c = tex(uv + vec2( i,-j)*px); m[1]+=c; s[1]+=c*c;
        c = tex(uv + vec2( i, j)*px); m[2]+=c; s[2]+=c*c;
        c = tex(uv + vec2(-i, j)*px); m[3]+=c; s[3]+=c*c;
      }}
      float best = 1e9; vec3 col = vec3(0.);
      for(int k=0;k<4;k++){ vec3 mu = m[k]/n; vec3 v = abs(s[k]/n - mu*mu); float sv = v.r+v.g+v.b; if(sv<best){ best=sv; col=mu; } }
      // ink edges from luminance change
      float l = dot(col, vec3(.299,.587,.114));
      float lx = dot(tex(uv+vec2(2,0)*px)-tex(uv-vec2(2,0)*px), vec3(.33));
      float ly = dot(tex(uv+vec2(0,2)*px)-tex(uv-vec2(0,2)*px), vec3(.33));
      float edge = smoothstep(.12,.45, length(vec2(lx,ly)));
      col = mix(col, col*vec3(.45,.36,.30), edge*.55);
      // gentle storybook grade: lift blacks to warm ink, soften saturation a touch
      col = mix(vec3(l), col, .9);
      col = col*.92 + vec3(.06,.045,.03);
      // paper grain and pigment pooling
      float grain = fbm(vUv*res/3.);
      float pool = fbm(vUv*6.);
      col *= .9 + .12*grain;
      col *= .96 + .08*pool;
      // vignette that fades into the parchment color
      vec2 d = abs(vUv-.5)*2.; float r = pow(pow(d.x,5.)+pow(d.y*1.04,5.),.2)*.5 + (fbm(vUv*7.)-.5)*.16 + (fbm(vUv*40.)-.5)*.04;
      float vig = smoothstep(.485,.465, r);
      col *= mix(1., .9, smoothstep(.4,.48, r)); // pigment darkens where the wash dries at its edge
      col = mix(vec3(.96,.9,.78), col, vig);
      gl_FragColor = vec4(col,1.);
    }`,
});

async function main() {
  await [page1, page2, page3][PAGE - 1]();
  if (RAW) { renderer.render(scene, camera); }
  else {
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null);
    PAINT.uniforms.tDiffuse.value = rt.texture;
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), PAINT);
    const ps = new THREE.Scene(); ps.add(quad);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.render(ps, new THREE.Camera());
  }
  document.title = "done";
}
main().catch((e) => { console.error(e); document.title = "error " + e; });

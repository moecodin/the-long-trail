import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// single-file preview: assets are inlined as data URLs in window.__ASSETS
const INLINE = (window as unknown as { __ASSETS?: Record<string, string> }).__ASSETS;
if (INLINE) THREE.DefaultLoadingManager.setURLModifier((u) => {
  const m = u.match(/(kaykit|nature)\/[^/?#]+$/);
  return (m && INLINE[m[0]]) || u;
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const sky = new THREE.Color("#bfe3f2");
scene.background = sky;
scene.fog = new THREE.Fog(sky, 18, 45);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 2.2, 6.5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.5;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.48;

const hemi = new THREE.HemisphereLight("#e8f4ff", "#6b8a3a", 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight("#fff3d6", 2.4);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera as THREE.OrthographicCamera;
sc.left = sc.bottom = -12; sc.right = sc.top = 12;
sun.shadow.bias = -0.0005;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48),
  new THREE.MeshStandardMaterial({ color: "#7fae4a", roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
const load = (url: string) => loader.loadAsync(url);

// tiny seeded random so the meadow looks the same every time
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

async function meadow() {
  const names = [
    "CommonTree_1", "CommonTree_2", "CommonTree_3", "Pine_1", "Pine_3", "Bush_Common", "Bush_Common_Flowers",
    "Grass_Common_Tall", "Grass_Common_Short", "Grass_Wispy_Tall", "Flower_3_Group", "Flower_4_Group",
    "Clover_1", "Fern_1", "Rock_Medium_1", "Rock_Medium_2", "RockPath_Round_Wide", "RockPath_Round_Small_1",
    "Mushroom_Common", "Plant_1_Big",
  ];
  const m: Record<string, THREE.Object3D> = {};
  await Promise.all(names.map(async (n) => {
    const g = await load(`./nature/${n}.gltf`);
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    m[n] = g.scene;
  }));
  // the nature kit's small plants are modeled big; shrink them to a person-sized world
  const SCALE: Record<string, number> = {
    Grass_Common_Tall: 0.3, Grass_Common_Short: 0.3, Grass_Wispy_Tall: 0.3, Flower_3_Group: 0.3, Flower_4_Group: 0.3,
    Clover_1: 0.3, Fern_1: 0.1, Plant_1_Big: 0.22, Mushroom_Common: 0.4, Bush_Common: 0.6, Bush_Common_Flowers: 0.6,
    Rock_Medium_1: 0.45, Rock_Medium_2: 0.45, RockPath_Round_Wide: 0.45, RockPath_Round_Small_1: 0.45,
  };
  const place = (n: string, x: number, z: number, s = 1, ry = rnd() * Math.PI * 2) => {
    s *= SCALE[n] ?? 1;
    const o = m[n].clone();
    o.position.set(x, 0, z);
    o.rotation.y = ry;
    o.scale.setScalar(s);
    scene.add(o);
    return o;
  };
  // ring of trees, leaving the view toward the camera open
  const trees = ["CommonTree_1", "CommonTree_2", "CommonTree_3", "Pine_1", "Pine_3"];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.3;
    const r = 9 + rnd() * 6;
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (z > 4 && Math.abs(x) < 6) continue;
    place(trees[i % trees.length], x, z, 0.9 + rnd() * 0.4);
  }
  // stepping-stone path under and behind the traveler
  for (let i = 0; i < 12; i++) place(i % 2 ? "RockPath_Round_Small_1" : "RockPath_Round_Wide", Math.sin(i * 0.6) * 0.5, 1.4 - i * 0.75, 1);
  const small = ["Grass_Common_Tall", "Grass_Common_Short", "Grass_Wispy_Tall", "Flower_3_Group", "Flower_4_Group", "Clover_1", "Fern_1", "Plant_1_Big", "Mushroom_Common"];
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = 1.1 + Math.pow(rnd(), 0.7) * 11;
    place(small[Math.floor(rnd() * small.length)], Math.sin(a) * r, Math.cos(a) * r, 0.7 + rnd() * 0.6);
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2, r = 3 + rnd() * 6;
    place(rnd() < 0.5 ? "Bush_Common_Flowers" : "Bush_Common", Math.sin(a) * r, Math.cos(a) * r, 0.8 + rnd() * 0.4);
  }
  place("Rock_Medium_1", -2.4, -1.5, 0.8);
  place("Rock_Medium_2", 2.8, -2.4, 1);
}

// ---- KayKit traveler ----
const CHARS = [
  { file: "Ranger", name: "Ranger" },
  { file: "Rogue", name: "Rogue" },
  { file: "Mage", name: "Mage" },
];
let clips: THREE.AnimationClip[] = [];
let mixer: THREE.AnimationMixer | null = null;
let current: THREE.Object3D | null = null;
let idx = 0, walking = false, soft = false;
const originals = new Map<THREE.MeshStandardMaterial, { color: THREE.Color; rough: number }>();
const cache: Record<string, THREE.Object3D> = {};
const clip = (n: string) => clips.find((c) => c.name === n)!;

function applySoft(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!originals.has(mat)) originals.set(mat, { color: mat.color.clone(), rough: mat.roughness });
    const og = originals.get(mat)!;
    // "Soften" = warm, slightly muted tint and a matte finish, closer to Quaternius' painted look
    if (soft) { mat.color.copy(og.color).multiply(new THREE.Color("#efe2c8")); mat.roughness = 1; }
    else { mat.color.copy(og.color); mat.roughness = og.rough; }
  });
}

async function showChar(i: number) {
  const c = CHARS[i];
  if (!cache[c.file]) {
    const g = await load(`./kaykit/${c.file}.glb`);
    // hide weapons/props attached to hands so it reads as a traveler, not a fighter
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.castShadow = true;
      if (/(bow|sword|dagger|staff|wand|crossbow|knife|axe|shield|spellbook)/i.test(o.name) && !/arm|body|head|leg/i.test(o.name)) o.visible = false;
    });
    cache[c.file] = g.scene;
  }
  if (current) scene.remove(current);
  current = cache[c.file];
  current.position.set(0, 0, 0);
  current.rotation.y = 0;
  scene.add(current);
  applySoft(current);
  mixer = new THREE.AnimationMixer(current);
  play();
  (document.getElementById("label")!).textContent = `${c.name} (KayKit). Drag to look around, pinch to zoom.`;
}

function play() {
  if (!mixer) return;
  mixer.stopAllAction();
  mixer.clipAction(clip(walking ? "Walking_A" : "Idle_A")).play();
}

const ui = (id: string) => document.getElementById(id) as HTMLButtonElement;
ui("next").onclick = () => { idx = (idx + 1) % CHARS.length; showChar(idx); };
ui("walk").onclick = () => { walking = !walking; ui("walk").classList.toggle("on", walking); if (!walking && current) { current.position.set(0, 0, 0); current.rotation.y = 0; } play(); };
ui("soft").onclick = () => { soft = !soft; ui("soft").classList.toggle("on", soft); if (current) applySoft(current); };
let golden = false;
ui("time").onclick = () => {
  golden = !golden; ui("time").classList.toggle("on", golden);
  const s = new THREE.Color(golden ? "#f6c99a" : "#bfe3f2");
  scene.background = s; (scene.fog as THREE.Fog).color = s;
  sun.color.set(golden ? "#ffc27a" : "#fff3d6");
  sun.position.set(golden ? 10 : 6, golden ? 3.5 : 10, golden ? -2 : 4);
  hemi.color.set(golden ? "#ffd9b0" : "#e8f4ff");
};

const clock = new THREE.Clock();
let walkT = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  controls.update();
  mixer?.update(dt);
  if (walking && current) {
    // small loop along the path
    walkT += dt * 0.35;
    const r = 2;
    current.position.set(Math.sin(walkT) * r, 0, Math.cos(walkT) * r - r);
    current.rotation.y = walkT + Math.PI / 2;
  }
  renderer.render(scene, camera);
});
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const [, general, moves] = await Promise.all([
  meadow(),
  load("./kaykit/Rig_Medium_General.glb"),
  load("./kaykit/Rig_Medium_MovementBasic.glb"),
]);
clips = [...general.animations, ...moves.animations];
await showChar(0);
document.getElementById("loading")!.remove();

// stackhaus — a 3D architecture game: Tetris pieces fall from the sky,
// Jenga physics decides whether your building stands.
// three.js for rendering, cannon-es for rigid-body balance.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as CANNON from "cannon-es";
import { PIECES, yawDims, rollDims, volumeOf, centerOfMassXZ, scoreForLanding, hasToppled, spawnHeight, pickPiece } from "./logic.js";
import { sfx } from "./audio.js";

const PLATFORM_HALF = 4;      // 8x8 m build platform
const MOVE_LIMIT = 6.5;       // how far a held piece may stray
const FALL_BASE = 4.5, FALL_FAST = 13, FALL_HARD = 32;
const MOVE_SPEED = 7;

// ---------- renderer / scene ----------
const canvasWrap = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
canvasWrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 300);
camera.position.set(11, 9, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 6;
controls.maxDistance = 70;
controls.target.set(0, 2, 0);
let userHoldUntil = 0;
controls.addEventListener("start", () => { userHoldUntil = performance.now() + 5000; });

const hemi = new THREE.HemisphereLight(0xeaf2ff, 0xd8c9ae, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dd, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -20; sun.shadow.camera.right = 20;
sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -10;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// ground + platform visuals
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(46, 64),
  new THREE.MeshStandardMaterial({ color: 0xe7e0d2, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2; ground.position.y = -1.01; ground.receiveShadow = true;
scene.add(ground);

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(5.6, 6.2, 1, 48),
  new THREE.MeshStandardMaterial({ color: 0xcfc4ae, roughness: 0.9 })
);
plinth.position.y = -0.5; plinth.receiveShadow = true; plinth.castShadow = true;
scene.add(plinth);

const slab = new THREE.Mesh(
  new THREE.BoxGeometry(PLATFORM_HALF * 2, 1, PLATFORM_HALF * 2),
  new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.85 })
);
slab.position.y = -0.5; slab.receiveShadow = true; slab.castShadow = true;
scene.add(slab);

// faint build-area grid on the slab
const grid = new THREE.GridHelper(PLATFORM_HALF * 2, 8, 0xb9ac93, 0xd8cfba);
grid.position.y = 0.01;
scene.add(grid);

// ---------- physics ----------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.allowSleep = true;
world.broadphase = new CANNON.SAPBroadphase(world);
const pieceMat = new CANNON.Material("piece");
const platMat = new CANNON.Material("plat");
world.addContactMaterial(new CANNON.ContactMaterial(pieceMat, platMat, { friction: 0.5, restitution: 0.02 }));
world.addContactMaterial(new CANNON.ContactMaterial(pieceMat, pieceMat, { friction: 0.65, restitution: 0.02 }));

const platBody = new CANNON.Body({ type: CANNON.Body.STATIC, material: platMat, shape: new CANNON.Box(new CANNON.Vec3(PLATFORM_HALF, 0.5, PLATFORM_HALF)) });
platBody.position.set(0, -0.5, 0);
world.addBody(platBody);
// safety net far below (should never be reached — toppling ends the game first)
const netBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
netBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
netBody.position.set(0, -12, 0);
world.addBody(netBody);

// ---------- game state ----------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitEdges = new THREE.EdgesGeometry(unitBox);
const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4038, transparent: true, opacity: 0.3 });

let state = "ready"; // ready | falling | settling | over
let active = null;   // {def, dims, mesh, body, index}
let pendingLock = false;
let locked = [];     // {mesh, body, dims, mass, restPos, settledAt}
let nextIndex = -1, nextDef = null;
let score = 0, pieces = 0, lastMilestone = 0;
let best = 0;
try { best = Number(localStorage.getItem("stackhaus.best") || 0); } catch { /* private mode */ }

const $ = (id) => document.getElementById(id);
const ui = {
  score: $("hud-score"), height: $("hud-height"), pieces: $("hud-pieces"), best: $("hud-best"),
  next: $("next-piece"), dot: $("balance-dot"), wobble: $("wobble"),
  overlay: $("overlay"), overlayCard: $("overlay-card"),
};

function topY() {
  let t = 0;
  for (const l of locked) t = Math.max(t, l.body.position.y + l.dims[1] / 2);
  return t;
}

function makeMesh(def, dims, active_) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({
    color: def.color, roughness: 0.65, metalness: 0.05,
    emissive: active_ ? def.color : 0x000000, emissiveIntensity: active_ ? 0.25 : 0,
  }));
  m.scale.set(dims[0], dims[1], dims[2]);
  m.castShadow = true; m.receiveShadow = true;
  const e = new THREE.LineSegments(unitEdges, edgeMat);
  g.add(m, e);
  g.scale.set(1, 1, 1);
  // scale the group so edges follow
  m.scale.set(dims[0], dims[1], dims[2]);
  e.scale.set(dims[0], dims[1], dims[2]);
  return g;
}

function spawnPiece() {
  if (state === "over") return;
  const { def, index } = nextDef ? { def: nextDef, index: nextIndex } : pickPiece(Math.random, -1);
  const nxt = pickPiece(Math.random, index);
  nextDef = nxt.def; nextIndex = nxt.index;
  renderNext();

  const dims = def.dims.slice();
  const y = spawnHeight(topY());
  const mesh = makeMesh(def, dims, true);
  mesh.position.set(0, y, 0);
  scene.add(mesh);
  // Held by the crane: a dynamic body driven by strong velocity control.
  // (cannon-es creates no contacts for kinematic-vs-static, so a kinematic
  // held piece would fall straight through the platform.)
  const body = new CANNON.Body({
    type: CANNON.Body.DYNAMIC, material: pieceMat,
    shape: new CANNON.Box(new CANNON.Vec3(dims[0] / 2, dims[1] / 2, dims[2] / 2)),
    fixedRotation: true,
  });
  body.mass = dims[0] * dims[1] * dims[2];
  body.updateMassProperties();
  body.allowSleep = false; // no dozing off while the crane holds it
  body.angularDamping = 0.99;
  body.linearDamping = 0.05;
  body.position.set(0, y, 0);
  body.addEventListener("collide", (ev) => {
    if (state !== "falling" || !active || ev.target !== active.body) return;
    if (ev.body === platBody || locked.some((l) => l.body === ev.body)) pendingLock = true;
  });
  world.addBody(body);
  active = { def, dims, mesh, body, index, holdX: 0, holdZ: 0 };
  state = "falling";
}

function reshapeActive(dims) {
  const b = active.body;
  b.shapes.length = 0;
  b.addShape(new CANNON.Box(new CANNON.Vec3(dims[0] / 2, dims[1] / 2, dims[2] / 2)));
  b.aabbNeedsUpdate = true;
  b.position.y += 1.2; // lift so the new shape can't pop the tower
  active.dims = dims;
  const [m, e] = active.mesh.children;
  m.scale.set(dims[0], dims[1], dims[2]);
  e.scale.set(dims[0], dims[1], dims[2]);
}

function lockPiece() {
  const a = active; if (!a) return;
  active = null;
  const b = a.body;
  // release the crane: free rotation, sleep allowed, keep a whisper of velocity
  b.fixedRotation = false;
  b.updateMassProperties();
  b.velocity.scale(0.25, b.velocity);
  b.angularVelocity.set(0, 0, 0);
  b.allowSleep = true; b.sleepSpeedLimit = 0.45; b.sleepTimeLimit = 0.5;
  b.wakeUp();
  const entry = { mesh: a.mesh, body: b, dims: a.dims, mass: b.mass, restPos: null, lockAt: performance.now() };
  // active glow off
  a.mesh.children[0].material.emissiveIntensity = 0;
  b.addEventListener("sleep", () => { if (!entry.restPos) entry.restPos = b.position.clone(); });
  locked.push(entry);

  const h = b.position.y;
  const dist = Math.hypot(b.position.x, b.position.z);
  const pts = scoreForLanding({ height: h, distFromAxis: dist });
  score += pts; pieces++;
  sfx.lock();
  const milestone = Math.floor(topY() / 8);
  if (milestone > lastMilestone) { lastMilestone = milestone; sfx.chime(); }
  state = "settling";
  updateHud();
}

// ---------- input ----------
const keys = {};
addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  keys[e.key.toLowerCase()] = true;
  if (state !== "falling" || !active) return;
  if (e.key === "q" || e.key === "Q") { reshapeActive(yawDims(active.dims)); sfx.click(); }
  if (e.key === "e" || e.key === "E") { reshapeActive(yawDims(active.dims)); sfx.click(); }
  if (e.key === "r" || e.key === "R") { reshapeActive(rollDims(active.dims)); sfx.click(); }
  if (e.key === " ") { hardDrop = true; }
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
let hardDrop = false;

// touch pad
document.querySelectorAll("[data-k]").forEach((btn) => {
  const k = btn.dataset.k;
  const on = (e) => { e.preventDefault(); pressTouch(k, true); };
  const off = (e) => { e.preventDefault(); pressTouch(k, false); };
  btn.addEventListener("pointerdown", on);
  btn.addEventListener("pointerup", off);
  btn.addEventListener("pointerleave", off);
});
function pressTouch(k, down) {
  if (k === "yaw" || k === "roll") { if (down && state === "falling" && active) { reshapeActive(k === "yaw" ? yawDims(active.dims) : rollDims(active.dims)); sfx.click(); } return; }
  if (k === "drop") { if (down) hardDrop = true; return; }
  keys[k] = down;
}

// ---------- UI ----------
function updateHud() {
  ui.score.textContent = score;
  ui.height.textContent = topY().toFixed(1) + " m";
  ui.pieces.textContent = pieces;
  ui.best.textContent = Math.max(best, score);
}
function renderNext() {
  if (!nextDef) return;
  ui.next.innerHTML = `<span class="swatch" style="background:#${nextDef.color.toString(16).padStart(6, "0")}"></span>
    <span><b>${nextDef.name}</b><br><span class="dim">${nextDef.dims.join(" × ")} m</span></span>`;
}
function showOverlay(html) { ui.overlayCard.innerHTML = html; ui.overlay.hidden = false; }
function hideOverlay() { ui.overlay.hidden = true; }

$("btn-mute").addEventListener("click", (e) => { const m = sfx.toggleMute(); e.currentTarget.textContent = m ? "🔇" : "🔊"; });
$("btn-help").addEventListener("click", () => { sfx.click(); showHelp(); });
ui.overlay.addEventListener("click", (e) => {
  if (e.target.id === "btn-again") { hideOverlay(); sfx.click(); reset(); }
});

function showHelp() {
  showOverlay(`<h2>How to build</h2>
  <p>Crane pieces fall from the sky. Guide each one onto the tower — then let go. Physics does the rest.</p>
  <ul>
    <li><b>Move:</b> WASD / arrows</li>
    <li><b>Rotate flat:</b> Q / E &nbsp;·&nbsp; <b>Tip over:</b> R</li>
    <li><b>Fast fall:</b> hold Shift &nbsp;·&nbsp; <b>Drop:</b> Space</li>
    <li><b>Camera:</b> drag to orbit, wheel to zoom</li>
  </ul>
  <p>Score rewards <b>height</b> and <b>centred</b> placements. Touching the tower while positioning locks the piece instantly — so mind your clearances.</p>
  <p class="warn">If the tower topples, the build is over.</p>
  <button id="btn-again" class="primary">Start building</button>`);
}

function gameOver(reason) {
  if (state === "over") return;
  state = "over";
  sfx.crash();
  if (score > best) { best = score; try { localStorage.setItem("stackhaus.best", String(best)); } catch {} }
  updateHud();
  showOverlay(`<h2>Toppled!</h2>
    <p>${reason}</p>
    <div class="stats"><div><b>${score}</b><span>score</span></div>
    <div><b>${topY().toFixed(1)} m</b><span>height</span></div>
    <div><b>${pieces}</b><span>pieces</span></div></div>
    <button id="btn-again" class="primary">Build again</button>`);
}

function reset() {
  for (const l of locked) { world.removeBody(l.body); scene.remove(l.mesh); }
  if (active) { world.removeBody(active.body); scene.remove(active.mesh); active = null; }
  locked = []; score = 0; pieces = 0; lastMilestone = 0; nextDef = null; pendingLock = false;
  updateHud();
  state = "ready";
  spawnPiece();
}

// ---------- per-frame ----------
const clock = new THREE.Clock();
let creakAt = 0;

function heldControl(dt) {
  const b = active.body;
  let mx = 0, mz = 0;
  if (keys["arrowleft"] || keys["a"]) mx -= 1;
  if (keys["arrowright"] || keys["d"]) mx += 1;
  if (keys["arrowup"] || keys["w"]) mz -= 1;
  if (keys["arrowdown"] || keys["s"]) mz += 1;
  // crane target follows the player's input; the body chases it on a stiff spring
  const n = Math.hypot(mx, mz) || 1;
  active.holdX = Math.max(-MOVE_LIMIT, Math.min(MOVE_LIMIT, active.holdX + (mx / n) * MOVE_SPEED * dt));
  active.holdZ = Math.max(-MOVE_LIMIT, Math.min(MOVE_LIMIT, active.holdZ + (mz / n) * MOVE_SPEED * dt));
  const fast = keys["shift"];
  const vy = hardDrop ? -FALL_HARD : fast ? -FALL_FAST : -FALL_BASE;
  const k = 10;
  b.velocity.set(
    Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, (active.holdX - b.position.x) * k)),
    vy,
    Math.max(-MOVE_SPEED, Math.min(MOVE_SPEED, (active.holdZ - b.position.z) * k))
  );
  b.angularVelocity.set(0, 0, 0);
  active.mesh.position.copy(b.position);
}

function checkCollapse() {
  for (const l of locked) {
    const p = l.body.position;
    if (p.y < -2) { gameOver("A piece fell off the platform."); return; }
    if (l.restPos && hasToppled(l.restPos, p)) { gameOver("The tower lost its balance."); return; }
  }
}

function updateBalance() {
  if (!locked.length) { ui.dot.style.transform = "translate(-50%,-50%)"; return; }
  const com = centerOfMassXZ(locked.map((l) => ({ x: l.body.position.x, z: l.body.position.z, mass: l.mass })));
  const s = 34; // px per metre
  const dx = Math.max(-1, Math.min(1, com.x / PLATFORM_HALF)) * s;
  const dz = Math.max(-1, Math.min(1, com.z / PLATFORM_HALF)) * s;
  ui.dot.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dz}px))`;
  ui.dot.classList.toggle("off", com.mag > 1.6);
}

function updateWobble(now) {
  let v = 0;
  for (const l of locked) v = Math.max(v, l.body.velocity.length());
  const wobbling = v > 1.4;
  ui.wobble.hidden = !wobbling;
  if (wobbling && now - creakAt > 900) { creakAt = now; sfx.creak(); }
}

function autoCamera(dt) {
  if (performance.now() < userHoldUntil) return;
  const ty = Math.max(1.5, Math.min(42, topY() * 0.55));
  controls.target.y += (ty - controls.target.y) * Math.min(1, dt * 1.5);
  const want = Math.min(64, 15 + topY() * 0.85);
  const off = camera.position.clone().sub(controls.target);
  const cur = off.length();
  const next = cur + (want - cur) * Math.min(1, dt * 1.2);
  off.setLength(next);
  camera.position.copy(controls.target).add(off);
  sun.position.set(controls.target.x + 14, controls.target.y + 20, controls.target.z + 9);
  sun.target.position.copy(controls.target);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (state === "falling" && active) heldControl(dt);
  world.step(1 / 60, dt, 3);
  if (pendingLock && state === "falling") { pendingLock = false; lockPiece(); }

  if (state === "settling") {
    const last = locked[locked.length - 1];
    const asleep = last && last.body.sleepState === CANNON.Body.SLEEPING;
    if (asleep || (last && now - last.lockAt > 2600)) {
      if (last && !last.restPos) last.restPos = last.body.position.clone();
      hardDrop = false;
      if (state !== "over") spawnPiece();
    }
  }
  if (state === "falling" || state === "settling") { checkCollapse(); updateWobble(now); }
  updateBalance();
  autoCamera(dt);
  controls.update();
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- boot ----------
updateHud();
showHelp();
animate();

// tiny debug/testing handle (read-only snapshots)
window.__sh = {
  get state() { return state; },
  get score() { return score; },
  get pieces() { return pieces; },
  get locked() { return locked.length; },
  get topY() { return topY(); },
};

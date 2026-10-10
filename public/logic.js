// stackhaus — pure game logic. No DOM, no three.js, no physics engine.
// Everything here is deterministic and unit-tested.

/** Architectural pieces. dims = [x, y, z] in metres. All axis-aligned boxes. */
export const PIECES = [
  { name: "Cube", dims: [2, 2, 2], color: 0xe9dcc3, weight: 1 },
  { name: "Slab", dims: [4, 1, 4], color: 0xd9a05f, weight: 1 },
  { name: "Beam", dims: [4, 1, 1], color: 0x8fb4d9, weight: 1 },
  { name: "Column", dims: [1, 4, 1], color: 0xa9c79a, weight: 1 },
  { name: "Wall", dims: [4, 2, 1], color: 0xd98f8f, weight: 1 },
];

/** Yaw 90°: swap x and z extents. */
export function yawDims(d) {
  return [d[2], d[1], d[0]];
}

/** Roll 90° about the z-axis: swap x and y extents (tips a beam upright). */
export function rollDims(d) {
  return [d[1], d[0], d[2]];
}

export const volumeOf = (d) => d[0] * d[1] * d[2];

/**
 * Horizontal centre of mass of settled pieces.
 * pieces: [{x, z, mass}] → {x, z, mag} (mag = offset from platform centre)
 */
export function centerOfMassXZ(pieces) {
  let m = 0, x = 0, z = 0;
  for (const p of pieces) {
    m += p.mass; x += p.x * p.mass; z += p.z * p.mass;
  }
  if (m <= 0) return { x: 0, z: 0, mag: 0 };
  const cx = x / m, cz = z / m;
  return { x: cx, z: cz, mag: Math.hypot(cx, cz) };
}

/**
 * Score for locking a piece.
 * Rewards height, rewards building near the central axis (balanced).
 */
export function scoreForLanding({ height, distFromAxis }) {
  const h = Math.max(0, height);
  const d = Math.max(0, distFromAxis);
  const centering = Math.max(0, 15 - 6 * d);
  return Math.round(10 + 4 * h + centering);
}

/** A locked piece has toppled if it drifted this far from where it settled. */
export const TOPPLE_DISPLACEMENT = 2.2;

export function hasToppled(restPos, curPos) {
  const dx = curPos.x - restPos.x, dy = curPos.y - restPos.y, dz = curPos.z - restPos.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) > TOPPLE_DISPLACEMENT;
}

/** Height at which the next piece spawns. */
export function spawnHeight(topY) {
  return topY + 9;
}

/** Pick a random piece, avoiding an immediate repeat of the last one. */
export function pickPiece(rand = Math.random, lastIndex = -1) {
  let i = Math.floor(rand() * PIECES.length);
  if (PIECES.length > 1 && i === lastIndex) i = (i + 1) % PIECES.length;
  return { def: PIECES[i], index: i };
}

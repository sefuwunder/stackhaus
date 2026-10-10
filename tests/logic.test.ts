import { test, expect } from "bun:test";
import {
  PIECES, yawDims, rollDims, volumeOf,
  centerOfMassXZ, scoreForLanding, hasToppled,
  spawnHeight, pickPiece, TOPPLE_DISPLACEMENT,
} from "../public/logic.js";

test("five architectural pieces, all boxes", () => {
  expect(PIECES.length).toBe(5);
  for (const p of PIECES) {
    expect(p.dims.length).toBe(3);
    expect(p.dims.every((d) => d > 0)).toBe(true);
  }
});

test("yaw swaps x/z, twice returns to start", () => {
  const d = [4, 1, 2];
  expect(yawDims(d)).toEqual([2, 1, 4]);
  expect(yawDims(yawDims(d))).toEqual(d);
});

test("roll swaps x/y — tips a beam upright", () => {
  expect(rollDims([4, 1, 1])).toEqual([1, 4, 1]); // beam → column
  expect(rollDims([1, 4, 1])).toEqual([4, 1, 1]); // column → beam
});

test("volume", () => {
  expect(volumeOf([2, 2, 2])).toBe(8);
  expect(volumeOf([4, 1, 4])).toBe(16);
});

test("centre of mass is mass-weighted", () => {
  const com = centerOfMassXZ([
    { x: 0, z: 0, mass: 8 },
    { x: 4, z: 0, mass: 8 },
  ]);
  expect(com.x).toBeCloseTo(2, 9);
  expect(com.z).toBe(0);
  expect(com.mag).toBeCloseTo(2, 9);
});

test("centre of mass of nothing is centred", () => {
  expect(centerOfMassXZ([])).toEqual({ x: 0, z: 0, mag: 0 });
});

test("scoring rewards height and centred placement", () => {
  const low = scoreForLanding({ height: 1, distFromAxis: 0 });
  const high = scoreForLanding({ height: 10, distFromAxis: 0 });
  expect(high).toBeGreaterThan(low);
  const centred = scoreForLanding({ height: 5, distFromAxis: 0 });
  const off = scoreForLanding({ height: 5, distFromAxis: 3 });
  expect(centred).toBeGreaterThan(off);
  expect(scoreForLanding({ height: -5, distFromAxis: -2 })).toBeGreaterThan(0);
});

test("topple detection", () => {
  const rest = { x: 0, y: 5, z: 0 };
  expect(hasToppled(rest, { x: 0.5, y: 5, z: 0 })).toBe(false);
  expect(hasToppled(rest, { x: 0, y: 5 - TOPPLE_DISPLACEMENT - 0.1, z: 0 })).toBe(true);
  expect(hasToppled(rest, { x: 3, y: 5, z: 0 })).toBe(true);
});

test("spawn height clears the tower", () => {
  expect(spawnHeight(0)).toBe(9);
  expect(spawnHeight(12)).toBe(21);
});

test("pickPiece avoids immediate repeats", () => {
  for (let last = 0; last < PIECES.length; last++) {
    const { index } = pickPiece(() => last / PIECES.length, last);
    expect(index).not.toBe(last);
  }
  const { def } = pickPiece(() => 0.999, -1);
  expect(PIECES).toContain(def);
});

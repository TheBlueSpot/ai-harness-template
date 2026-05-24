function clampF64(value: f64, min: f64, max: f64): f64 {
  return Math.min(Math.max(value, min), max);
}

function writeMask4(outPtr: usize, i: i32, bits: i32): void {
  store<u8>(outPtr + <usize>i, bits & 1 ? 1 : 0);
  store<u8>(outPtr + <usize>i + 1, bits & 2 ? 1 : 0);
  store<u8>(outPtr + <usize>i + 2, bits & 4 ? 1 : 0);
  store<u8>(outPtr + <usize>i + 3, bits & 8 ? 1 : 0);
}

export function circle_rect_overlap(cx: f64, cy: f64, r: f64, rx: f64, ry: f64, rw: f64, rh: f64): i32 {
  const closestX = clampF64(cx, rx, rx + rw);
  const closestY = clampF64(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r ? 1 : 0;
}

export function integrate_movement_f32(xPtr: usize, yPtr: usize, vxPtr: usize, vyPtr: usize, dt: f32, count: i32): void {
  const dt4 = f32x4.splat(dt);
  let i = 0;
  for (; i <= count - 4; i += 4) {
    const offset = <usize>i << 2;
    v128.store(xPtr + offset, f32x4.add(v128.load(xPtr + offset), f32x4.mul(v128.load(vxPtr + offset), dt4)));
    v128.store(yPtr + offset, f32x4.add(v128.load(yPtr + offset), f32x4.mul(v128.load(vyPtr + offset), dt4)));
  }
  for (; i < count; i += 1) {
    const offset = <usize>i << 2;
    store<f32>(xPtr + offset, load<f32>(xPtr + offset) + load<f32>(vxPtr + offset) * dt);
    store<f32>(yPtr + offset, load<f32>(yPtr + offset) + load<f32>(vyPtr + offset) * dt);
  }
}

function rotate_xy_f32(xPtr: usize, yPtr: usize, outXPtr: usize, outYPtr: usize, sin: f32, cos: f32, count: i32): void {
  const sin4 = f32x4.splat(sin);
  const cos4 = f32x4.splat(cos);
  let i = 0;
  for (; i <= count - 4; i += 4) {
    const offset = <usize>i << 2;
    const x = v128.load(xPtr + offset);
    const y = v128.load(yPtr + offset);
    v128.store(outXPtr + offset, f32x4.sub(f32x4.mul(x, cos4), f32x4.mul(y, sin4)));
    v128.store(outYPtr + offset, f32x4.add(f32x4.mul(x, sin4), f32x4.mul(y, cos4)));
  }
  for (; i < count; i += 1) {
    const offset = <usize>i << 2;
    const x = load<f32>(xPtr + offset);
    const y = load<f32>(yPtr + offset);
    store<f32>(outXPtr + offset, x * cos - y * sin);
    store<f32>(outYPtr + offset, x * sin + y * cos);
  }
}

export function rotate_points_f32(xPtr: usize, yPtr: usize, outXPtr: usize, outYPtr: usize, sin: f32, cos: f32, count: i32): void {
  rotate_xy_f32(xPtr, yPtr, outXPtr, outYPtr, sin, cos, count);
}

export function rotate_vectors_f32(xPtr: usize, yPtr: usize, outXPtr: usize, outYPtr: usize, sin: f32, cos: f32, count: i32): void {
  rotate_xy_f32(xPtr, yPtr, outXPtr, outYPtr, sin, cos, count);
}

export function range_filter_f32(valuesPtr: usize, min: f32, max: f32, outPtr: usize, count: i32): i32 {
  const min4 = f32x4.splat(min);
  const max4 = f32x4.splat(max);
  let hits = 0;
  let i = 0;
  for (; i <= count - 4; i += 4) {
    const offset = <usize>i << 2;
    const values = v128.load(valuesPtr + offset);
    const geMin = f32x4.ge(values, min4);
    const leMax = f32x4.le(values, max4);
    const mask = v128.and(geMin, leMax);
    const bits = i32x4.bitmask(mask);
    writeMask4(outPtr, i, bits);
    hits += popcnt(bits);
  }
  for (; i < count; i += 1) {
    const value = load<f32>(valuesPtr + (<usize>i << 2));
    const hit = value >= min && value <= max ? 1 : 0;
    store<u8>(outPtr + <usize>i, hit);
    hits += hit;
  }
  return hits;
}

export function predicate_filter_mask_f32(valuesPtr: usize, min: f32, max: f32, outPtr: usize, count: i32): i32 {
  return range_filter_f32(valuesPtr, min, max, outPtr, count);
}

export function rect_rect_overlap_batch_f32(
  axPtr: usize,
  ayPtr: usize,
  awPtr: usize,
  ahPtr: usize,
  bxPtr: usize,
  byPtr: usize,
  bwPtr: usize,
  bhPtr: usize,
  outPtr: usize,
  count: i32
): i32 {
  let hits = 0;
  let i = 0;
  for (; i <= count - 4; i += 4) {
    const offset = <usize>i << 2;
    const ax = v128.load(axPtr + offset);
    const ay = v128.load(ayPtr + offset);
    const aw = v128.load(awPtr + offset);
    const ah = v128.load(ahPtr + offset);
    const bx = v128.load(bxPtr + offset);
    const by = v128.load(byPtr + offset);
    const bw = v128.load(bwPtr + offset);
    const bh = v128.load(bhPtr + offset);
    const mask = v128.and(
      v128.and(f32x4.lt(ax, f32x4.add(bx, bw)), f32x4.gt(f32x4.add(ax, aw), bx)),
      v128.and(f32x4.lt(ay, f32x4.add(by, bh)), f32x4.gt(f32x4.add(ay, ah), by))
    );
    const bits = i32x4.bitmask(mask);
    writeMask4(outPtr, i, bits);
    hits += popcnt(bits);
  }
  for (; i < count; i += 1) {
    const offset = <usize>i << 2;
    const hit =
      load<f32>(axPtr + offset) < load<f32>(bxPtr + offset) + load<f32>(bwPtr + offset) &&
      load<f32>(axPtr + offset) + load<f32>(awPtr + offset) > load<f32>(bxPtr + offset) &&
      load<f32>(ayPtr + offset) < load<f32>(byPtr + offset) + load<f32>(bhPtr + offset) &&
      load<f32>(ayPtr + offset) + load<f32>(ahPtr + offset) > load<f32>(byPtr + offset)
        ? 1
        : 0;
    store<u8>(outPtr + <usize>i, hit);
    hits += hit;
  }
  return hits;
}

export function circle_rect_overlap_batch_f32(
  cxPtr: usize,
  cyPtr: usize,
  rPtr: usize,
  rxPtr: usize,
  ryPtr: usize,
  rwPtr: usize,
  rhPtr: usize,
  outPtr: usize,
  count: i32
): i32 {
  let hits = 0;
  let i = 0;
  for (; i <= count - 4; i += 4) {
    const offset = <usize>i << 2;
    const cx = v128.load(cxPtr + offset);
    const cy = v128.load(cyPtr + offset);
    const r = v128.load(rPtr + offset);
    const rx = v128.load(rxPtr + offset);
    const ry = v128.load(ryPtr + offset);
    const rw = v128.load(rwPtr + offset);
    const rh = v128.load(rhPtr + offset);
    const closestX = f32x4.min(f32x4.max(cx, rx), f32x4.add(rx, rw));
    const closestY = f32x4.min(f32x4.max(cy, ry), f32x4.add(ry, rh));
    const dx = f32x4.sub(cx, closestX);
    const dy = f32x4.sub(cy, closestY);
    const distanceSq = f32x4.add(f32x4.mul(dx, dx), f32x4.mul(dy, dy));
    const mask = f32x4.le(distanceSq, f32x4.mul(r, r));
    const bits = i32x4.bitmask(mask);
    writeMask4(outPtr, i, bits);
    hits += popcnt(bits);
  }
  for (; i < count; i += 1) {
    const offset = <usize>i << 2;
    const cx = load<f32>(cxPtr + offset);
    const cy = load<f32>(cyPtr + offset);
    const r = load<f32>(rPtr + offset);
    const rx = load<f32>(rxPtr + offset);
    const ry = load<f32>(ryPtr + offset);
    const rw = load<f32>(rwPtr + offset);
    const rh = load<f32>(rhPtr + offset);
    const closestX = Mathf.min(Mathf.max(cx, rx), rx + rw);
    const closestY = Mathf.min(Mathf.max(cy, ry), ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    const hit = dx * dx + dy * dy <= r * r ? 1 : 0;
    store<u8>(outPtr + <usize>i, hit);
    hits += hit;
  }
  return hits;
}

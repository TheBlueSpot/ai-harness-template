export type MutableFloatBatch = Float32Array | number[];
export type MutableMaskBatch = Uint8Array | number[];

export type MovementBatch = {
  x: MutableFloatBatch;
  y: MutableFloatBatch;
  vx: ArrayLike<number>;
  vy: ArrayLike<number>;
  dt: number;
  count?: number;
};

export type RotationBatch = {
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  outX: MutableFloatBatch;
  outY: MutableFloatBatch;
  angle: number;
  count?: number;
};

export type RangeFilterBatch = {
  values: ArrayLike<number>;
  min: number;
  max: number;
  out: MutableMaskBatch;
  count?: number;
};

export type RectRectBatch = {
  ax: ArrayLike<number>;
  ay: ArrayLike<number>;
  aw: ArrayLike<number>;
  ah: ArrayLike<number>;
  bx: ArrayLike<number>;
  by: ArrayLike<number>;
  bw: ArrayLike<number>;
  bh: ArrayLike<number>;
  out: MutableMaskBatch;
  count?: number;
};

export type CircleRectBatch = {
  cx: ArrayLike<number>;
  cy: ArrayLike<number>;
  radius: ArrayLike<number>;
  rx: ArrayLike<number>;
  ry: ArrayLike<number>;
  rw: ArrayLike<number>;
  rh: ArrayLike<number>;
  out: MutableMaskBatch;
  count?: number;
};

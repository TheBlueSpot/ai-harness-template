import { KeyframePath } from './SyncSystem.js';

const PLAYFIELD = Object.freeze({ x: 48, y: 48, w: 1504, h: 804 });
const BORDER_WALLS = Object.freeze([
  { x: 0, y: 0, w: 1600, h: 36 },
  { x: 0, y: 864, w: 1600, h: 36 },
  { x: 0, y: 0, w: 36, h: 900 },
  { x: 1564, y: 0, w: 36, h: 900 }
]);

function pingPongFrames(start, delta, holdFrames = 0) {
  const values = [];
  for (let step = 0; step <= delta; step += 1) {
    values.push(start + step);
  }
  for (let hold = 0; hold < holdFrames; hold += 1) {
    values.push(start + delta);
  }
  for (let step = delta - 1; step >= 1; step -= 1) {
    values.push(start + step);
  }
  for (let hold = 0; hold < holdFrames; hold += 1) {
    values.push(start);
  }
  return values;
}

function repeatedFrames(value, frameCount) {
  return Array.from({ length: frameCount }, () => value);
}

function offsetFrames(frames, offset) {
  const length = frames.length;
  return frames.map((_, index) => frames[(index + offset) % length]);
}

function pathFromFrames(xFrames, yFrames) {
  return new KeyframePath({ xFrames, yFrames });
}

function obstacle(id, path, size, loopLength, color = '#58b6ff') {
  return Object.freeze({ id, path, size: Object.freeze(size), loopLength, color });
}

function level({
  id,
  name,
  hint,
  start,
  goal,
  walls = [],
  obstacles = []
}) {
  return Object.freeze({
    id,
    name,
    hint,
    bounds: PLAYFIELD,
    start: Object.freeze(start),
    goal: Object.freeze(goal),
    walls: Object.freeze([...BORDER_WALLS, ...walls.map((wall) => Object.freeze({ ...wall }))]),
    obstacles: Object.freeze(obstacles)
  });
}

const laneY = pingPongFrames(180, 360, 18);
const laneXWide = pingPongFrames(260, 960, 12);
const laneXTight = pingPongFrames(320, 720, 10);
const weaveY = pingPongFrames(150, 470, 8);
const weaveYFast = pingPongFrames(170, 410, 6);
const centerX = pingPongFrames(420, 560, 16);
const crossX = pingPongFrames(320, 940, 8);
const loop72 = laneY.length;
const loop48 = laneXWide.length;
const loop60 = laneXTight.length;
const loop56 = weaveY.length;
const loop52 = weaveYFast.length;
const loop64 = centerX.length;

const LEVELS = Object.freeze([
  level({
    id: 1,
    name: 'Level 1',
    hint: 'Single lane. Wait for gap, then move.',
    start: { x: 92, y: 438, size: 24 },
    goal: { x: 1452, y: 438, w: 42, h: 42 },
    walls: [],
    obstacles: [
      obstacle(
        'l1-a',
        pathFromFrames(repeatedFrames(430, loop72), laneY),
        { w: 34, h: 34 },
        loop72
      )
    ]
  }),
  level({
    id: 2,
    name: 'Level 2',
    hint: 'Two movers, shared timer.',
    start: { x: 92, y: 438, size: 24 },
    goal: { x: 1452, y: 438, w: 42, h: 42 },
    walls: [
      { x: 260, y: 196, w: 1040, h: 24 },
      { x: 260, y: 680, w: 1040, h: 24 }
    ],
    obstacles: [
      obstacle(
        'l2-a',
        pathFromFrames(repeatedFrames(560, loop72), laneY),
        { w: 32, h: 32 },
        loop72
      ),
      obstacle(
        'l2-b',
        pathFromFrames(repeatedFrames(900, loop72), offsetFrames(laneY, 30)),
        { w: 32, h: 32 },
        loop72
      )
    ]
  }),
  level({
    id: 3,
    name: 'Level 3',
    hint: 'Horizontal sweep. Use alcoves.',
    start: { x: 90, y: 742, size: 24 },
    goal: { x: 1450, y: 114, w: 42, h: 42 },
    walls: [
      { x: 320, y: 140, w: 64, h: 520 },
      { x: 704, y: 240, w: 64, h: 520 },
      { x: 1088, y: 140, w: 64, h: 520 }
    ],
    obstacles: [
      obstacle(
        'l3-a',
        pathFromFrames(laneXWide, repeatedFrames(190, loop48)),
        { w: 34, h: 34 },
        loop48
      ),
      obstacle(
        'l3-b',
        pathFromFrames(offsetFrames(laneXWide, 24), repeatedFrames(460, loop48)),
        { w: 34, h: 34 },
        loop48
      ),
      obstacle(
        'l3-c',
        pathFromFrames(offsetFrames(laneXWide, 12), repeatedFrames(728, loop48)),
        { w: 34, h: 34 },
        loop48
      )
    ]
  }),
  level({
    id: 4,
    name: 'Level 4',
    hint: 'Crossing lines. Sync never drifts.',
    start: { x: 96, y: 96, size: 24 },
    goal: { x: 1450, y: 754, w: 42, h: 42 },
    walls: [
      { x: 260, y: 260, w: 150, h: 42 },
      { x: 1188, y: 598, w: 150, h: 42 }
    ],
    obstacles: [
      obstacle(
        'l4-a',
        pathFromFrames(repeatedFrames(512, loop56), weaveY),
        { w: 32, h: 32 },
        loop56
      ),
      obstacle(
        'l4-b',
        pathFromFrames(repeatedFrames(1060, loop56), offsetFrames(weaveY, 18)),
        { w: 32, h: 32 },
        loop56
      ),
      obstacle(
        'l4-c',
        pathFromFrames(crossX, repeatedFrames(420, crossX.length)),
        { w: 30, h: 30 },
        crossX.length
      )
    ]
  }),
  level({
    id: 5,
    name: 'Level 5',
    hint: 'Narrow gates. Reset fast.',
    start: { x: 96, y: 742, size: 24 },
    goal: { x: 1450, y: 114, w: 42, h: 42 },
    walls: [
      { x: 290, y: 180, w: 56, h: 520 },
      { x: 650, y: 180, w: 56, h: 520 },
      { x: 1010, y: 180, w: 56, h: 520 },
      { x: 1370, y: 180, w: 56, h: 520 }
    ],
    obstacles: [
      obstacle(
        'l5-a',
        pathFromFrames(repeatedFrames(420, loop52), weaveYFast),
        { w: 28, h: 28 },
        loop52
      ),
      obstacle(
        'l5-b',
        pathFromFrames(repeatedFrames(780, loop52), offsetFrames(weaveYFast, 16)),
        { w: 28, h: 28 },
        loop52
      ),
      obstacle(
        'l5-c',
        pathFromFrames(repeatedFrames(1140, loop52), offsetFrames(weaveYFast, 32)),
        { w: 28, h: 28 },
        loop52
      )
    ]
  }),
  level({
    id: 6,
    name: 'Level 6',
    hint: 'Center pressure. Read pattern.',
    start: { x: 96, y: 438, size: 24 },
    goal: { x: 1450, y: 438, w: 42, h: 42 },
    walls: [
      { x: 288, y: 150, w: 56, h: 220 },
      { x: 288, y: 530, w: 56, h: 220 },
      { x: 1240, y: 150, w: 56, h: 220 },
      { x: 1240, y: 530, w: 56, h: 220 }
    ],
    obstacles: [
      obstacle(
        'l6-a',
        pathFromFrames(centerX, repeatedFrames(250, loop64)),
        { w: 32, h: 32 },
        loop64
      ),
      obstacle(
        'l6-b',
        pathFromFrames(offsetFrames(centerX, 32), repeatedFrames(618, loop64)),
        { w: 32, h: 32 },
        loop64
      )
    ]
  }),
  level({
    id: 7,
    name: 'Level 7',
    hint: 'Staggered towers. Commit to lane.',
    start: { x: 96, y: 96, size: 24 },
    goal: { x: 1450, y: 754, w: 42, h: 42 },
    walls: [
      { x: 300, y: 150, w: 72, h: 220 },
      { x: 300, y: 520, w: 72, h: 220 },
      { x: 750, y: 150, w: 72, h: 220 },
      { x: 750, y: 520, w: 72, h: 220 },
      { x: 1200, y: 150, w: 72, h: 220 },
      { x: 1200, y: 520, w: 72, h: 220 }
    ],
    obstacles: [
      obstacle(
        'l7-a',
        pathFromFrames(repeatedFrames(470, loop60), laneXTight),
        { w: 28, h: 28 },
        loop60
      ),
      obstacle(
        'l7-b',
        pathFromFrames(repeatedFrames(928, loop60), offsetFrames(laneXTight, 20)),
        { w: 28, h: 28 },
        loop60
      ),
      obstacle(
        'l7-c',
        pathFromFrames(offsetFrames(laneXWide, 8), repeatedFrames(432, loop48)),
        { w: 30, h: 30 },
        loop48
      )
    ]
  }),
  level({
    id: 8,
    name: 'Level 8',
    hint: 'Weave finish. Same rules, tighter asks.',
    start: { x: 96, y: 742, size: 24 },
    goal: { x: 1450, y: 114, w: 42, h: 42 },
    walls: [
      { x: 240, y: 220, w: 130, h: 48 },
      { x: 470, y: 450, w: 130, h: 48 },
      { x: 700, y: 220, w: 130, h: 48 },
      { x: 930, y: 450, w: 130, h: 48 },
      { x: 1160, y: 220, w: 130, h: 48 }
    ],
    obstacles: [
      obstacle(
        'l8-a',
        pathFromFrames(repeatedFrames(360, loop56), weaveY),
        { w: 30, h: 30 },
        loop56
      ),
      obstacle(
        'l8-b',
        pathFromFrames(repeatedFrames(760, loop56), offsetFrames(weaveY, 18)),
        { w: 30, h: 30 },
        loop56
      ),
      obstacle(
        'l8-c',
        pathFromFrames(repeatedFrames(1160, loop56), offsetFrames(weaveY, 36)),
        { w: 30, h: 30 },
        loop56
      ),
      obstacle(
        'l8-d',
        pathFromFrames(offsetFrames(centerX, 14), repeatedFrames(410, loop64)),
        { w: 28, h: 28 },
        loop64
      )
    ]
  }),
  level({
    id: 9,
    name: 'Level 9',
    hint: 'Final loop. Short, clean, synchronized.',
    start: { x: 96, y: 438, size: 24 },
    goal: { x: 1450, y: 438, w: 42, h: 42 },
    walls: [
      { x: 340, y: 120, w: 62, h: 250 },
      { x: 340, y: 530, w: 62, h: 250 },
      { x: 660, y: 220, w: 62, h: 460 },
      { x: 980, y: 120, w: 62, h: 250 },
      { x: 980, y: 530, w: 62, h: 250 },
      { x: 1300, y: 220, w: 62, h: 460 }
    ],
    obstacles: [
      obstacle(
        'l9-a',
        pathFromFrames(crossX, repeatedFrames(210, crossX.length)),
        { w: 28, h: 28 },
        crossX.length
      ),
      obstacle(
        'l9-b',
        pathFromFrames(offsetFrames(crossX, 18), repeatedFrames(640, crossX.length)),
        { w: 28, h: 28 },
        crossX.length
      ),
      obstacle(
        'l9-c',
        pathFromFrames(repeatedFrames(610, loop52), offsetFrames(weaveYFast, 10)),
        { w: 28, h: 28 },
        loop52
      ),
      obstacle(
        'l9-d',
        pathFromFrames(repeatedFrames(1088, loop52), offsetFrames(weaveYFast, 30)),
        { w: 28, h: 28 },
        loop52
      )
    ]
  })
]);

const CAMPAIGN_META = Object.freeze({
  title: 'The World\'s Hardest Game: Frame-Perfect',
  subtitle: 'Nine-stage campaign scaffold with deterministic sync.',
  totalLevels: LEVELS.length,
  startLabel: 'Start campaign',
  restartLabel: 'Return to menu',
  completionLabel: 'Total deaths'
});

function getLevelById(id) {
  return LEVELS.find((entry) => entry.id === id) ?? null;
}

export { CAMPAIGN_META, LEVELS, getLevelById };

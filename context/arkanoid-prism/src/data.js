export const WIDTH = 1280;
export const HEIGHT = 720;

export const PADDLE_Y = 654;
export const PADDLE_WIDTH = 156;
export const PADDLE_HEIGHT = 22;
export const PADDLE_SPEED = 940;

export const BALL_RADIUS = 10;
export const BALL_SPEED = 520;
export const BALL_MAX_SPEED = 840;

export const BRICK_ROWS = 7;
export const BRICK_COLS = 11;
export const BRICK_WIDTH = 92;
export const BRICK_HEIGHT = 30;
export const BRICK_GAP = 10;
export const BRICK_OFFSET_X = 88;
export const BRICK_OFFSET_Y = 96;

export const POWERUP_SPEED = 180;
export const LASER_SPEED = 860;

export const LEVEL_LAYOUTS = [
  [
    "01112111010",
    "10231320301",
    "11211121121",
    "20314130203",
    "11211121121",
    "10321230201",
    "01112111010",
  ],
  [
    "22210101222",
    "23021212032",
    "10133333101",
    "21210101212",
    "33021212033",
    "10111111101",
    "22230303222",
  ],
  [
    "44434343444",
    "43121212134",
    "41233333214",
    "43124442134",
    "41233333214",
    "43121212134",
    "44434343444",
  ],
];

export const BRICK_TYPES = {
  0: null,
  1: { hp: 1, score: 90, color: "#63d3ff", kind: "standard" },
  2: { hp: 2, score: 140, color: "#6effa6", kind: "standard" },
  3: { hp: 1, score: 180, color: "#ff6df0", kind: "prism" },
  4: { hp: 3, score: 240, color: "#ffd86b", kind: "standard" },
};

export const POWERUP_TYPES = {
  multiball: {
    id: "multiball",
    label: "Multi-ball",
    color: "#7fe8ff",
    glow: "rgba(127,232,255,0.45)",
  },
  laser: {
    id: "laser",
    label: "Laser",
    color: "#ff7d8f",
    glow: "rgba(255,125,143,0.45)",
  },
};

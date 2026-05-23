// mario-game/src/constants.ts

export const GRID_WIDTH = 10;
export const GRID_HEIGHT = 20;
export const BLOCK_SIZE = 20; // Pixels per block, IBM PC character blocks were 8x8, we'll scale for visibility

// Colors based on 1985 IBM PC Tetris (CGA/EGA palette simulation)
// These are approximations, actual colors might vary slightly depending on display settings
export const COLORS = {
    0: '#000000', // Empty (Black)
    1: '#00FFFF', // I-piece (Cyan)
    2: '#FFFF00', // O-piece (Yellow)
    3: '#800080', // T-piece (Purple)
    4: '#00FF00', // S-piece (Green)
    5: '#FF0000', // Z-piece (Red)
    6: '#0000FF', // J-piece (Blue)
    7: '#FFA500', // L-piece (Orange)
    8: '#808080', // Grey for landed blocks (optional, for distinction)
};

export const BOARD_COLOR = '#000000'; // Background color of the game board
export const BORDER_COLOR = '#CCCCCC'; // Border color of the game board

// Game timing and speed
export const INITIAL_DROP_DELAY = 1000; // Milliseconds per grid step for initial level
export const FAST_DROP_DELAY = 50; // Milliseconds for fast dropping

// Keyboard controls (Key codes or 'key' property values)
export const KEY_LEFT = 'ArrowLeft';
export const KEY_RIGHT = 'ArrowRight';
export const KEY_DOWN = 'ArrowDown';
export const KEY_ROTATE_CW = 'ArrowUp'; // Clockwise rotation
export const KEY_ROTATE_CCW = 'KeyZ'; // Counter-clockwise rotation (optional, for modern feel)
export const KEY_DROP = 'Space'; // Hard drop
export const KEY_PAUSE = 'KeyP';

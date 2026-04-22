// constants.js

// Grid dimensions
export const GRID_WIDTH = 28;
export const GRID_HEIGHT = 31;
export const TILE_SIZE = 16; // Default tile size in pixels, can be adjusted

// Tile types
export const TILE_TYPE = {
    WALL: 'wall',
    PATH: 'path',
    PELLET: 'pellet',
    POWER_PELLET: 'powerPellet',
    GHOST_SPAWN_AREA: 'ghostSpawnArea', // For ghost house logic
    GHOST_HOUSE_DOOR: 'ghostHouseDoor',
    EMPTY: 'empty' // For areas that are neither walls nor paths, like the ghost house interior
};

// Placeholder for the Level 1 maze layout.
// This 2D array will represent the grid, with each element being a TILE_TYPE.
// The actual maze structure for Level 1 needs to be defined here.
// For initial scaffolding, we'll use a basic grid filled with walls as a placeholder.
const placeholderGrid = Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(TILE_TYPE.WALL));
export const LEVEL_1_GRID = placeholderGrid; // Placeholder for actual maze layout

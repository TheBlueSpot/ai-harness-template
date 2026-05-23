// src/entities/Level.ts

export interface Tile {
  id: number; // Unique identifier for the tile type
  // Add other properties like collidable, spriteSheetX, spriteSheetY, etc.
}

export interface LevelData {
  width: number;
  height: number;
  tilemap: number[][]; // 2D array of tile IDs
  entities: Array<{ 
    type: string; // e.g., 'enemy', 'player', 'item'
    x: number;
    y: number;
    // other properties specific to the entity type
  }>;
}

export class Level {
  width: number;
  height: number;
  tilemap: number[][];
  entities: Array<{ 
    type: string;
    x: number;
    y: number;
    // ... other properties
  }>;

  constructor(data: LevelData) {
    this.width = data.width;
    this.height = data.height;
    this.tilemap = data.tilemap;
    this.entities = data.entities;
  }

  getTile(x: number, y: number): number | null {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.tilemap[y][x];
    }
    return null;
  }

  // Method to load level from a source (e.g., JSON file)
  static async load(path: string): Promise<Level> {
    // In a real Bun/Solid app, you might use fetch or fs.readFile
    // For this example, we'll simulate loading a JSON
    // Replace with actual file reading in a Bun environment
    const response = await fetch(path); // Placeholder for file loading
    const data: LevelData = await response.json();
    return new Level(data);
  }
}

// Placeholder for actual tile definitions (e.g., from a config file)
export const TILES: Record<number, Tile> = {
  0: { id: 0 /*, collidable: false */ }, // Example: Air
  1: { id: 1 /*, collidable: true */ },  // Example: Ground
  // ... more tiles
};

// Helper to get tile properties by ID
export function getTileProperties(tileId: number): Tile | undefined {
  return TILES[tileId];
}

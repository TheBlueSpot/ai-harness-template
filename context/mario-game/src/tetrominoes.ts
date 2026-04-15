// mario-game/src/tetrominoes.ts

import { COLORS } from './constants';

export interface Tetromino {
    shape: number[][];
    colorId: number;
    rotations: number[][][]; // Array of 2D arrays for each rotation state
}

// Each Tetromino definition includes its initial shape, color, and all rotation states.
// The rotation data is crucial for implementing the correct rotation logic.
// For simplicity, we define all rotations upfront. A more advanced system might calculate them.

// I-Tetromino (Cyan)
export const I_TETROMINO: Tetromino = {
    shape: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
    ],
    colorId: 1,
    rotations: [
        // 0 degrees
        [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
        ],
        // 90 degrees
        [
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
        ],
    ]
};

// O-Tetromino (Yellow) - No rotation
export const O_TETROMINO: Tetromino = {
    shape: [
        [2, 2],
        [2, 2],
    ],
    colorId: 2,
    rotations: [
        // 0 degrees (only one state as it doesn't change)
        [
            [2, 2],
            [2, 2],
        ],
    ]
};

// T-Tetromino (Purple)
export const T_TETROMINO: Tetromino = {
    shape: [
        [0, 3, 0],
        [3, 3, 3],
        [0, 0, 0],
    ],
    colorId: 3,
    rotations: [
        // 0 degrees
        [
            [0, 3, 0],
            [3, 3, 3],
            [0, 0, 0],
        ],
        // 90 degrees (clockwise)
        [
            [0, 3, 0],
            [0, 3, 3],
            [0, 3, 0],
        ],
        // 180 degrees
        [
            [0, 0, 0],
            [3, 3, 3],
            [0, 3, 0],
        ],
        // 270 degrees
        [
            [0, 3, 0],
            [3, 3, 0],
            [0, 3, 0],
        ],
    ]
};

// S-Tetromino (Green)
export const S_TETROMINO: Tetromino = {
    shape: [
        [0, 4, 4],
        [4, 4, 0],
        [0, 0, 0],
    ],
    colorId: 4,
    rotations: [
        // 0 degrees
        [
            [0, 4, 4],
            [4, 4, 0],
            [0, 0, 0],
        ],
        // 90 degrees
        [
            [0, 4, 0],
            [0, 4, 4],
            [0, 0, 4],
        ],
    ]
};

// Z-Tetromino (Red)
export const Z_TETROMINO: Tetromino = {
    shape: [
        [5, 5, 0],
        [0, 5, 5],
        [0, 0, 0],
    ],
    colorId: 5,
    rotations: [
        // 0 degrees
        [
            [5, 5, 0],
            [0, 5, 5],
            [0, 0, 0],
        ],
        // 90 degrees
        [
            [0, 0, 5],
            [0, 5, 5],
            [0, 5, 0],
        ],
    ]
};

// J-Tetromino (Blue)
export const J_TETROMINO: Tetromino = {
    shape: [
        [6, 0, 0],
        [6, 6, 6],
        [0, 0, 0],
    ],
    colorId: 6,
    rotations: [
        // 0 degrees
        [
            [6, 0, 0],
            [6, 6, 6],
            [0, 0, 0],
        ],
        // 90 degrees
        [
            [0, 6, 6],
            [0, 6, 0],
            [0, 6, 0],
        ],
        // 180 degrees
        [
            [0, 0, 0],
            [6, 6, 6],
            [0, 0, 6],
        ],
        // 270 degrees
        [
            [0, 6, 0],
            [0, 6, 0],
            [6, 6, 0],
        ],
    ]
};

// L-Tetromino (Orange)
export const L_TETROMINO: Tetromino = {
    shape: [
        [0, 0, 7],
        [7, 7, 7],
        [0, 0, 0],
    ],
    colorId: 7,
    rotations: [
        // 0 degrees
        [
            [0, 0, 7],
            [7, 7, 7],
            [0, 0, 0],
        ],
        // 90 degrees
        [
            [0, 7, 0],
            [0, 7, 0],
            [0, 7, 7],
        ],
        // 180 degrees
        [
            [0, 0, 0],
            [7, 7, 7],
            [7, 0, 0],
        ],
        // 270 degrees
        [
            [7, 7, 0],
            [0, 7, 0],
            [0, 7, 0],
        ],
    ]
};

export const ALL_TETROMINOES = [
    I_TETROMINO,
    O_TETROMINO,
    T_TETROMINO,
    S_TETROMINO,
    Z_TETROMINO,
    J_TETROMINO,
    L_TETROMINO,
];

/**
 * Returns a deep copy of a Tetromino shape array.
 * Useful for manipulating a piece's shape without affecting the original definition.
 * @param {number[][]} shape - The 2D array representing the Tetromino's shape.
 * @returns {number[][]} - A deep copy of the shape.
 */
export function deepCopyShape(shape: number[][]): number[][] {
    return shape.map(row => [...row]);
}

/**
 * Get a random Tetromino from the available set.
 * @returns {Tetromino} A new Tetromino instance.
 */
export function getRandomTetromino(): Tetromino {
    const randomIndex = Math.floor(Math.random() * ALL_TETROMINOES.length);
    const original = ALL_TETROMINOES[randomIndex];
    // Create a deep copy of the tetromino to ensure its shape and rotation state
    // can be modified without affecting the global definitions.
    return {
        ...original,
        shape: deepCopyShape(original.shape),
        rotations: original.rotations.map(deepCopyShape),
        // Add currentRotationIndex to track the current rotation state
        currentRotationIndex: 0 // Start with the first rotation state
    } as Tetromino & { currentRotationIndex: number };
}

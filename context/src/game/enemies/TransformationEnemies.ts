// Base enemy class (assuming it exists or will be created)
abstract class BaseEnemy {
    name: string;
    health: number;
    // ... other common properties
    constructor(name: string, health: number) {
        this.name = name;
        this.health = health;
    }
    abstract attack(): void;
    abstract move(): void;
}

export class Scorpion extends BaseEnemy {
    constructor() {
        super("Scorpion", 100); // Example health
    }
    attack(): void {
        console.log(`${this.name} attacks with its tail!`);
    }
    move(): void {
        console.log(`${this.name} scurries across the screen.`);
    }
}

export class Bosconian extends BaseEnemy {
    constructor() {
        super("Bosconian", 120);
    }
    attack(): void {
        console.log(`${this.name} fires a plasma bolt!`);
    }
    move(): void {
        console.log(`${this.name} hovers menacingly.`);
    }
}

export class Galaxian extends BaseEnemy {
    constructor() {
        super("Galaxian", 90);
    }
    attack(): void {
        console.log(`${this.name} shoots a rapid laser!`);
    }
    move(): void {
        console.log(`${this.name} darts and weaves.`);
    }
}

export class Dragonfly extends BaseEnemy {
    constructor() {
        super("Dragonfly", 110);
    }
    attack(): void {
        console.log(`${this.name} unleashes a sonic screech!`);
    }
    move(): void {
        console.log(`${this.name} flies in complex patterns.`);
    }
}

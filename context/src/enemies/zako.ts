import { Enemy } from './enemy';

export class Zako extends Enemy {
  constructor() {
    // Zako (Blue Bee) - assumed health points
    super(1);
  }

  diveAttack(): void {
    console.log('Zako diving!');
    // Implement Zako's specific dive pattern here
  }
}

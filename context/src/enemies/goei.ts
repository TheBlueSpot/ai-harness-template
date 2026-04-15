import { Enemy } from './enemy';

export class Goei extends Enemy {
  constructor() {
    // Goei (Red Butterfly) - assumed health points
    super(2);
  }

  diveAttack(): void {
    console.log('Goei diving with a twist!');
    // Implement Goei's specific dive pattern here
  }
}

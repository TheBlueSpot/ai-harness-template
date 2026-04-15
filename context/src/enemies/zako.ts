import { Enemy } from './enemy';

export class Zako extends Enemy {
  constructor() {
    // Zako enemies might have lower health
    super(10);
  }

  diveAttack(): void {
    console.log('Zako performing dive attack!');
    // Implement Zako's dive attack logic here
  }

  // Implement Zako's movement pattern and AI
  move(): void {
    console.log('Zako moving...');
    // Add Zako-specific movement logic
  }

  updateAI(): void {
    console.log('Zako updating AI...');
    // Add Zako-specific AI logic
  }
}

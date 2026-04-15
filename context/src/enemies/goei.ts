import { Enemy } from './enemy';

export class Goei extends Enemy {
  constructor() {
    // Goei enemies might have medium health
    super(25);
  }

  diveAttack(): void {
    console.log('Goei performing dive attack!');
    // Implement Goei's dive attack logic here
  }

  // Implement Goei's movement pattern and AI
  move(): void {
    console.log('Goei moving...');
    // Add Goei-specific movement logic
  }

  updateAI(): void {
    console.log('Goei updating AI...');
    // Add Goei-specific AI logic
  }
}

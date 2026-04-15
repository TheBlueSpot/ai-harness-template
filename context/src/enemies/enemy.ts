export abstract class Enemy {
  protected healthPoints: number;
  public abstract diveAttack(): void;

  constructor(healthPoints: number) {
    this.healthPoints = healthPoints;
  }

  getHealth(): number {
    return this.healthPoints;
  }
}

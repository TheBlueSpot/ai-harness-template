const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class AnimationState {
  constructor(spriteMap = {}) {
    this.spriteMap = spriteMap;
    this.reset();
  }
  reset() {
    this.time = 0;
    this.frame = 0;
    this.pose = "idle";
    this.hold = 0;
    this.speed = 0;
  }
  update(player = {}, input = {}, contact = {}, dt = 1 / 60) {
    this.time += dt;
    const vx = player.velocity?.x ?? player.vx ?? 0;
    const vy = player.velocity?.y ?? player.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    this.speed = speed;
    const grounded = !!contact.grounded;
    const normal = contact.normal || player.normal || { x: 0, y: -1 };
    const tangent = contact.tangent || player.tangent || { x: 1, y: 0 };
    const verticalness = Math.abs(normal.y);
    const ceilingish = normal.y > 0.6;
    const wallish = Math.abs(normal.x) > 0.7;
    const movingFast = speed > 220;
    const win = player.state === "WIN";
    const lose = player.state === "LOSE";
    let pose = "idle";
    if (win) pose = "win";
    else if (lose) pose = "lose";
    else if (!grounded) pose = wallish ? "wallRun" : ceilingish ? "ceilingRun" : "airborne";
    else if (ceilingish) pose = "ceilingRun";
    else if (wallish) pose = "wallRun";
    else if (movingFast || Math.abs(vx) > 160 || Math.abs(vx * (tangent?.x ?? 1)) > 0) pose = input.dash ? "sprint" : "run";
    this.pose = pose;
    const cycle = pose === "idle" ? 0.5 : pose === "sprint" ? 0.08 : pose === "run" ? 0.12 : 0.2;
    this.frame = Math.floor(this.time / cycle) % 6;
    this.poseMeta = { pose, grounded, normal, tangent, speed, verticalness };
  }
  getFrame() {
    return { pose: this.pose, frame: this.frame, speed: this.speed, sprite: this.spriteMap?.[this.pose] ?? null };
  }
  getPose() {
    return this.poseMeta || { pose: this.pose };
  }
}

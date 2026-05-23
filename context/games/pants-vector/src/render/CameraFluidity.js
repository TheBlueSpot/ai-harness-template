const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class CameraFluidity {
  constructor({ width = 1280, height = 720 } = {}) {
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.leadX = 0;
  }
  update(target = {}, velocity = {}, dt = 1 / 60) {
    const tx = target.x ?? target.position?.x ?? 0;
    const ty = target.y ?? target.position?.y ?? 0;
    const vx = velocity.x ?? velocity.vx ?? target.velocity?.x ?? 0;
    const lead = clamp(vx * 0.18, -120, 120);
    this.leadX += (lead - this.leadX) * clamp(dt * 8, 0, 1);
    const targetX = tx + this.leadX - this.width * 0.5;
    const targetY = ty - this.height * 0.56;
    this.x += (targetX - this.x) * clamp(dt * 5, 0, 1);
    this.y += (targetY - this.y) * clamp(dt * 4, 0, 1);
  }
  worldToScreen(point) {
    return {
      x: (point.x - this.x) * this.zoom,
      y: (point.y - this.y) * this.zoom
    };
  }
  resize(width, height) {
    this.width = width;
    this.height = height;
  }
  getTransform() {
    return { x: this.x, y: this.y, zoom: this.zoom, width: this.width, height: this.height };
  }
}

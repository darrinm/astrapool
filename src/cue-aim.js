const HOLD_MS = 400, HOLD_RADIUS = 6, EXIT_DISTANCE = 20;
const FINE_RATE = Math.PI / 1800; // 0.1 degree per CSS pixel at every angle and power.

export class CueAim {
  constructor(pointer, { maxPull = 24, now = 0 } = {}) {
    this.maxPull = maxPull;
    this.dir = { x: 1, y: 0 };
    this.pull = 0;
    this.fine = false;
    this.offset = { x: 0, y: 0 };
    this.pointer = { x: pointer.clientX, y: pointer.clientY };
    this.anchor = { ...this.pointer, time: now };
  }

  update(pointer, rawPull, now) {
    const point = { x: pointer.clientX, y: pointer.clientY };
    if (this.fine) {
      const dx = point.x - this.fineStart.x, dy = point.y - this.fineStart.y;
      const { axis } = this.fineStart;
      const across = dx * axis.y - dy * axis.x;
      const along = dx * axis.x + dy * axis.y;
      const angle = this.fineStart.angle + across * FINE_RATE;
      this.dir = { x: Math.cos(angle), y: Math.sin(angle) };
      if (Math.abs(along) >= EXIT_DISTANCE) {
        // Resume direct dragging from the current shot, not the old pointer
        // position. The exit event itself changes neither direction nor power.
        this.offset = { x: -this.dir.x * this.pull - rawPull.x, y: -this.dir.y * this.pull - rawPull.y };
        this.fine = false;
        this.anchor = { ...point, time: now };
      }
    } else {
      const x = rawPull.x + this.offset.x, y = rawPull.y + this.offset.y;
      const length = Math.hypot(x, y);
      if (length) this.dir = { x: -x / length, y: -y / length };
      this.pull = Math.min(length, this.maxPull);
      if (Math.hypot(point.x - this.anchor.x, point.y - this.anchor.y) > HOLD_RADIUS) {
        this.anchor = { ...point, time: now };
      }
    }
    this.pointer = point;
  }

  tick(now, pullAxis = { x: 0, y: 1 }) {
    if (this.fine || this.pull < 0.3 || now - this.anchor.time < HOLD_MS) return false;
    this.fine = true;
    const length = Math.hypot(pullAxis.x, pullAxis.y);
    const axis = length ? { x: pullAxis.x / length, y: pullAxis.y / length } : { x: 0, y: 1 };
    this.fineStart = { ...this.pointer, angle: Math.atan2(this.dir.y, this.dir.x), axis };
    return true;
  }
}

import { Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { targets } from './eight-ball.js';

// Flat, quiet marks on the felt; never part of the ball's spin or hit testing.
export class TargetRings extends Group {
  constructor({ radius, feltZ, numberOf }) {
    super();
    this.name = 'legal-target-rings';
    this.feltZ = feltZ;
    this.numberOf = numberOf;
    this.ringGeometry = new RingGeometry(radius * 1.22, radius * 1.31, 48);
    this.ringMaterial = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false });
    for (let number = 1; number <= 15; number++) {
      const ring = new Mesh(this.ringGeometry, this.ringMaterial);
      ring.name = `target-ring-${number}`;
      ring.raycast = () => {};
      ring.visible = false;
      this.add(ring);
    }
    this.visible = false;
  }

  update(balls, match, { aiming, free = false }) {
    this.visible = aiming && (free || match.winner === null);
    if (!this.visible) return;
    // An 8 on the break is allowed and respotted. Free Play allows any object ball.
    const legal = free || match.breaking ? null : targets(match);
    for (const ring of this.children) ring.visible = false;
    for (const ball of balls) {
      const number = this.numberOf(ball), ring = this.children[number - 1];
      if (!ring || (legal && !legal.includes(number)) || !ball.mesh.visible ||
          !ball.body.isEnabled() || ball.mesh.position.z <= this.feltZ) continue;
      ring.visible = true;
      ring.position.set(ball.mesh.position.x, ball.mesh.position.y, this.feltZ + 0.04);
    }
  }

  dispose() {
    this.removeFromParent();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
  }
}

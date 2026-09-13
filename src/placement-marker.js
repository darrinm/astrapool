import { Group, Mesh, MeshBasicMaterial, RingGeometry, Shape, ShapeGeometry, PlaneGeometry } from 'three';

// Four directional handles distinguish placement from the ordinary aiming ring.
// All marks lie on the felt and stay independent of the ball's surface and spin.
export class PlacementMarker extends Group {
  constructor(radius, feltZ) {
    super(); this.name = 'cue-placement-marker'; this.feltZ = feltZ;
    this.material = new MeshBasicMaterial({ color: '#b6f2d2', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false });
    this.ring = new RingGeometry(radius * 1.9, radius * 2.04, 48);
    const shape = new Shape();
    shape.moveTo(-0.38, 2.6); shape.lineTo(0.38, 2.6); shape.lineTo(0.38, 3.35);
    shape.lineTo(0.85, 3.35); shape.lineTo(0, 4.2); shape.lineTo(-0.85, 3.35); shape.lineTo(-0.38, 3.35); shape.closePath();
    this.arrow = new ShapeGeometry(shape); this.arrow.scale(radius, radius, 1);
    this.cross = new PlaneGeometry(radius * 1.9, radius * 0.24);
    this.handles = new Group(); this.add(this.handles);
    this.add(new Mesh(this.ring, this.material));
    for (let i = 0; i < 4; i++) {
      const arrow = new Mesh(this.arrow, this.material); arrow.rotation.z = i * Math.PI / 2; this.handles.add(arrow);
    }
    this.invalid = new Group(); this.add(this.invalid);
    for (const angle of [-Math.PI / 4, Math.PI / 4]) {
      const stroke = new Mesh(this.cross, this.material); stroke.rotation.z = angle; this.invalid.add(stroke);
    }
    this.traverse(o => { o.raycast = () => {}; o.renderOrder = 5; });
    this.visible = false;
  }
  update(position, { visible, valid = true }) {
    this.visible = visible;
    if (!visible) return;
    this.position.set(position.x, position.y, this.feltZ + 0.06);
    this.material.color.set(valid ? '#b6f2d2' : '#ff9a87');
    this.handles.visible = valid; this.invalid.visible = !valid;
  }
  dispose() {
    this.removeFromParent(); this.ring.dispose(); this.arrow.dispose(); this.cross.dispose(); this.material.dispose();
  }
}

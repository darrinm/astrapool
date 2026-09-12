// Bakes a numbered pool-ball cap into the bottom pole of a head's equirectangular texture.
// Solids 1-8 get a colored cap with a white numbered disc; stripes 9-15 get a white cap with a colored ring.
import * as THREE from 'three';

export const BALL_COLORS = { 1: '#f2c400', 2: '#1b4fd8', 3: '#d62828', 4: '#6a2c91', 5: '#f58220', 6: '#1e8f4e', 7: '#7b1f2e', 8: '#111111' };
export const CAP_DEG = 38;
const DISC_DEG = 19, RING_IN_DEG = 22;

// Which texture a ball should be showing. `capped` is a head with its number baked
// on and only exists once that head has loaded; falling back to the generated ball
// is what keeps a build with no head textures from showing untextured spheres.
export function chooseBallMap(entry, style) {
  return style === 'balls' ? entry.ball : entry.capped ?? entry.ball;
}

// The head texture is whichever map the loader put on the material, which is any
// map the game did not generate itself. Testing only that a map has pixels is not
// enough: the generated ball has pixels too, and baking a cap onto that stores a
// capped ball as if it were the head, after which nothing repairs it.
export function loadedHead(map, entry) {
  return map && map !== entry.ball && map !== entry.capped && map.image?.width ? map : null;
}

export function capCanvas(number, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), cx = size / 2, r = size / 2;
  const color = BALL_COLORS[((number - 1) % 8) + 1], stripe = number > 8;
  ctx.fillStyle = stripe ? '#f4f1ea' : color; ctx.fillRect(0, 0, size, size);
  if (stripe) {   // colored ring between the number disc and the cap edge
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cx, r * 0.98, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.arc(cx, cx, r * (RING_IN_DEG / CAP_DEG), 0, Math.PI * 2); ctx.fill();
  }
  const dr = r * (DISC_DEG / CAP_DEG);
  ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.arc(cx, cx, dr, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = size * 0.012; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx, cx, dr, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.font = `bold ${Math.round(dr * 1.25)}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(number), cx, cx + dr * 0.06);
  return c;
}

// Returns a new texture: the source image with the cap projected onto the bottom pole (azimuthal projection,
// so the disc and the digit stay round and upright on the sphere).
export function bakeCap(image, number) {
  const W = image.width, H = image.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
  const capRows = Math.ceil((CAP_DEG / 180) * H) + 1;
  const y0 = H - capRows;
  const img = ctx.getImageData(0, y0, W, capRows), d = img.data;
  const cap = capCanvas(number), cs = cap.width, cd = cap.getContext('2d').getImageData(0, 0, cs, cs).data;
  const capRad = (CAP_DEG * Math.PI) / 180;
  for (let row = 0; row < capRows; row++) {
    const v = (y0 + row + 0.5) / H, lat = (0.5 - v) * Math.PI, fromPole = Math.PI / 2 + lat;   // angle from the bottom pole
    if (fromPole > capRad) continue;
    const rr = fromPole / capRad;                                                           // 0 at the pole, 1 at the cap edge
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W - 0.5) * Math.PI * 2;
      const px = Math.min(cs - 1, Math.max(0, Math.round((0.5 + 0.5 * rr * Math.cos(lon)) * (cs - 1))));
      const py = Math.min(cs - 1, Math.max(0, Math.round((0.5 + 0.5 * rr * Math.sin(lon)) * (cs - 1))));
      const si = (py * cs + px) * 4, di = (row * W + x) * 4;
      // soft edge over the last 6% so the cap blends into the skin instead of a hard cut
      const a = rr > 0.94 ? (1 - rr) / 0.06 : 1;
      d[di] = d[di] * (1 - a) + cd[si] * a; d[di + 1] = d[di + 1] * (1 - a) + cd[si + 1] * a; d[di + 2] = d[di + 2] * (1 - a) + cd[si + 2] * a;
    }
  }
  ctx.putImageData(img, 0, y0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// A full authentic ball texture (equirectangular): solids are the colour with a white numbered disc at both poles;
// stripes are white with a coloured band around the equator and numbered discs at both poles; 0 is the cue ball.
export function authenticBall(number, W = 1024, H = 512) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const ivory = '#f6f1e6';
  if (number === 0) { ctx.fillStyle = ivory; ctx.fillRect(0, 0, W, H); }
  else {
    const color = BALL_COLORS[((number - 1) % 8) + 1], stripe = number > 8;
    ctx.fillStyle = stripe ? ivory : color; ctx.fillRect(0, 0, W, H);
    if (stripe) {   // band between +-38 degrees of latitude
      const half = (38 / 180) * H; ctx.fillStyle = color; ctx.fillRect(0, H / 2 - half, W, half * 2);
    }
    // subtle wear: faint speckle so the surface isn't flat paint
    for (let i = 0; i < 1500; i++) { ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.04})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  if (number === 0) return tex;
  // numbered discs at both poles, drawn with the same azimuthal projection as the caps
  const bottom = bakeCap(c, number);
  // top pole: flip the image, bake, flip back
  const flip = document.createElement('canvas'); flip.width = W; flip.height = H;
  const fctx = flip.getContext('2d'); fctx.translate(0, H); fctx.scale(1, -1); fctx.drawImage(bottom.image, 0, 0);
  const both = bakeCap(flip, number);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const octx = out.getContext('2d'); octx.translate(0, H); octx.scale(1, -1); octx.drawImage(both.image, 0, 0);
  const t = new THREE.CanvasTexture(out); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

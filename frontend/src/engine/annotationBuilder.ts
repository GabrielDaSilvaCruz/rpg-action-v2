import * as THREE from 'three';
import { MapAnnotation, TILE_SIZE } from '../types/vtt';

export interface BuiltAnnotationVisual {
  group: THREE.Group;
  crystalMesh?: THREE.Mesh;
  ringMesh?: THREE.Mesh;
}

function createTextBillboard(
  label: string,
  colorHex: string,
  gmOnly: boolean,
  maxAnisotropy: number
): THREE.Sprite | null {
  const cleanText = label.trim();
  if (!cleanText) return null;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const displayText = gmOnly ? `OCULTO · ${cleanText}` : cleanText;
  ctx.font = '600 32px "Plus Jakarta Sans", sans-serif';
  const measured = ctx.measureText(displayText);
  const boxW = Math.min(490, Math.max(180, measured.width + 56));
  const boxH = 74;
  const x = (512 - boxW) / 2;
  const y = (128 - boxH) / 2;

  // Solid dark obsidian plaque
  ctx.fillStyle = 'rgba(13, 17, 24, 0.94)';
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 14);
  ctx.fill();

  // Subtle colored border
  ctx.strokeStyle = colorHex || '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 14);
  ctx.stroke();

  // Label text
  ctx.fillStyle = gmOnly ? '#fcd34d' : '#f5f5f4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayText, 256, 65, boxW - 28);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 0.6, 1);
  return sprite;
}

export function createAnnotationVisual(
  ann: MapAnnotation,
  maxAnisotropy: number,
  isSelected: boolean
): BuiltAnnotationVisual {
  const group = new THREE.Group();
  const color = new THREE.Color(ann.color || '#f59e0b');
  const r = Math.max(0.5, ann.radius || 1) * TILE_SIZE;

  const areaMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: isSelected ? 0.28 : 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const edgeMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: isSelected ? 0.95 : 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  let crystalMesh: THREE.Mesh | undefined;
  let ringMesh: THREE.Mesh | undefined;
  let labelY = 1.05;

  if (ann.kind === 'marker') {
    // Ground ring
    const ringGeo = new THREE.RingGeometry(0.24, 0.34, 24);
    ringGeo.rotateX(-Math.PI / 2);
    ringMesh = new THREE.Mesh(ringGeo, edgeMat);
    ringMesh.position.y = 0.03;
    group.add(ringMesh);

    // Vertical thin beacon rod
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8),
      new THREE.MeshStandardMaterial({
        color: 0x333842,
        metalness: 0.8,
        roughness: 0.3,
      })
    );
    rod.position.y = 0.31;
    group.add(rod);

    // Floating glowing crystal pin
    crystalMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: isSelected ? 1.5 : 0.95,
        roughness: 0.18,
        metalness: 0.3,
      })
    );
    crystalMesh.position.y = 0.82;
    group.add(crystalMesh);
    labelY = 1.32;
  } else if (ann.kind === 'circle') {
    const discGeo = new THREE.CircleGeometry(r, 40);
    discGeo.rotateX(-Math.PI / 2);
    const disc = new THREE.Mesh(discGeo, areaMat);
    disc.position.y = 0.03;

    const ringGeo = new THREE.RingGeometry(Math.max(0.1, r - 0.07), r, 40);
    ringGeo.rotateX(-Math.PI / 2);
    ringMesh = new THREE.Mesh(ringGeo, edgeMat);
    ringMesh.position.y = 0.035;

    group.add(disc, ringMesh);
    labelY = 0.72;
  } else if (ann.kind === 'square') {
    const size = r;
    const planeGeo = new THREE.PlaneGeometry(size, size);
    planeGeo.rotateX(-Math.PI / 2);
    const plane = new THREE.Mesh(planeGeo, areaMat);
    plane.position.y = 0.03;
    group.add(plane);

    const thickness = 0.07;
    const half = size / 2;
    const barNS = new THREE.PlaneGeometry(size, thickness);
    barNS.rotateX(-Math.PI / 2);
    const barEW = new THREE.PlaneGeometry(thickness, size);
    barEW.rotateX(-Math.PI / 2);

    const n = new THREE.Mesh(barNS, edgeMat);
    n.position.set(0, 0.035, -half + thickness / 2);
    const s = new THREE.Mesh(barNS, edgeMat);
    s.position.set(0, 0.035, half - thickness / 2);
    const w = new THREE.Mesh(barEW, edgeMat);
    w.position.set(-half + thickness / 2, 0.035, 0);
    const e = new THREE.Mesh(barEW, edgeMat);
    e.position.set(half - thickness / 2, 0.035, 0);

    group.add(n, s, w, e);
    labelY = 0.72;
  } else if (ann.kind === 'cone') {
    const sectorAngle = Math.PI / 3; // 60-degree D&D cone
    const coneGeo = new THREE.CircleGeometry(r, 24, -sectorAngle / 2 + Math.PI / 2, sectorAngle);
    coneGeo.rotateX(-Math.PI / 2);
    const coneMesh = new THREE.Mesh(coneGeo, areaMat);
    coneMesh.position.y = 0.03;

    const arcGeo = new THREE.RingGeometry(
      Math.max(0.1, r - 0.07),
      r,
      24,
      1,
      -sectorAngle / 2 + Math.PI / 2,
      sectorAngle
    );
    arcGeo.rotateX(-Math.PI / 2);
    const arcMesh = new THREE.Mesh(arcGeo, edgeMat);
    arcMesh.position.y = 0.035;

    // Side edges of the cone
    const sideGeo = new THREE.PlaneGeometry(0.06, r);
    sideGeo.rotateX(-Math.PI / 2);
    const sideL = new THREE.Mesh(sideGeo, edgeMat);
    sideL.rotation.y = -sectorAngle / 2;
    sideL.position.set(Math.sin(-sectorAngle / 2) * (r / 2), 0.035, Math.cos(-sectorAngle / 2) * (r / 2));
    const sideR = new THREE.Mesh(sideGeo, edgeMat);
    sideR.rotation.y = sectorAngle / 2;
    sideR.position.set(Math.sin(sectorAngle / 2) * (r / 2), 0.035, Math.cos(sectorAngle / 2) * (r / 2));

    group.add(coneMesh, arcMesh, sideL, sideR);
    labelY = 0.72;
  } else if (ann.kind === 'line') {
    const beamLen = r;
    const beamWidth = 0.56;
    const beamGeo = new THREE.PlaneGeometry(beamWidth, beamLen);
    beamGeo.rotateX(-Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, areaMat);
    beam.position.set(0, 0.03, beamLen / 2);

    const borderGeo = new THREE.PlaneGeometry(0.07, beamLen);
    borderGeo.rotateX(-Math.PI / 2);
    const leftB = new THREE.Mesh(borderGeo, edgeMat);
    leftB.position.set(-beamWidth / 2, 0.035, beamLen / 2);
    const rightB = new THREE.Mesh(borderGeo, edgeMat);
    rightB.position.set(beamWidth / 2, 0.035, beamLen / 2);

    group.add(beam, leftB, rightB);
    labelY = 0.72;
  }

  const billboard = createTextBillboard(ann.label, ann.color, ann.gmOnly, maxAnisotropy);
  if (billboard) {
    billboard.position.y = labelY;
    group.add(billboard);
  }

  group.rotation.y = ann.rotationY || 0;
  return { group, crystalMesh, ringMesh };
}

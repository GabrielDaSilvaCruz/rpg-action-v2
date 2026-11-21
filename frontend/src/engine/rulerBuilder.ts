import * as THREE from 'three';
import { MeasureRule } from '../types/vtt';
import { calculateGridDistance, getTraversedGridCells } from '../utils/distanceRules';

const _startVec = new THREE.Vector3();
const _endVec = new THREE.Vector3();
const _midVec = new THREE.Vector3();
const _dirVec = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

export interface RulerUpdateParams {
  startX: number;
  startZ: number;
  startY: number;
  endX: number;
  endZ: number;
  endY: number;
  startElev: number;
  endElev: number;
  rule: MeasureRule;
  color: string;
  ownerLabel?: string;
  getSurfaceY: (gx: number, gz: number) => number;
}

export interface RulerVisualHandle {
  group: THREE.Group;
  update: (params: RulerUpdateParams) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

function drawBadgeCanvas(
  canvas: HTMLCanvasElement,
  mainText: string,
  subText: string,
  accentColor: string
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Pill background with crisp dark backing and colored accent border
  const padX = 18;
  const padY = 14;
  const r = 18;
  const bw = w - padX * 2;
  const bh = h - padY * 2;

  ctx.fillStyle = 'rgba(13, 17, 24, 0.94)';
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(padX, padY, bw, bh, r);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (subText) {
    ctx.font = '700 32px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(mainText, w / 2, h / 2 - 16);

    ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(subText, w / 2, h / 2 + 20);
  } else {
    ctx.font = '700 34px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(mainText, w / 2, h / 2);
  }
}

export function createRulerVisual(
  initialColor = '#22d3ee',
  maxAnisotropy = 4,
  showTraversedCells = true
): RulerVisualHandle {
  const group = new THREE.Group();
  group.visible = false;

  const primaryMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(initialColor),
    emissive: new THREE.Color(initialColor),
    emissiveIntensity: 0.95,
    roughness: 0.25,
    metalness: 0.2,
  });

  const ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(initialColor),
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const cellHighlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(initialColor),
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const groundLineMat = new THREE.LineDashedMaterial({
    color: new THREE.Color(initialColor),
    dashSize: 0.22,
    gapSize: 0.12,
    transparent: true,
    opacity: 0.88,
  });

  const ringGeo = new THREE.RingGeometry(0.24, 0.34, 24);
  ringGeo.rotateX(-Math.PI / 2);

  const postGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.34, 8);
  const gemGeo = new THREE.OctahedronGeometry(0.085, 0);
  const beamGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 10);

  const startRing = new THREE.Mesh(ringGeo, ringMat);
  const endRing = new THREE.Mesh(ringGeo, ringMat);
  const startPost = new THREE.Mesh(postGeo, primaryMat);
  const endPost = new THREE.Mesh(postGeo, primaryMat);
  const startGem = new THREE.Mesh(gemGeo, primaryMat);
  const endGem = new THREE.Mesh(gemGeo, primaryMat);
  const beamMesh = new THREE.Mesh(beamGeo, primaryMat);

  const groundLineGeo = new THREE.BufferGeometry();
  const groundLine = new THREE.Line(groundLineGeo, groundLineMat);

  group.add(
    startRing,
    endRing,
    startPost,
    endPost,
    startGem,
    endGem,
    beamMesh,
    groundLine
  );

  // Pool of square tile border highlights along the path
  const cellGeo = new THREE.RingGeometry(0.36, 0.45, 4);
  cellGeo.rotateZ(Math.PI / 4);
  cellGeo.rotateX(-Math.PI / 2);
  const cellPool: THREE.Mesh[] = [];
  if (showTraversedCells) {
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(cellGeo, cellHighlightMat);
      m.visible = false;
      group.add(m);
      cellPool.push(m);
    }
  }

  // Crisp floating 3D distance badge sprite
  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = 512;
  badgeCanvas.height = 128;
  const badgeTex = new THREE.CanvasTexture(badgeCanvas);
  badgeTex.colorSpace = THREE.SRGBColorSpace;
  badgeTex.anisotropy = maxAnisotropy;
  const badgeMat = new THREE.SpriteMaterial({
    map: badgeTex,
    transparent: true,
    depthTest: false,
  });
  const badgeSprite = new THREE.Sprite(badgeMat);
  badgeSprite.renderOrder = 20;
  badgeSprite.scale.set(2.4, 0.6, 1);
  group.add(badgeSprite);

  let lastBadgeSig = '';
  const groundSamplePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    groundSamplePts.push(new THREE.Vector3());
  }

  const update = (params: RulerUpdateParams) => {
    const {
      startX,
      startZ,
      startY,
      endX,
      endZ,
      endY,
      startElev,
      endElev,
      rule,
      color,
      ownerLabel,
      getSurfaceY,
    } = params;

    primaryMat.color.set(color);
    primaryMat.emissive.set(color);
    ringMat.color.set(color);
    cellHighlightMat.color.set(color);
    groundLineMat.color.set(color);

    // Endpoint anchors
    startRing.position.set(startX, startY + 0.025, startZ);
    endRing.position.set(endX, endY + 0.025, endZ);

    startPost.position.set(startX, startY + 0.17, startZ);
    endPost.position.set(endX, endY + 0.17, endZ);

    startGem.position.set(startX, startY + 0.36, startZ);
    endGem.position.set(endX, endY + 0.36, endZ);

    // Elevated beam connecting start and end pins
    _startVec.set(startX, startY + 0.34, startZ);
    _endVec.set(endX, endY + 0.34, endZ);
    const beamLen = _startVec.distanceTo(_endVec);

    if (beamLen > 0.02) {
      _midVec.addVectors(_startVec, _endVec).multiplyScalar(0.5);
      _dirVec.subVectors(_endVec, _startVec).normalize();
      _quat.setFromUnitVectors(_upVec, _dirVec);
      beamMesh.position.copy(_midVec);
      beamMesh.quaternion.copy(_quat);
      beamMesh.scale.set(1, beamLen, 1);
      beamMesh.visible = true;
    } else {
      beamMesh.visible = false;
    }

    // Terrain-hugging ground guide line
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const sx = startX + (endX - startX) * t;
      const sz = startZ + (endZ - startZ) * t;
      const sy = getSurfaceY(sx, sz) + 0.035;
      groundSamplePts[i].set(sx, sy, sz);
    }
    groundLine.geometry.setFromPoints(groundSamplePts);
    groundLine.computeLineDistances();

    // Traversed grid cells highlight
    if (showTraversedCells) {
      const cells = getTraversedGridCells(startX, startZ, endX, endZ, cellPool.length);
      for (let i = 0; i < cellPool.length; i++) {
        if (i < cells.length) {
          const c = cells[i];
          const cy = getSurfaceY(c.x, c.z) + 0.022;
          cellPool[i].position.set(c.x, cy, c.z);
          cellPool[i].visible = true;
        } else {
          cellPool[i].visible = false;
        }
      }
    }

    // Distance calculation + 3D Sprite Label
    const dist = calculateGridDistance(
      startX,
      startZ,
      endX,
      endZ,
      rule,
      startElev,
      endElev
    );
    const cellsLabel = dist.cells === 1 ? '1 casa' : `${dist.cells} casas`;
    const mainText = `${dist.feet} ft · ${cellsLabel}`;
    const elevNote = dist.elevationDiffFeet > 0 ? ` · Δ${dist.elevationDiffFeet} ft alt` : '';
    const subText = ownerLabel
      ? `${ownerLabel} · ${dist.meters} m${elevNote}`
      : `${dist.meters} m · ${dist.ruleLabel}${elevNote}`;

    const badgeSig = `${mainText}|${subText}|${color}`;
    if (badgeSig !== lastBadgeSig) {
      lastBadgeSig = badgeSig;
      drawBadgeCanvas(badgeCanvas, mainText, subText, color);
      badgeTex.needsUpdate = true;
    }

    const labelX = (startX + endX) * 0.5;
    const labelZ = (startZ + endZ) * 0.5;
    const labelY = Math.max(startY, endY) + 0.92;
    badgeSprite.position.set(labelX, labelY, labelZ);
  };

  const setVisible = (visible: boolean) => {
    group.visible = visible;
  };

  const dispose = () => {
    ringGeo.dispose();
    postGeo.dispose();
    gemGeo.dispose();
    beamGeo.dispose();
    cellGeo.dispose();
    groundLineGeo.dispose();
    primaryMat.dispose();
    ringMat.dispose();
    cellHighlightMat.dispose();
    groundLineMat.dispose();
    badgeTex.dispose();
    badgeMat.dispose();
  };

  return { group, update, setVisible, dispose };
}

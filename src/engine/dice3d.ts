import * as THREE from 'three';
import { DiceRollEvent } from '../types/vtt';

export type SupportedDie = 4 | 6 | 8 | 10 | 12 | 20;

interface DiePrototype {
  sides: SupportedDie;
  geometry: THREE.BufferGeometry;
  edgesGeometry: THREE.EdgesGeometry;
  faceNormals: THREE.Vector3[];
  atlasTexture: THREE.CanvasTexture;
  boundingRadius: number;
}

export interface DieVisualInstance {
  group: THREE.Group;
  dieMesh: THREE.Mesh;
  edgesMesh: THREE.LineSegments;
  shadowMesh: THREE.Mesh;
  badgeSprite: THREE.Sprite;
  targetQuat: THREE.Quaternion;
  restingOffsetY: number;
  dispose: () => void;
}

const PROTOTYPE_CACHE = new Map<SupportedDie, DiePrototype>();
let SHARED_SHADOW_TEX: THREE.CanvasTexture | null = null;
let SHARED_SHADOW_GEO: THREE.PlaneGeometry | null = null;

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _centroid = new THREE.Vector3();
const _uAxis = new THREE.Vector3();
const _vAxis = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _zRef = new THREE.Vector3(0, 0, 1);
const _yRef = new THREE.Vector3(0, 1, 0);

function getSharedShadowTexture(maxAnisotropy: number): THREE.CanvasTexture {
  if (SHARED_SHADOW_TEX) return SHARED_SHADOW_TEX;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  SHARED_SHADOW_TEX = tex;
  return tex;
}

function getSharedShadowGeometry(): THREE.PlaneGeometry {
  if (!SHARED_SHADOW_GEO) {
    SHARED_SHADOW_GEO = new THREE.PlaneGeometry(0.74, 0.74);
    SHARED_SHADOW_GEO.rotateX(-Math.PI / 2);
  }
  return SHARED_SHADOW_GEO;
}

function buildD10Geometry(): THREE.BufferGeometry {
  // Regular pentagonal trapezohedron (10 strictly planar kite faces)
  const H = 0.295;
  const R = 0.275;
  const cos36 = Math.cos(Math.PI / 5);
  const h = H * ((1 - cos36) / (1 + cos36));

  const T = new THREE.Vector3(0, H, 0);
  const B = new THREE.Vector3(0, -H, 0);
  const U: THREE.Vector3[] = [];
  const L: THREE.Vector3[] = [];

  for (let k = 0; k < 5; k++) {
    const aU = (k * Math.PI * 2) / 5;
    const aL = ((k + 0.5) * Math.PI * 2) / 5;
    U.push(new THREE.Vector3(R * Math.cos(aU), h, R * Math.sin(aU)));
    L.push(new THREE.Vector3(R * Math.cos(aL), -h, R * Math.sin(aL)));
  }

  const positions: number[] = [];

  const pushTriOutward = (p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, kiteCenter: THREE.Vector3) => {
    _e1.subVectors(p1, p0);
    _e2.subVectors(p2, p0);
    _norm.crossVectors(_e1, _e2);
    if (_norm.dot(kiteCenter) < 0) {
      positions.push(p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p1.x, p1.y, p1.z);
    } else {
      positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  };

  for (let k = 0; k < 5; k++) {
    const next = (k + 1) % 5;
    // Upper kite: T, U[k], L[k], U[next]
    const topCenter = new THREE.Vector3()
      .add(T)
      .add(U[k])
      .add(L[k])
      .add(U[next])
      .multiplyScalar(0.25);
    pushTriOutward(T, U[next], L[k], topCenter);
    pushTriOutward(T, L[k], U[k], topCenter);

    // Lower kite: B, L[k], U[next], L[next]
    const botCenter = new THREE.Vector3()
      .add(B)
      .add(L[k])
      .add(U[next])
      .add(L[next])
      .multiplyScalar(0.25);
    pushTriOutward(B, L[k], U[next], botCenter);
    pushTriOutward(B, U[next], L[next], botCenter);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

function getAtlasLayout(sides: SupportedDie): { cols: number; rows: number } {
  switch (sides) {
    case 4:
      return { cols: 2, rows: 2 };
    case 6:
      return { cols: 3, rows: 2 };
    case 8:
      return { cols: 4, rows: 2 };
    case 10:
      return { cols: 5, rows: 2 };
    case 12:
      return { cols: 4, rows: 3 };
    case 20:
      return { cols: 5, rows: 4 };
  }
}

function createDieAtlasTexture(sides: SupportedDie, maxAnisotropy: number): THREE.CanvasTexture {
  const { cols, rows } = getAtlasLayout(sides);
  const cellSize = 256;
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#181c25';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < sides; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = col * cellSize + cellSize * 0.5;
    const cy = row * cellSize + cellSize * 0.5;
    const num = i + 1;

    // Subtle recessed gradient per face
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, cellSize * 0.46);
    grad.addColorStop(0, '#272f3f');
    grad.addColorStop(0.75, '#191e28');
    grad.addColorStop(1, '#12151d');
    ctx.fillStyle = grad;
    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);

    // Subtle filigree ring
    ctx.strokeStyle = num === sides ? 'rgba(250, 204, 21, 0.55)' : 'rgba(217, 160, 62, 0.25)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, cellSize * 0.34, 0, Math.PI * 2);
    ctx.stroke();

    // Engraved metallic number
    const label = String(num);
    const fontSize = sides === 20 ? 94 : sides === 12 ? 104 : sides === 10 ? 96 : 114;
    ctx.font = `700 ${fontSize}px "Cinzel", "Georgia", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Dark emboss shadow
    ctx.fillStyle = '#090b10';
    ctx.fillText(label, cx + 2, cy + 4);

    // Gold / Critical / Crit-Fail metallic ink
    if (num === sides) {
      ctx.fillStyle = '#fde047';
    } else if (num === 1) {
      ctx.fillStyle = '#fb7185';
    } else {
      ctx.fillStyle = '#f3d078';
    }
    ctx.fillText(label, cx, cy);

    // Underline 6 and 9 so they are unambiguous on d10/d12/d20
    if (num === 6 || num === 9) {
      ctx.fillRect(cx - 26, cy + fontSize * 0.43, 52, 6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildDiePrototype(sides: SupportedDie, maxAnisotropy: number): DiePrototype {
  const cached = PROTOTYPE_CACHE.get(sides);
  if (cached) return cached;

  let rawGeo: THREE.BufferGeometry;
  switch (sides) {
    case 4:
      rawGeo = new THREE.TetrahedronGeometry(0.285, 0).toNonIndexed();
      break;
    case 6:
      rawGeo = new THREE.BoxGeometry(0.36, 0.36, 0.36).toNonIndexed();
      break;
    case 8:
      rawGeo = new THREE.OctahedronGeometry(0.28, 0).toNonIndexed();
      break;
    case 10:
      rawGeo = buildD10Geometry();
      break;
    case 12:
      rawGeo = new THREE.DodecahedronGeometry(0.265, 0).toNonIndexed();
      break;
    case 20:
      rawGeo = new THREE.IcosahedronGeometry(0.285, 0).toNonIndexed();
      break;
  }

  rawGeo.computeVertexNormals();
  const posAttr = rawGeo.attributes.position;
  const triCount = posAttr.count / 3;

  // Group coplanar triangles into physical faces
  const faces: { normal: THREE.Vector3; triIndices: number[] }[] = [];

  for (let t = 0; t < triCount; t++) {
    const i0 = t * 3;
    _vA.fromBufferAttribute(posAttr, i0);
    _vB.fromBufferAttribute(posAttr, i0 + 1);
    _vC.fromBufferAttribute(posAttr, i0 + 2);
    _e1.subVectors(_vB, _vA);
    _e2.subVectors(_vC, _vA);
    _norm.crossVectors(_e1, _e2).normalize();

    const existing = faces.find((f) => f.normal.dot(_norm) > 0.992);
    if (existing) {
      existing.triIndices.push(t);
    } else {
      faces.push({ normal: _norm.clone(), triIndices: [t] });
    }
  }

  const { cols, rows } = getAtlasLayout(sides);
  const uvArray = new Float32Array(posAttr.count * 2);

  faces.forEach((face, faceIdx) => {
    const cellIdx = faceIdx % sides;
    const col = cellIdx % cols;
    const row = Math.floor(cellIdx / cols);

    // Compute face centroid
    _centroid.set(0, 0, 0);
    let vertCount = 0;
    for (const t of face.triIndices) {
      for (let k = 0; k < 3; k++) {
        _vA.fromBufferAttribute(posAttr, t * 3 + k);
        _centroid.add(_vA);
        vertCount++;
      }
    }
    _centroid.divideScalar(Math.max(1, vertCount));

    // Orthonormal 2D face tangent frame (u right, v up when viewed from outside)
    const ref = Math.abs(face.normal.y) > 0.9 ? _zRef : _yRef;
    _uAxis.crossVectors(ref, face.normal).normalize();
    _vAxis.crossVectors(face.normal, _uAxis).normalize();

    let maxR = 0.001;
    for (const t of face.triIndices) {
      for (let k = 0; k < 3; k++) {
        _vA.fromBufferAttribute(posAttr, t * 3 + k).sub(_centroid);
        const du = _vA.dot(_uAxis);
        const dv = _vA.dot(_vAxis);
        const r = Math.hypot(du, dv);
        if (r > maxR) maxR = r;
      }
    }

    const fitScale = sides === 4 ? 0.36 / maxR : sides === 6 ? 0.44 / maxR : 0.4 / maxR;
    const uMin = col / cols;
    const uSpan = 1 / cols;
    const vMin = 1 - (row + 1) / rows;
    const vSpan = 1 / rows;

    for (const t of face.triIndices) {
      for (let k = 0; k < 3; k++) {
        const idx = t * 3 + k;
        _vA.fromBufferAttribute(posAttr, idx).sub(_centroid);
        const lx = 0.5 + _vA.dot(_uAxis) * fitScale;
        const ly = 0.5 + _vA.dot(_vAxis) * fitScale;
        uvArray[idx * 2] = uMin + lx * uSpan;
        uvArray[idx * 2 + 1] = vMin + ly * vSpan;
      }
    }
  });

  rawGeo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  rawGeo.computeBoundingSphere();

  const edgesGeometry = new THREE.EdgesGeometry(rawGeo, 15);
  const atlasTexture = createDieAtlasTexture(sides, maxAnisotropy);
  const proto: DiePrototype = {
    sides,
    geometry: rawGeo,
    edgesGeometry,
    faceNormals: faces.map((f) => f.normal),
    atlasTexture,
    boundingRadius: rawGeo.boundingSphere ? rawGeo.boundingSphere.radius : 0.3,
  };

  PROTOTYPE_CACHE.set(sides, proto);
  return proto;
}

export function normalizeSupportedDie(die: number): SupportedDie {
  if (die === 4 || die === 6 || die === 8 || die === 10 || die === 12 || die === 20) {
    return die;
  }
  return 20;
}

export function computeDieTargetOrientation(
  sides: SupportedDie,
  faceNormals: THREE.Vector3[],
  geometry: THREE.BufferGeometry,
  result: number,
  yawJitter: number
): { quaternion: THREE.Quaternion; restingOffsetY: number } {
  const faceIdx = Math.max(0, Math.min(faceNormals.length - 1, result - 1));
  const targetQuat = new THREE.Quaternion();

  if (sides === 4 && faceNormals.length >= 4) {
    // Sit flat on another face while tilting the rolled face upward toward +Z (camera side)
    const bottomIdx = (faceIdx + 1) % faceNormals.length;
    const n1 = faceNormals[faceIdx];
    const n2 = faceNormals[bottomIdx];

    const w1 = new THREE.Vector3(0, 1 / 3, Math.SQRT2 * (2 / 3)).normalize();
    const w2 = new THREE.Vector3(0, -1, 0);

    const e3 = new THREE.Vector3().crossVectors(n1, n2).normalize();
    const e2 = new THREE.Vector3().crossVectors(e3, n1).normalize();
    const mLocal = new THREE.Matrix4().makeBasis(n1, e2, e3);

    const b3 = new THREE.Vector3().crossVectors(w1, w2).normalize();
    const b2 = new THREE.Vector3().crossVectors(b3, w1).normalize();
    const mWorld = new THREE.Matrix4().makeBasis(w1, b2, b3);

    const rotMat = new THREE.Matrix4().multiplyMatrices(mWorld, mLocal.transpose());
    targetQuat.setFromRotationMatrix(rotMat);

    // Small yaw jitter keeping face readable toward camera
    const qSpin = new THREE.Quaternion().setFromAxisAngle(_upVec, yawJitter * 0.35);
    targetQuat.premultiply(qSpin);
  } else {
    const faceNormal = faceNormals[faceIdx] || _upVec;
    targetQuat.setFromUnitVectors(faceNormal, _upVec);
    const qSpin = new THREE.Quaternion().setFromAxisAngle(_upVec, yawJitter);
    targetQuat.premultiply(qSpin);
  }

  // Compute exact resting clearance above Y=0 for this rotated polyhedron
  const posAttr = geometry.attributes.position;
  let minY = Infinity;
  for (let i = 0; i < posAttr.count; i++) {
    _vA.fromBufferAttribute(posAttr, i).applyQuaternion(targetQuat);
    if (_vA.y < minY) minY = _vA.y;
  }

  return {
    quaternion: targetQuat,
    restingOffsetY: Number.isFinite(minY) ? -minY : 0.22,
  };
}

function createRollBadgeSprite(roll: DiceRollEvent, maxAnisotropy: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  const accent = roll.color || '#f59e0b';
  const isCritMax = roll.result === roll.die;
  const isCritMin = roll.result === 1;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(13, 17, 24, 0.92)';
  ctx.beginPath();
  ctx.roundRect(10, 12, 236, 72, 16);
  ctx.fill();

  ctx.strokeStyle = isCritMax ? '#fde047' : isCritMin ? '#fb7185' : accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 18px "Inter", sans-serif';
  ctx.fillText(`${roll.userName.slice(0, 14)} · d${roll.die}`, 128, 36);

  ctx.fillStyle = isCritMax ? '#fde047' : isCritMin ? '#fda4af' : '#f8fafc';
  ctx.font = '700 28px "JetBrains Mono", monospace';
  const modText =
    roll.modifier !== 0 ? (roll.modifier > 0 ? `+${roll.modifier}` : `${roll.modifier}`) : '';
  ctx.fillText(`${roll.result}${modText} = ${roll.total}`, 128, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    opacity: 0,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.25, 0.47, 1);
  sprite.position.set(0, 0.62, 0);
  sprite.renderOrder = 15;
  return sprite;
}

export function create3DDieInstance(
  roll: DiceRollEvent,
  maxAnisotropy: number,
  yawJitter: number
): DieVisualInstance {
  const sides = normalizeSupportedDie(roll.die);
  const proto = buildDiePrototype(sides, maxAnisotropy);

  const group = new THREE.Group();

  const dieMat = new THREE.MeshStandardMaterial({
    map: proto.atlasTexture,
    roughness: 0.34,
    metalness: 0.25,
  });

  const dieMesh = new THREE.Mesh(proto.geometry, dieMat);
  dieMesh.castShadow = true;
  dieMesh.receiveShadow = true;

  const edgeColor = roll.color || '#f59e0b';
  const edgeMat = new THREE.LineBasicMaterial({
    color: edgeColor,
    transparent: true,
    opacity: 0.85,
  });
  const edgesMesh = new THREE.LineSegments(proto.edgesGeometry, edgeMat);
  dieMesh.add(edgesMesh);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: getSharedShadowTexture(maxAnisotropy),
    transparent: true,
    depthWrite: false,
    opacity: 0.65,
  });
  const shadowMesh = new THREE.Mesh(getSharedShadowGeometry(), shadowMat);
  shadowMesh.position.y = 0.014;

  const badgeSprite = createRollBadgeSprite(roll, maxAnisotropy);

  group.add(shadowMesh, dieMesh, badgeSprite);

  const { quaternion, restingOffsetY } = computeDieTargetOrientation(
    sides,
    proto.faceNormals,
    proto.geometry,
    roll.result,
    yawJitter
  );

  return {
    group,
    dieMesh,
    edgesMesh,
    shadowMesh,
    badgeSprite,
    targetQuat: quaternion,
    restingOffsetY,
    dispose: () => {
      dieMat.dispose();
      edgeMat.dispose();
      shadowMat.dispose();
      const sMat = badgeSprite.material as THREE.SpriteMaterial;
      sMat.map?.dispose();
      sMat.dispose();
    },
  };
}

export function disposeSharedDiceResources(): void {
  PROTOTYPE_CACHE.forEach((proto) => {
    proto.geometry.dispose();
    proto.edgesGeometry.dispose();
    proto.atlasTexture.dispose();
  });
  PROTOTYPE_CACHE.clear();
  SHARED_SHADOW_TEX?.dispose();
  SHARED_SHADOW_TEX = null;
  SHARED_SHADOW_GEO?.dispose();
  SHARED_SHADOW_GEO = null;
}

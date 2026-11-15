import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedObject } from 'three/addons/utils/SkeletonUtils.js';
import {
  FootprintSize,
  MiniFinish,
  ModelDimensionsInfo,
  ModelFormat,
  TILE_SIZE,
} from '../types/vtt';

const BASE_PEDESTAL_HEIGHT = 0.085;

const rawAssetCache = new Map<string, ArrayBuffer>();
const inFlightAssetFetches = new Map<string, Promise<ArrayBuffer>>();
const parsedModelCache = new Map<string, THREE.Object3D>();
const stlLoader = new STLLoader();
const objLoader = new OBJLoader();
const gltfLoader = new GLTFLoader();

export function createFinishMaterial(
  finish: MiniFinish,
  colorHex: string,
  resinBump?: THREE.Texture,
  stoneMap?: THREE.Texture,
  stoneBump?: THREE.Texture
): THREE.MeshStandardMaterial {
  const tint = new THREE.Color(colorHex || '#a8a29e');
  switch (finish) {
    case 'bronze':
      return new THREE.MeshStandardMaterial({
        color: tint.clone().lerp(new THREE.Color('#c28b4e'), 0.65),
        metalness: 0.85,
        roughness: 0.28,
        bumpMap: resinBump || null,
        bumpScale: 0.004,
      });
    case 'gold':
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color('#e5b94c'),
        metalness: 0.92,
        roughness: 0.2,
      });
    case 'stone':
      // Neutral honed gray chess-piece stone (Staunton granite/marble feel; team color remains on the pedestal rim)
      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#a4a9b1'),
        map: stoneMap || null,
        metalness: 0.05,
        roughness: 0.56,
        clearcoat: 0.14,
        clearcoatRoughness: 0.52,
        bumpMap: stoneBump || resinBump || null,
        bumpScale: 0.006,
      });
    case 'arcane':
      return new THREE.MeshStandardMaterial({
        color: tint.clone().lerp(new THREE.Color('#1d2738'), 0.45),
        emissive: tint,
        emissiveIntensity: 0.24,
        metalness: 0.4,
        roughness: 0.35,
      });
    case 'resin':
    default:
      return new THREE.MeshStandardMaterial({
        color: tint.clone().lerp(new THREE.Color('#b6b2ac'), 0.45),
        metalness: 0.08,
        roughness: 0.44,
        bumpMap: resinBump || null,
        bumpScale: 0.005,
      });
  }
}

export async function fetchAssetBuffer(
  assetId?: string,
  remoteUrl?: string
): Promise<ArrayBuffer> {
  const cacheKey = remoteUrl || assetId || '';
  if (!cacheKey) {
    throw new Error('Asset sem identificador ou URL.');
  }

  const cached = rawAssetCache.get(cacheKey);
  if (cached) return cached.slice(0);

  const existingFlight = inFlightAssetFetches.get(cacheKey);
  if (existingFlight) {
    const buf = await existingFlight;
    return buf.slice(0);
  }

  const endpoint = remoteUrl
    ? `/api/assets/proxy?url=${encodeURIComponent(remoteUrl)}`
    : `/api/assets/${encodeURIComponent(assetId!)}`;

  const promise = (async () => {
    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error(`Erro ao baixar modelo 3D (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    rawAssetCache.set(cacheKey, buf);
    return buf;
  })();

  inFlightAssetFetches.set(cacheKey, promise);
  try {
    const buf = await promise;
    return buf.slice(0);
  } finally {
    inFlightAssetFetches.delete(cacheKey);
  }
}

function ensureProjectedUVs(geometry: THREE.BufferGeometry) {
  if (!geometry || geometry.attributes.uv || !geometry.attributes.position) return;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const span = box ? Math.max(0.001, box.getSize(new THREE.Vector3()).length()) : 40;
  const uvScale = 2.4 / span;
  const pos = geometry.attributes.position;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    uvs[i * 2] = (vx * 0.72 + vz * 0.69) * uvScale;
    uvs[i * 2 + 1] = (vy * 0.85 + vz * 0.35) * uvScale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

export async function parseRawModel(
  format: ModelFormat,
  buffer: ArrayBuffer,
  cacheKey?: string
): Promise<THREE.Object3D> {
  if (cacheKey && parsedModelCache.has(cacheKey)) {
    return parsedModelCache.get(cacheKey)!;
  }

  let parsed: THREE.Object3D;

  if (format === 'stl') {
    const geometry = stlLoader.parse(buffer);
    if (!geometry.attributes.normal) {
      geometry.computeVertexNormals();
    }
    ensureProjectedUVs(geometry);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xa4a9b1, roughness: 0.56, metalness: 0.05 })
    );
    const group = new THREE.Group();
    group.add(mesh);
    parsed = group;
  } else if (format === 'obj') {
    const text = new TextDecoder().decode(buffer);
    const obj = objLoader.parse(text);
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry && !mesh.geometry.attributes.normal) {
          mesh.geometry.computeVertexNormals();
        }
        if (mesh.geometry) {
          ensureProjectedUVs(mesh.geometry);
        }
      }
    });
    parsed = obj;
  } else if (format === 'glb' || format === 'gltf') {
    parsed = await new Promise<THREE.Object3D>((resolve, reject) => {
      gltfLoader.parse(
        buffer,
        '',
        (gltf) => {
          if (gltf.animations && gltf.animations.length > 0) {
            gltf.scene.userData.animations = gltf.animations;
          }
          resolve(gltf.scene);
        },
        (err) => reject(err)
      );
    });
  } else {
    throw new Error(`Formato nao suportado: ${format}`);
  }

  if (cacheKey) {
    parsedModelCache.set(cacheKey, parsed);
  }
  return parsed;
}

/**
 * Normalizes any imported STL, OBJ, or GLB/GLTF mesh into TaleSpire-style tabletop scale:
 * - Fixes Z-up 3D printer coordinates when fixZUp=true
 * - Poses rigged character GLBs in an Idle stance if available
 * - Centers X/Z on (0,0) and places min.y flush at y=0 (or above RPG base pedestal)
 * - Auto-scales millimeter/meter/inch models cleanly into the target RPG grid footprint
 */
export function normalizeAndDimensionModel(
  rawObject: THREE.Object3D,
  options: {
    footprint: FootprintSize;
    scaleMultiplier: number;
    fixZUp: boolean;
    showBase: boolean;
    finish: MiniFinish;
    color: string;
    isPropOnly?: boolean;
    resinBump?: THREE.Texture;
    stoneMap?: THREE.Texture;
    stoneBump?: THREE.Texture;
  }
): { normalizedRoot: THREE.Group; info: ModelDimensionsInfo } {
  const wrapper = new THREE.Group();
  const inner = cloneSkinnedObject(rawObject);

  // If GLB contains skeletal animations (e.g. KayKit Heroes / Draugr), apply Idle pose once
  const clips = rawObject.userData?.animations as THREE.AnimationClip[] | undefined;
  if (clips && clips.length > 0) {
    const idleClip =
      clips.find((c) => c.name === 'Idle') ||
      clips.find((c) => /idle/i.test(c.name)) ||
      clips[0];
    if (idleClip) {
      const mixer = new THREE.AnimationMixer(inner);
      const action = mixer.clipAction(idleClip);
      action.play();
      mixer.update(0.25);
      mixer.stopAllAction();
    }
  }

  if (options.fixZUp) {
    inner.rotation.x = -Math.PI / 2;
  }

  // Apply finish material if requested or if mesh lacks textured PBR material
  const overrideMat =
    options.finish !== 'original'
      ? createFinishMaterial(
          options.finish,
          options.color,
          options.resinBump,
          options.stoneMap,
          options.stoneBump
        )
      : null;

  inner.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (mesh.geometry && !mesh.geometry.attributes.uv) {
        ensureProjectedUVs(mesh.geometry);
      }
      if (overrideMat) {
        mesh.material = overrideMat;
      } else if (!mesh.material) {
        mesh.material = createFinishMaterial(
          'stone',
          options.color,
          options.resinBump,
          options.stoneMap,
          options.stoneBump
        );
      }
    }
  });

  inner.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(inner);
  const rawSize = new THREE.Vector3();
  const rawCenter = new THREE.Vector3();
  rawBox.getSize(rawSize);
  rawBox.getCenter(rawCenter);

  const safeW = Math.max(0.0001, rawSize.x);
  const safeH = Math.max(0.0001, rawSize.y);
  const safeD = Math.max(0.0001, rawSize.z);

  // Target dimensions on RPG tabletop grid (1 tile = 1.0 unit = 25mm / 1.5m)
  const footprintUnits = options.footprint * TILE_SIZE;
  let baseScale: number;

  if (options.isPropOnly) {
    const maxHorizontalTarget = footprintUnits * 0.94;
    const targetHeight = footprintUnits * 1.15;
    const horizScale = maxHorizontalTarget / Math.max(safeW, safeD);
    const heightScale = targetHeight / safeH;
    baseScale = Math.min(horizScale * 1.18, Math.max(horizScale * 0.72, heightScale));
  } else {
    // Strictly dimension character/monster miniatures like carved chess pieces on their pedestal:
    // never overflow horizontal tile boundaries (0.84x) and keep balanced tabletop height (~1.34x)
    const horizCap = (footprintUnits * 0.84) / Math.max(safeW, safeD);
    const targetHeight = footprintUnits * 1.34;
    const minHeightScale = (footprintUnits * 0.82) / safeH;
    const maxHeightScale = (footprintUnits * 1.52) / safeH;
    const desiredHeightScale = Math.min(
      maxHeightScale,
      Math.max(minHeightScale, targetHeight / safeH)
    );
    baseScale = Math.min(horizCap, desiredHeightScale);
  }

  const finalScale = baseScale * (options.scaleMultiplier || 1);

  inner.scale.multiplyScalar(finalScale);
  inner.updateMatrixWorld(true);

  // Re-compute bounding box after scaling so bottom-center rests cleanly on 0 or base top
  const scaledBox = new THREE.Box3().setFromObject(inner);
  const scaledCenter = new THREE.Vector3();
  const scaledSize = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);
  scaledBox.getSize(scaledSize);

  const baseOffsetY = options.showBase && !options.isPropOnly ? BASE_PEDESTAL_HEIGHT : 0;
  inner.position.x -= scaledCenter.x;
  inner.position.z -= scaledCenter.z;
  inner.position.y += baseOffsetY - scaledBox.min.y;

  wrapper.add(inner);

  const maxRaw = Math.max(rawSize.x, rawSize.y, rawSize.z);
  const unitHint =
    maxRaw > 15
      ? 'Escala detectada: milimetros (Impressao 3D)'
      : maxRaw < 0.2
      ? 'Escala detectada: mini/metros reduzidos'
      : 'Escala detectada: metros / unidades padrao';

  return {
    normalizedRoot: wrapper,
    info: {
      rawWidth: Number(rawSize.x.toFixed(2)),
      rawHeight: Number(rawSize.y.toFixed(2)),
      rawDepth: Number(rawSize.z.toFixed(2)),
      appliedScale: Number(finalScale.toFixed(4)),
      finalHeight: Number(scaledSize.y.toFixed(2)),
      unitHint,
    },
  };
}

import * as THREE from 'three';
import { FootprintSize, MiniFinish, TILE_SIZE } from '../types/vtt';

const decodedBitmapCache = new Map<string, Promise<ImageBitmap | HTMLImageElement>>();
const tazoTextureCache = new Map<string, THREE.CanvasTexture>();

function decodeImageBuffer(cacheKey: string, buffer: ArrayBuffer): Promise<ImageBitmap | HTMLImageElement> {
  const existing = decodedBitmapCache.get(cacheKey);
  if (existing) return existing;

  const promise = (async (): Promise<ImageBitmap | HTMLImageElement> => {
    const blob = new Blob([buffer]);
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(blob);
      } catch {
        // Fallback to HTMLImageElement below
      }
    }

    const url = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Falha ao decodificar imagem do Tazo.'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  })();

  decodedBitmapCache.set(cacheKey, promise);
  promise.catch(() => {
    decodedBitmapCache.delete(cacheKey);
  });
  return promise;
}

function getSourceDimensions(img: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if ('naturalWidth' in img) {
    return {
      width: img.naturalWidth || img.width || 1,
      height: img.naturalHeight || img.height || 1,
    };
  }
  return {
    width: img.width || 1,
    height: img.height || 1,
  };
}

function getTazoCanvasTexture(
  cacheKey: string,
  img: ImageBitmap | HTMLImageElement,
  accentColorHex: string
): THREE.CanvasTexture {
  const texKey = `${cacheKey}::${accentColorHex}`;
  const cached = tazoTextureCache.get(texKey);
  if (cached) return cached;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;

    // 1. Rich obsidian medallion backdrop (for transparent PNG portraits)
    const bgGrad = ctx.createRadialGradient(cx, cy * 0.88, 24, cx, cy, r);
    bgGrad.addColorStop(0, '#272f3f');
    bgGrad.addColorStop(0.72, '#141923');
    bgGrad.addColorStop(1, '#090c12');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle colored aura behind character
    ctx.save();
    ctx.globalAlpha = 0.22;
    const auraGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r * 0.85);
    auraGrad.addColorStop(0, accentColorHex || '#d97706');
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // 2. Circular clip + aspect-cover centered draw
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 12, 0, Math.PI * 2);
    ctx.clip();

    const { width: iw, height: ih } = getSourceDimensions(img);
    const scale = Math.max(size / iw, size / ih);
    const drawW = iw * scale;
    const drawH = ih * scale;
    const drawX = (size - drawW) / 2;
    // Slight upward bias (38%) frames character heads/busts nicely inside a circle
    const drawY = (size - drawH) * 0.35;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Subtle inner vignette for tactile medallion depth
    const vig = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.46)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    // 3. Crisp inner rim border lines matching Tazo style
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = accentColorHex || '#d97706';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 17, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 23, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  if (tazoTextureCache.size > 120) {
    const firstKey = tazoTextureCache.keys().next().value;
    if (firstKey) {
      tazoTextureCache.get(firstKey)?.dispose();
      tazoTextureCache.delete(firstKey);
    }
  }
  tazoTextureCache.set(texKey, tex);
  return tex;
}

export async function createTazoTokenGroup(
  buffer: ArrayBuffer,
  cacheKey: string,
  options: {
    footprint: FootprintSize;
    scaleMultiplier: number;
    color: string;
    finish: MiniFinish;
  }
): Promise<THREE.Group> {
  const img = await decodeImageBuffer(cacheKey, buffer);
  const texture = getTazoCanvasTexture(cacheKey, img, options.color || '#d97706');

  const group = new THREE.Group();
  const scaleMul = Math.max(0.25, Math.min(2.5, options.scaleMultiplier || 1));
  const radius = options.footprint * TILE_SIZE * 0.43 * scaleMul;
  const thickness = Math.max(0.062, Math.min(0.115, 0.078 * Math.sqrt(options.footprint))) * scaleMul;
  const accentColor = new THREE.Color(options.color || '#d97706');

  // Sculpted beveled medallion disc body (LatheGeometry)
  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius * 0.98, 0),
    new THREE.Vector2(radius, thickness * 0.24),
    new THREE.Vector2(radius, thickness * 0.78),
    new THREE.Vector2(radius * 0.93, thickness),
    new THREE.Vector2(0, thickness),
  ];
  const discGeo = new THREE.LatheGeometry(points, 40);

  let bodyColor = 0x1a1e28;
  let bodyRoughness = 0.36;
  let bodyMetalness = 0.65;

  if (options.finish === 'gold') {
    bodyColor = 0xd4a43d;
    bodyRoughness = 0.24;
    bodyMetalness = 0.88;
  } else if (options.finish === 'bronze') {
    bodyColor = 0x9b6434;
    bodyRoughness = 0.32;
    bodyMetalness = 0.8;
  } else if (options.finish === 'stone') {
    bodyColor = 0x4b5260;
    bodyRoughness = 0.78;
    bodyMetalness = 0.12;
  } else if (options.finish === 'arcane') {
    bodyColor = 0x261c42;
    bodyRoughness = 0.26;
    bodyMetalness = 0.72;
  }

  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: bodyRoughness,
    metalness: bodyMetalness,
  });
  const bodyMesh = new THREE.Mesh(discGeo, bodyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Colored metallic outer collar ring
  const rimGeo = new THREE.TorusGeometry(radius * 0.955, Math.max(0.014, radius * 0.045), 12, 44);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.22,
    metalness: 0.82,
    emissive: accentColor,
    emissiveIntensity: options.finish === 'arcane' ? 0.35 : 0.14,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = thickness * 0.78;
  rimMesh.castShadow = true;
  group.add(rimMesh);

  // Glossy printed circular artwork cap on top (-Z is portrait "up")
  const artRadius = radius * 0.895;
  const artGeo = new THREE.CircleGeometry(artRadius, 48);
  artGeo.rotateX(-Math.PI / 2);
  const artMat = new THREE.MeshPhysicalMaterial({
    map: texture,
    roughness: 0.28,
    metalness: 0.04,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
  });
  const artMesh = new THREE.Mesh(artGeo, artMat);
  artMesh.position.y = thickness + 0.002;
  artMesh.receiveShadow = true;
  group.add(artMesh);

  // Crisp subtle facing arrow on the north (-Z) rim so Q/E orientation stays clear
  const notchShape = new THREE.Shape();
  const nw = Math.max(0.025, radius * 0.11);
  const nh = Math.max(0.032, radius * 0.13);
  notchShape.moveTo(0, -nh);
  notchShape.lineTo(nw, nh * 0.45);
  notchShape.lineTo(-nw, nh * 0.45);
  notchShape.closePath();

  const notchGeo = new THREE.ExtrudeGeometry(notchShape, {
    depth: Math.max(0.012, thickness * 0.24),
    bevelEnabled: false,
  });
  notchGeo.rotateX(Math.PI / 2);
  const notchMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: accentColor,
    emissiveIntensity: 0.28,
    metalness: 0.85,
    roughness: 0.22,
  });
  const notchMesh = new THREE.Mesh(notchGeo, notchMat);
  notchMesh.position.set(0, thickness + 0.008, -radius * 0.94);
  group.add(notchMesh);

  return group;
}

export async function uploadImageFileAsTazoAsset(file: File): Promise<{
  assetId: string;
  name: string;
}> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    throw new Error('Formato de imagem invalido. Use .PNG, .JPG ou .WEBP.');
  }
  const arrayBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  const res = await fetch('/api/assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      format: 'image',
      dataBase64: btoa(binary),
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Falha ao enviar imagem do Tazo.');
  }

  return (await res.json()) as { assetId: string; name: string };
}

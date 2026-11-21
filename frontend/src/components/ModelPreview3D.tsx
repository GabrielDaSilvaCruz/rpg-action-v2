import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Loader2 } from 'lucide-react';
import {
  BaseStyle,
  FootprintSize,
  MiniFinish,
  ModelFormat,
  TILE_SIZE,
} from '../types/vtt';
import {
  fetchAssetBuffer,
  normalizeAndDimensionModel,
  parseRawModel,
} from '../engine/modelNormalizer';
import { createMiniBase } from '../engine/proceduralModels';
import { apiUrl } from '../utils/backendUrl';

// Singleton compartilhado de renderização WebGL para previews:
// Garante que NUNCA sejam criados mais de 1 contexto WebGL para prévias 3D,
// evitando que o Chrome exceda o limite de 16 contextos e derrube o tabuleiro principal.
let sharedPreviewRenderer: THREE.WebGLRenderer | null = null;

function getSharedPreviewRenderer(): THREE.WebGLRenderer {
  if (!sharedPreviewRenderer) {
    sharedPreviewRenderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'low-power',
    });
    sharedPreviewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    sharedPreviewRenderer.toneMappingExposure = 1.15;
    sharedPreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return sharedPreviewRenderer;
}

interface ModelPreview3DProps {
  format: ModelFormat;
  assetId?: string;
  remoteUrl?: string;
  rawObject?: THREE.Object3D | null;
  imagePreviewUrl?: string | null;
  footprint: FootprintSize;
  scaleMultiplier?: number;
  fixZUp?: boolean;
  showBase?: boolean;
  baseStyle?: BaseStyle;
  finish: MiniFinish;
  color: string;
  isPropOnly?: boolean;
  label?: string;
  sizePx?: number;
  className?: string;
}

export const ModelPreview3D: React.FC<ModelPreview3DProps> = ({
  format,
  assetId,
  remoteUrl,
  rawObject,
  imagePreviewUrl,
  footprint,
  scaleMultiplier = 1,
  fixZUp = false,
  showBase = true,
  baseStyle = 'rune',
  finish,
  color,
  isPropOnly = false,
  label,
  sizePx = 128,
  className = '',
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (format === 'image' || imagePreviewUrl) {
      setLoading(false);
      setError(null);
      return;
    }

    const host = hostRef.current;
    if (!host) return;
    if (!rawObject && !assetId && !remoteUrl) return;

    let cancelled = false;
    let animId = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c1018');

    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 60);
    const renderer = getSharedPreviewRenderer();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(sizePx, sizePx);
    if (renderer.domElement.parentElement && renderer.domElement.parentElement !== host) {
      renderer.domElement.parentElement.removeChild(renderer.domElement);
    }
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    // Studio lighting tailored for carved gray chess-stone detail
    const hemi = new THREE.HemisphereLight('#dce7f7', '#262b36', 1.15);
    scene.add(hemi);

    const key = new THREE.DirectionalLight('#fff6e6', 2.0);
    key.position.set(3.2, 5.2, 4.0);
    scene.add(key);

    const rim = new THREE.DirectionalLight('#7cc4fa', 0.95);
    rim.position.set(-3.5, 2.8, -3.2);
    scene.add(rim);

    // Reference tabletop tile pad underneath so user sees footprint proportion
    const fpUnits = Math.max(0.5, footprint || 1) * TILE_SIZE;
    const tilePad = new THREE.Mesh(
      new THREE.BoxGeometry(fpUnits, 0.04, fpUnits),
      new THREE.MeshStandardMaterial({
        color: '#202633',
        roughness: 0.88,
        metalness: 0.06,
      })
    );
    tilePad.position.y = -0.02;
    scene.add(tilePad);

    const gridEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(fpUnits, 0.042, fpUnits)),
      new THREE.LineBasicMaterial({ color: '#475569', transparent: true, opacity: 0.6 })
    );
    gridEdges.position.y = -0.02;
    scene.add(gridEdges);

    const turret = new THREE.Group();
    scene.add(turret);

    let dragActive = false;
    let lastX = 0;
    let userYaw = 0.38;

    const onPointerDown = (e: PointerEvent) => {
      dragActive = true;
      lastX = e.clientX;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragActive) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      userYaw += dx * 0.015;
    };
    const onPointerUp = () => {
      dragActive = false;
    };

    const canvasEl = renderer.domElement;
    canvasEl.style.cursor = 'grab';
    canvasEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const mountModel = async () => {
      setLoading(true);
      setError(null);
      try {
        let sourceObj = rawObject || null;
        if (!sourceObj) {
          const cacheKey = remoteUrl || assetId;
          const buf = await fetchAssetBuffer(assetId, remoteUrl);
          if (cancelled) return;
          sourceObj = await parseRawModel(format, buf, cacheKey);
        }
        if (cancelled || !sourceObj) return;

        if (showBase && !isPropOnly) {
          const base = createMiniBase(footprint, color, baseStyle || 'rune');
          turret.add(base);
        }

        const { normalizedRoot } = normalizeAndDimensionModel(sourceObj, {
          footprint,
          scaleMultiplier,
          fixZUp,
          showBase,
          finish,
          color,
          isPropOnly,
        });
        turret.add(normalizedRoot);

        // Fit camera cleanly to the normalized bounding box
        turret.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(turret);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(fpUnits * 1.05, size.x, size.y, size.z, 0.85);
        const dist = maxDim * 1.95;
        camera.position.set(0, center.y + maxDim * 0.72, dist);
        camera.lookAt(0, Math.max(0.28, center.y * 0.92), 0);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Erro no preview 3D:', err);
        setLoading(false);
        setError('Preview indisponivel');
      }
    };

    void mountModel();

    let lastRenderTime = 0;
    const animate = (time: number) => {
      if (cancelled) return;
      animId = requestAnimationFrame(animate);
      if (time - lastRenderTime < 33) return; // Cap previews at ~30 FPS to save GPU
      lastRenderTime = time;
      if (!dragActive) {
        userYaw += 0.01;
      }
      turret.rotation.y = userYaw;
      renderer.render(scene, camera);
    };
    animId = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      turret.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });
      tilePad.geometry.dispose();
      (tilePad.material as THREE.Material).dispose();
      gridEdges.geometry.dispose();
      (gridEdges.material as THREE.Material).dispose();
      hemi.dispose();
      key.dispose();
      rim.dispose();
      if (host.contains(canvasEl)) {
        host.removeChild(canvasEl);
      }
    };
  }, [
    format,
    assetId,
    remoteUrl,
    rawObject,
    imagePreviewUrl,
    footprint,
    scaleMultiplier,
    fixZUp,
    showBase,
    baseStyle,
    finish,
    color,
    isPropOnly,
    sizePx,
  ]);

  if (format === 'image' || imagePreviewUrl) {
    const imgSrc =
      imagePreviewUrl ||
      (remoteUrl
        ? remoteUrl.startsWith('http')
          ? apiUrl(`/api/assets/proxy?url=${encodeURIComponent(remoteUrl)}`)
          : apiUrl(remoteUrl)
        : assetId
        ? apiUrl(`/api/assets/${encodeURIComponent(assetId)}`)
        : null);

    return (
      <div
        className={`relative flex items-center justify-center rounded-xl bg-[#0c1018] border border-stone-700/80 overflow-hidden shrink-0 ${className}`}
        style={{ width: sizePx, height: sizePx }}
        title={label || 'Previa do Tazo'}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={label || 'Tazo'}
            className="w-4/5 h-4/5 rounded-full object-cover border-[3px] shadow-lg bg-[#141923]"
            style={{ borderColor: color || '#d97706' }}
          />
        ) : (
          <span className="text-[10px] text-stone-500 px-2 text-center">Tazo</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-xl bg-[#0c1018] border border-stone-700/80 overflow-hidden shrink-0 select-none ${className}`}
      style={{ width: sizePx, height: sizePx }}
      title={label ? `${label} (arraste para girar)` : 'Arraste para girar o preview 3D'}
    >
      <div ref={hostRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0c1018]/80 text-[10px] text-amber-300 gap-1 pointer-events-none">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Carregando 3D...</span>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0c1018]/90 text-[10px] text-rose-300 px-2 text-center pointer-events-none">
          {error}
        </div>
      )}
      {!loading && !error && (
        <span className="absolute bottom-1 right-1.5 text-[9px] font-mono-tabular px-1.5 py-0.5 rounded bg-black/60 text-stone-300 pointer-events-none">
          {footprint}x{footprint} · 3D
        </span>
      )}
    </div>
  );
};

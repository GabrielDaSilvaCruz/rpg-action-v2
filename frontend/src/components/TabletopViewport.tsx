import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AnnotationKind,
  BASE_THICKNESS,
  DiceRollEvent,
  ELEVATION_STEP,
  MeasureRule,
  MiniatureData,
  PropKind,
  Role,
  RoomState,
  RulerMeasurement,
  TILE_SIZE,
  TerrainKind,
  TileCell,
  getTileSurfaceY,
  tileKey,
} from '../types/vtt';
import { createAnnotationVisual } from '../engine/annotationBuilder';
import { createRulerVisual, RulerVisualHandle } from '../engine/rulerBuilder';
import {
  DieVisualInstance,
  create3DDieInstance,
  disposeSharedDiceResources,
} from '../engine/dice3d';
import { createProceduralTextures, ProceduralTexturePack } from '../engine/proceduralTextures';
import {
  createBuiltinMiniature,
  createContactShadow,
  createMiniBase,
  createTerrainProp,
} from '../engine/proceduralModels';
import {
  fetchAssetBuffer,
  normalizeAndDimensionModel,
  parseRawModel,
} from '../engine/modelNormalizer';
import { createTazoTokenGroup } from '../engine/tazoTokenBuilder';
import { audioSynth } from '../engine/audioSynth';

export type CameraPreset = 'iso' | 'top' | 'dramatic';

export interface SculptBrush {
  terrain: TerrainKind;
  elevation: number;
  prop: PropKind;
  propRotation: number;
  erase: boolean;
}

export interface AnnotationBrush {
  kind: AnnotationKind;
  radius: number;
  rotationY: number;
  color: string;
  label: string;
  gmOnly: boolean;
}

export interface RulerLineCoords {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
}

export interface ViewportContextMenuTarget {
  screenX: number;
  screenY: number;
  miniId: string | null;
  annotationId: string | null;
  gridX: number | null;
  gridZ: number | null;
}

interface TabletopViewportProps {
  roomState: RoomState | null;
  role: Role;
  gmLayer?: 'all' | 'characters' | 'props';
  userName: string;
  userColor: string;
  isLobby: boolean;
  toolMode: 'interact' | 'sculpt' | 'annotate' | 'measure';
  sculptBrush: SculptBrush;
  annotationBrush: AnnotationBrush;
  measureRule: MeasureRule;
  measureSnap: boolean;
  localRuler: RulerLineCoords | null;
  selectedMiniId: string | null;
  selectedAnnotationId: string | null;
  cameraCommand: { preset: CameraPreset; seq: number } | null;
  onSelectMini: (id: string | null) => void;
  onSelectAnnotation: (id: string | null) => void;
  onMoveMini: (id: string, x: number, z: number, rotationY?: number) => void;
  onDeleteMini?: (id: string) => void;
  onPaintTile: (cell: TileCell) => void;
  onSculptStrokeStart?: () => void;
  onSculptStrokeEnd?: () => void;
  onPlaceAnnotation: (x: number, z: number) => void;
  onLocalRulerChange: (coords: RulerLineCoords | null, isDragging: boolean) => void;
  onHoverInfo: (info: { x: number; z: number; distanceCells: number | null } | null) => void;
  onOpenContextMenu?: (target: ViewportContextMenuTarget) => void;
  onDismissContextMenu?: () => void;
}

interface MiniVisualEntry {
  group: THREE.Group;
  targetX: number;
  targetZ: number;
  targetY: number;
  targetRotY: number;
  hopProgress: number;
  signature: string;
  selectionRing: THREE.Object3D;
}

interface TileVisualEntry {
  group: THREE.Group;
  signature: string;
  pointLight?: THREE.PointLight;
  flameMesh?: THREE.Mesh;
}

interface AnnotationVisualEntry {
  group: THREE.Group;
  signature: string;
  crystalMesh?: THREE.Mesh;
}

// Pre-allocated scratch math helpers outside loop (zero GC)
const _mouse = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();
const _diceSpinAxis = new THREE.Vector3(1, 0.7, 0.5).normalize();
const _diceSpinQuat = new THREE.Quaternion();

function createBeveledTileCapGeometry(
  width = 0.99,
  height = BASE_THICKNESS,
  depth = 0.99,
  bevel = 0.022
): THREE.BufferGeometry {
  const hw = width / 2 - bevel;
  const hd = depth / 2 - bevel;
  const r = 0.03;
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.02, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();

  // Remap UVs cleanly into [0..1] based on top-down X/Z coordinates so 512px textures tile seamlessly
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const isTop = Math.abs(py) > height * 0.34;
    if (isTop) {
      uv.setXY(i, px / width + 0.5, pz / depth + 0.5);
    } else {
      uv.setXY(i, (px + pz) * 0.5 + 0.5, py / height + 0.5);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Cria a moldura/cursor com 4 cantoneiras angulares em L estilo Yu-Gi-Oh! Forbidden Memories
 */
function createYugiohCornerFrame(size = 1.0, color = 0xfbbf24): THREE.Group {
  const group = new THREE.Group();
  const half = (size * 0.98) / 2;
  const armLen = Math.min(0.28, size * 0.28);
  const thick = Math.min(0.045, size * 0.045);

  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const borderMat = new THREE.LineBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.55,
  });

  // Fundo suave do quadrado
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const innerPlane = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.96, size * 0.96), innerMat);
  innerPlane.rotation.x = -Math.PI / 2;
  innerPlane.position.y = 0.012;
  group.add(innerPlane);

  // Borda fina perimetral
  const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size * 0.98, size * 0.98));
  const borderLine = new THREE.LineSegments(edges, borderMat);
  borderLine.rotation.x = -Math.PI / 2;
  borderLine.position.y = 0.015;
  group.add(borderLine);

  // 4 Cantoneiras angulares em L estilo Yu-Gi-Oh Forbidden Memories
  const corners = [
    { cx: -half, cz: -half, sx: 1, sz: 1 },
    { cx: half, cz: -half, sx: -1, sz: 1 },
    { cx: -half, cz: half, sx: 1, sz: -1 },
    { cx: half, cz: half, sx: -1, sz: -1 },
  ];

  corners.forEach(({ cx, cz, sx, sz }) => {
    // Barra horizontal do L
    const hMesh = new THREE.Mesh(new THREE.PlaneGeometry(armLen, thick), mat);
    hMesh.rotation.x = -Math.PI / 2;
    hMesh.position.set(cx + (sx * armLen) / 2, 0.02, cz + (sz * thick) / 2);
    group.add(hMesh);

    // Barra vertical do L
    const vMesh = new THREE.Mesh(new THREE.PlaneGeometry(thick, armLen), mat);
    vMesh.rotation.x = -Math.PI / 2;
    vMesh.position.set(cx + (sx * thick) / 2, 0.02, cz + (sz * armLen) / 2);
    group.add(vMesh);
  });

  group.traverse((c) => {
    c.raycast = () => {};
    c.userData.isSelectionRing = true;
  });

  return group;
}

function setYugiohFrameColor(group: THREE.Group, colorHex: number) {
  group.traverse((c) => {
    if (c instanceof THREE.Mesh && c.material && 'color' in c.material) {
      (c.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
    }
  });
}

/**
 * Determina o setor cardeal em que a câmera está olhando no plano XZ (0 a 3).
 * 0: Norte (-Z)
 * 1: Leste (+X)
 * 2: Sul (+Z)
 * 3: Oeste (-X)
 */
function getCameraSector(camera: THREE.Camera): 0 | 1 | 2 | 3 {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  let angle = Math.atan2(dir.x, -dir.z); // -PI a +PI
  let deg = (angle * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return (Math.floor(((deg + 45) % 360) / 90) as 0 | 1 | 2 | 3);
}

/**
 * Converte a intenção de movimento relativa à tela (Cima/Baixo/Esquerda/Direita)
 * para o passo no grid discreto (dx, dz).
 * Em modo de edição ou em vista de topo (zenital), o eixo é rigorosamente FIXO:
 * Esquerda é sempre -X, Direita é +X, Cima é -Z, Baixo é +Z.
 * Desta forma, Esquerda NUNCA vai para baixo ou para cima.
 */
function getCameraRelativeGridStep(
  camera: THREE.Camera,
  screenDx: number, // -1: esquerda na tela, +1: direita na tela
  screenDz: number, // -1: para cima na tela, +1: para baixo na tela
  forceFixedAxis = false
): { dx: number; dz: number } {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);

  // Se a câmera estiver em vista de topo (olhando de cima para baixo: dir.y < -0.65)
  // ou se forceFixedAxis estiver ativo (editando mapa/adicionando coisas):
  // O eixo é 100% cartesiano fixo!
  if (forceFixedAxis || dir.y < -0.65) {
    return { dx: screenDx, dz: screenDz };
  }

  const sector = getCameraSector(camera);
  switch (sector) {
    case 0: // Olhando para o Norte (-Z): Cima = -Z, Baixo = +Z, Esq = -X, Dir = +X
      return { dx: screenDx, dz: screenDz };
    case 1: // Olhando para o Leste (+X): Cima = +X, Baixo = -X, Esq = -Z, Dir = +Z
      return { dx: -screenDz, dz: screenDx };
    case 2: // Olhando para o Sul (+Z): Cima = +Z, Baixo = -Z, Esq = +X, Dir = -X
      return { dx: -screenDx, dz: -screenDz };
    case 3: // Olhando para o Oeste (-X): Cima = -X, Baixo = +X, Esq = +Z, Dir = -Z
      return { dx: screenDz, dz: -screenDx };
  }
}

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export const TabletopViewport: React.FC<TabletopViewportProps> = ({
  roomState,
  role,
  gmLayer = 'all',
  userName,
  userColor,
  isLobby,
  toolMode,
  sculptBrush,
  annotationBrush,
  measureRule,
  measureSnap,
  localRuler,
  selectedMiniId,
  selectedAnnotationId,
  cameraCommand,
  onSelectMini,
  onSelectAnnotation,
  onMoveMini,
  onDeleteMini,
  onPaintTile,
  onSculptStrokeStart,
  onSculptStrokeEnd,
  onPlaceAnnotation,
  onLocalRulerChange,
  onHoverInfo,
  onOpenContextMenu,
  onDismissContextMenu,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  // Mutable refs for 60fps loop without recreating WebGLRenderer
  const propsRef = useRef({
    roomState,
    role,
    gmLayer,
    userName,
    userColor,
    isLobby,
    toolMode,
    sculptBrush,
    annotationBrush,
    measureRule,
    measureSnap,
    localRuler,
    selectedMiniId,
    selectedAnnotationId,
    onSelectMini,
    onSelectAnnotation,
    onMoveMini,
    onDeleteMini,
    onPaintTile,
    onSculptStrokeStart,
    onSculptStrokeEnd,
    onPlaceAnnotation,
    onLocalRulerChange,
    onHoverInfo,
    onOpenContextMenu,
    onDismissContextMenu,
  });
  propsRef.current = {
    roomState,
    role,
    gmLayer,
    userName,
    userColor,
    isLobby,
    toolMode,
    sculptBrush,
    annotationBrush,
    measureRule,
    measureSnap,
    localRuler,
    selectedMiniId,
    selectedAnnotationId,
    onSelectMini,
    onSelectAnnotation,
    onMoveMini,
    onDeleteMini,
    onPaintTile,
    onSculptStrokeStart,
    onSculptStrokeEnd,
    onPlaceAnnotation,
    onLocalRulerChange,
    onHoverInfo,
    onOpenContextMenu,
    onDismissContextMenu,
  };

  const sceneSyncRef = useRef<{
    syncTiles: (state: RoomState) => void;
    syncMinis: (state: RoomState) => void;
    syncAnnotations: (state: RoomState, activeRole: Role, activeAnnId: string | null) => void;
    syncLocalRuler: (coords: RulerLineCoords | null, rule: MeasureRule, color: string) => void;
    syncRemoteRulers: (rulers: Record<string, RulerMeasurement> | undefined) => void;
    syncDiceRolls: (rolls: DiceRollEvent[], state: RoomState) => void;
    applyCameraPreset: (preset: CameraPreset) => void;
    updateSelectionVisuals: (selectedId: string | null) => void;
    updateLayerVisuals: (layer: 'all' | 'characters' | 'props') => void;
    focusOnMini: (miniId: string) => void;
  } | null>(null);

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
      setRenderKey((k) => k + 1);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1015);
    scene.fog = new THREE.FogExp2(0x0d1015, 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const aspect = (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight);
    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 160);
    camera.position.set(17, 14.5, 19);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 5;
    controls.maxDistance = 36;
    controls.maxPolarAngle = Math.PI / 2.18;
    controls.target.set(7.5, 0.5, 7.5);
    controls.update();

    // Camera transition state (cancelled immediately on manual OrbitControls start)
    let cameraTargetPos: THREE.Vector3 | null = null;
    let cameraTargetLook: THREE.Vector3 | null = null;

    controls.addEventListener('start', () => {
      cameraTargetPos = null;
      cameraTargetLook = null;
    });

    // 3-Point TaleSpire Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0x88b0e6, 0x261e1a, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff0d6, 1.85);
    keyLight.position.set(16, 22, 14);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 55;
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    keyLight.target.position.set(7.5, 0, 7.5);
    scene.add(keyLight.target);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6da4e8, 0.7);
    rimLight.position.set(-10, 11, -12);
    scene.add(rimLight);

    // Procedural Textures
    const textures: ProceduralTexturePack = createProceduralTextures(
      renderer.capabilities.getMaxAnisotropy()
    );

    // Physical Wooden Tabletop Frame around the 16x16 slab
    const tableGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({
      map: textures.tableWoodMap,
      roughness: 0.74,
      metalness: 0.08,
    });
    const brassFrameMat = new THREE.MeshStandardMaterial({
      color: 0xb98532,
      roughness: 0.3,
      metalness: 0.88,
    });
    const innerBed = new THREE.Mesh(
      new THREE.BoxGeometry(16.2, 0.3, 16.2),
      new THREE.MeshStandardMaterial({ color: 0x13171e, roughness: 0.9, metalness: 0.05 })
    );
    innerBed.position.set(7.5, -0.16, 7.5);
    innerBed.receiveShadow = true;
    tableGroup.add(innerBed);

    // 4 Beveled Wooden Borders
    const borderN = new THREE.Mesh(new THREE.BoxGeometry(17.4, 0.42, 0.6), frameMat);
    borderN.position.set(7.5, -0.1, -0.8);
    const borderS = borderN.clone();
    borderS.position.set(7.5, -0.1, 15.8);
    const borderW = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 16.2), frameMat);
    borderW.position.set(-0.8, -0.1, 7.5);
    const borderE = borderW.clone();
    borderE.position.set(15.8, -0.1, 7.5);
    tableGroup.add(borderN, borderS, borderW, borderE);

    // 4 Brass Corner Brackets + Inner Dark Slate Trim
    const cornerGeo = new THREE.BoxGeometry(0.76, 0.46, 0.76);
    [
      [-0.8, -0.8],
      [15.8, -0.8],
      [-0.8, 15.8],
      [15.8, 15.8],
    ].forEach(([cx, cz]) => {
      const c = new THREE.Mesh(cornerGeo, brassFrameMat);
      c.position.set(cx, -0.09, cz);
      tableGroup.add(c);
    });
    scene.add(tableGroup);

    // Subtle Atmospheric Floating Ember / Dust Motes (90 lightweight particles)
    const moteCount = 90;
    const motePositions = new Float32Array(moteCount * 3);
    const moteSeeds = new Float32Array(moteCount * 2);
    for (let i = 0; i < moteCount; i++) {
      motePositions[i * 3] = ((i * 73) % 160) / 10 - 0.5;
      motePositions[i * 3 + 1] = 0.4 + ((i * 37) % 32) / 10;
      motePositions[i * 3 + 2] = ((i * 113) % 160) / 10 - 0.5;
      moteSeeds[i * 2] = (i * 1.37) % (Math.PI * 2);
      moteSeeds[i * 2 + 1] = 0.25 + ((i * 17) % 10) * 0.04;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
    const moteMat = new THREE.PointsMaterial({
      map: textures.emberMap,
      size: 0.14,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const motePoints = new THREE.Points(moteGeo, moteMat);
    scene.add(motePoints);

    // Subtle Grid Lines overlay (polygonOffset to prevent Z-fighting)
    const gridHelper = new THREE.GridHelper(16, 16, 0x3b4252, 0x262c38);
    gridHelper.position.set(7.5, 0.015, 7.5);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.28;
    scene.add(gridHelper);

    // Dynamic Scene Containers
    const tilesRoot = new THREE.Group();
    const minisRoot = new THREE.Group();
    const annotationsRoot = new THREE.Group();
    const raycastFloorPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    raycastFloorPlane.rotation.x = -Math.PI / 2;
    raycastFloorPlane.position.set(7.5, 0, 7.5);
    scene.add(tilesRoot, minisRoot, annotationsRoot, raycastFloorPlane);

    // Cursor de Seleção do Grid Estilo Yu-Gi-Oh! Forbidden Memories
    const hoverCursor = createYugiohCornerFrame(1.0, 0xfbbf24);
    hoverCursor.visible = false;
    scene.add(hoverCursor);

    const pathLineGeo = new THREE.BufferGeometry();
    const pathLineMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.24,
      gapSize: 0.14,
      transparent: true,
      opacity: 0.9,
    });
    const pathLine = new THREE.Line(pathLineGeo, pathLineMat);
    pathLine.visible = false;
    scene.add(pathLine);

    // ========================================================================
    // 🌟 Feixe de Luz 3D & Holofote do Turno da Iniciativa
    // ========================================================================
    const turnHighlightGroup = new THREE.Group();
    turnHighlightGroup.visible = false;

    // Holofote Direcional de Cima para Baixo
    const turnSpotLight = new THREE.SpotLight(0xfff3a1, 5.5, 14, Math.PI / 6.5, 0.45, 1.2);
    turnSpotLight.castShadow = !isSoftwareGl;
    turnSpotLight.position.set(0, 3.8, 0);
    const turnLightTarget = new THREE.Object3D();
    turnSpotLight.target = turnLightTarget;
    turnHighlightGroup.add(turnSpotLight);
    turnHighlightGroup.add(turnLightTarget);

    // Luz de preenchimento suave ao redor da miniatura
    const turnPointLight = new THREE.PointLight(0xfbbf24, 2.2, 5, 1.5);
    turnPointLight.position.set(0, 1.1, 0);
    turnHighlightGroup.add(turnPointLight);

    // Feixe volumétrico de luz translúcido descendo do céu
    const beamGeo = new THREE.CylinderGeometry(0.22, 0.85, 3.8, 32, 1, true);
    beamGeo.translate(0, 1.9, 0); // Base no chão (y = 0) até o topo (y = 3.8)
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffea75,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const turnBeamMesh = new THREE.Mesh(beamGeo, beamMat);
    turnHighlightGroup.add(turnBeamMesh);

    // Anel / Halo no chão pulsante e giratório
    const turnHaloGeo = new THREE.RingGeometry(0.55, 0.72, 32);
    turnHaloGeo.rotateX(-Math.PI / 2);
    const turnHaloMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const turnHaloMesh = new THREE.Mesh(turnHaloGeo, turnHaloMat);
    turnHaloMesh.position.y = 0.02;
    turnHighlightGroup.add(turnHaloMesh);

    // Anel interno giratório secundário
    const turnInnerHaloGeo = new THREE.RingGeometry(0.35, 0.45, 24);
    turnInnerHaloGeo.rotateX(-Math.PI / 2);
    const turnInnerHaloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const turnInnerHaloMesh = new THREE.Mesh(turnInnerHaloGeo, turnInnerHaloMat);
    turnInnerHaloMesh.position.y = 0.022;
    turnHighlightGroup.add(turnInnerHaloMesh);

    // Marcador flutuante em forma de diamante / gema sobre a cabeça da miniatura
    const gemGeo = new THREE.OctahedronGeometry(0.18, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.8,
    });
    const turnGemMesh = new THREE.Mesh(gemGeo, gemMat);
    turnHighlightGroup.add(turnGemMesh);

    scene.add(turnHighlightGroup);

    // ========================================================================
    // 🎙️ Aura Sonora de Fala em Tempo Real (quando jogador/mestre fala pelo personagem)
    // ========================================================================
    const voiceAuraGroup = new THREE.Group();
    voiceAuraGroup.visible = false;

    // Anel externo de onda sonora expansiva
    const voiceRingGeo = new THREE.RingGeometry(0.48, 0.62, 32);
    voiceRingGeo.rotateX(-Math.PI / 2);
    const voiceRingMat = new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const voiceRingMesh = new THREE.Mesh(voiceRingGeo, voiceRingMat);
    voiceRingMesh.position.y = 0.05;
    voiceAuraGroup.add(voiceRingMesh);

    // Segundo anel pulsante menor (eco)
    const voiceEcoGeo = new THREE.RingGeometry(0.32, 0.44, 32);
    voiceEcoGeo.rotateX(-Math.PI / 2);
    const voiceEcoMat = new THREE.MeshBasicMaterial({
      color: 0x6ee7b7,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const voiceEcoMesh = new THREE.Mesh(voiceEcoGeo, voiceEcoMat);
    voiceEcoMesh.position.y = 0.07;
    voiceAuraGroup.add(voiceEcoMesh);

    // Luz esmeralda suave ao redor do personagem enquanto fala
    const voiceLight = new THREE.PointLight(0x34d399, 2.5, 4.5, 1.8);
    voiceLight.position.set(0, 0.8, 0);
    voiceAuraGroup.add(voiceLight);

    scene.add(voiceAuraGroup);

    // 3D Distance Measurement Rulers (Local + Remote Participants)
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const localRulerVisual = createRulerVisual('#22d3ee', maxAniso, true);
    scene.add(localRulerVisual.group);
    const remoteRulersRoot = new THREE.Group();
    scene.add(remoteRulersRoot);
    const remoteRulerVisuals = new Map<string, RulerVisualHandle>();

    // Physical 3D Dice Root & Simulation Entries
    const diceRoot = new THREE.Group();
    scene.add(diceRoot);
    interface ActiveDieEntry {
      id: string;
      visual: DieVisualInstance;
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      spinSpeed: number;
      spinAxis: THREE.Vector3;
      bounces: number;
      settled: boolean;
      age: number;
      maxAge: number;
    }
    const activeDice: ActiveDieEntry[] = [];
    const seenRollIds = new Set<string>();
    let lastDiceRoomId = '';

    // Shared Tile Geometries & Materials (Beveled TaleSpire Slabs + Textured Cliffs)
    const unitBoxGeo = new THREE.BoxGeometry(0.97, 1, 0.97);
    const topCapGeo = createBeveledTileCapGeometry(0.99, BASE_THICKNESS, 0.99, 0.02);
    const terrainMaterials: Record<TerrainKind, THREE.MeshStandardMaterial> = {
      void: new THREE.MeshStandardMaterial({ visible: false }),
      stone: new THREE.MeshStandardMaterial({
        map: textures.stoneMap,
        bumpMap: textures.stoneBump,
        bumpScale: 0.032,
        roughness: 0.82,
        metalness: 0.07,
      }),
      cobble: new THREE.MeshStandardMaterial({
        map: textures.cobbleMap,
        bumpMap: textures.cobbleBump,
        bumpScale: 0.038,
        roughness: 0.85,
        metalness: 0.06,
      }),
      wood: new THREE.MeshStandardMaterial({
        map: textures.woodMap,
        bumpMap: textures.woodBump,
        bumpScale: 0.028,
        roughness: 0.72,
        metalness: 0.05,
      }),
      grass: new THREE.MeshStandardMaterial({
        map: textures.grassMap,
        bumpMap: textures.grassBump,
        bumpScale: 0.035,
        roughness: 0.88,
        metalness: 0.02,
      }),
      water: new THREE.MeshPhysicalMaterial({
        color: 0x16658a,
        roughness: 0.08,
        metalness: 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        transparent: true,
        opacity: 0.82,
      }),
      lava: new THREE.MeshStandardMaterial({
        map: textures.lavaMap,
        emissive: new THREE.Color(0xea580c),
        emissiveMap: textures.lavaMap,
        emissiveIntensity: 1.4,
        roughness: 0.65,
        metalness: 0.1,
      }),
    };
    const cliffSideMat = new THREE.MeshStandardMaterial({
      map: textures.cliffMap,
      bumpMap: textures.cliffBump,
      bumpScale: 0.035,
      roughness: 0.88,
      metalness: 0.06,
    });

    const tileEntries = new Map<string, TileVisualEntry>();
    const miniEntries = new Map<string, MiniVisualEntry>();
    const annotationEntries = new Map<string, AnnotationVisualEntry>();
    const tileRaycastTargets: THREE.Object3D[] = [raycastFloorPlane];

    const rebuildTileRaycastTargets = () => {
      tileRaycastTargets.length = 0;
      tileRaycastTargets.push(raycastFloorPlane);
      tileEntries.forEach((entry) => {
        tileRaycastTargets.push(entry.group);
      });
    };

    const syncTiles = (state: RoomState) => {
      const seen = new Set<string>();
      for (const [key, cell] of Object.entries(state.tiles)) {
        seen.add(key);
        const sig = `${cell.terrain}:${cell.elevation}:${cell.prop}:${cell.propRotation}`;
        const existing = tileEntries.get(key);
        if (existing && existing.signature === sig) continue;

        if (existing) {
          tilesRoot.remove(existing.group);
          tileEntries.delete(key);
        }

        if (cell.terrain === 'void') continue;

        const group = new THREE.Group();
        group.position.set(cell.x, 0, cell.z);
        group.userData = { gridX: cell.x, gridZ: cell.z };

        const elevHeight = cell.elevation * ELEVATION_STEP;
        if (elevHeight > 0.01) {
          const cliff = new THREE.Mesh(unitBoxGeo, cliffSideMat);
          cliff.scale.set(1, elevHeight, 1);
          cliff.position.y = elevHeight / 2;
          cliff.castShadow = true;
          cliff.receiveShadow = true;
          cliff.userData = { gridX: cell.x, gridZ: cell.z };
          group.add(cliff);
        }

        const isLiquid = cell.terrain === 'water' || cell.terrain === 'lava';
        const cap = new THREE.Mesh(topCapGeo, terrainMaterials[cell.terrain]);
        cap.scale.set(1, isLiquid ? 0.45 : 1, 1);
        cap.position.y = elevHeight + (isLiquid ? 0.032 : BASE_THICKNESS / 2);
        cap.receiveShadow = true;
        cap.castShadow = !isLiquid && cell.elevation > 0;
        cap.userData = { gridX: cell.x, gridZ: cell.z };
        group.add(cap);

        let pointLight: THREE.PointLight | undefined;
        let flameMesh: THREE.Mesh | undefined;

        if (cell.prop && cell.prop !== 'none') {
          const propBuilt = createTerrainProp(cell.prop, {
            stoneMap: textures.stoneMap,
            woodMap: textures.woodMap,
          });
          propBuilt.group.position.y = elevHeight + BASE_THICKNESS;
          propBuilt.group.rotation.y = (cell.propRotation || 0) * (Math.PI / 2);
          propBuilt.group.traverse((child) => {
            child.userData = { gridX: cell.x, gridZ: cell.z };
          });
          group.add(propBuilt.group);
          pointLight = propBuilt.pointLight;
          flameMesh = propBuilt.flameMesh;
        }

        tilesRoot.add(group);
        tileEntries.set(key, { group, signature: sig, pointLight, flameMesh });
      }

      for (const [key, entry] of tileEntries.entries()) {
        if (!seen.has(key)) {
          tilesRoot.remove(entry.group);
          tileEntries.delete(key);
        }
      }

      rebuildTileRaycastTargets();
    };

    const getSurfaceYForCoord = (state: RoomState | null, gx: number, gz: number) => {
      if (!state) return BASE_THICKNESS;
      const rx = Math.round(gx);
      const rz = Math.round(gz);
      const cell = state.tiles[tileKey(rx, rz)];
      return getTileSurfaceY(cell);
    };

    const getElevationForCoord = (state: RoomState | null, gx: number, gz: number) => {
      if (!state) return 0;
      const cell = state.tiles[tileKey(Math.round(gx), Math.round(gz))];
      return cell && cell.terrain !== 'void' ? cell.elevation : 0;
    };

    const buildMiniGroup = async (mini: MiniatureData, containerGroup: THREE.Group) => {
      const buildToken = (Number(containerGroup.userData.buildToken) || 0) + 1;
      containerGroup.userData.buildToken = buildToken;

      // Clear previous children except selectionRing
      for (let i = containerGroup.children.length - 1; i >= 0; i--) {
        const ch = containerGroup.children[i];
        if (!ch.userData.isSelectionRing) {
          containerGroup.remove(ch);
        }
      }

      const shadow = createContactShadow(textures.contactShadowMap, mini.footprint);
      shadow.userData.isShadow = true;
      shadow.raycast = () => {};
      containerGroup.add(shadow);

      // Invisible cylinder click hitbox to make clicking thin 3D models 100% reliable
      const hitboxRadius = Math.max(0.36, mini.footprint * TILE_SIZE * 0.44);
      const hitboxHeight = Math.max(1.4, mini.footprint * 1.6);
      const hitboxGeo = new THREE.CylinderGeometry(hitboxRadius, hitboxRadius, hitboxHeight, 16);
      const hitboxMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false });
      const hitbox = new THREE.Mesh(hitboxGeo, hitboxMat);
      hitbox.position.y = hitboxHeight / 2;
      hitbox.userData.miniId = mini.id;
      hitbox.userData.isHitbox = true;
      containerGroup.add(hitbox);

      if (mini.showBase && !mini.isPropOnly && mini.format !== 'image') {
        const base = createMiniBase(mini.footprint, mini.color, mini.baseStyle || 'rune');
        containerGroup.add(base);
      }

      if (mini.format === 'builtin') {
        const fig = createBuiltinMiniature(
          mini.builtinKind || 'paladin',
          mini.finish,
          mini.color,
          mini.footprint,
          textures.resinBump
        );
        fig.scale.multiplyScalar(mini.scaleMultiplier || 1);
        containerGroup.add(fig);
      } else if (mini.format === 'image' && (mini.assetId || mini.remoteUrl)) {
        const loadingDisc = new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.4 * mini.footprint * TILE_SIZE,
            0.4 * mini.footprint * TILE_SIZE,
            0.06,
            24
          ),
          new THREE.MeshStandardMaterial({
            color: mini.color || '#d97706',
            roughness: 0.4,
            metalness: 0.6,
          })
        );
        loadingDisc.position.y = 0.035;
        containerGroup.add(loadingDisc);

        try {
          const cacheKey = mini.remoteUrl || mini.assetId || mini.id;
          const buf = await fetchAssetBuffer(mini.assetId, mini.remoteUrl);
          if (containerGroup.userData.buildToken !== buildToken) return;
          const tazoGroup = await createTazoTokenGroup(buf, cacheKey, {
            footprint: mini.footprint,
            scaleMultiplier: mini.scaleMultiplier,
            color: mini.color,
            finish: mini.finish,
          });
          if (containerGroup.userData.buildToken !== buildToken) return;
          containerGroup.remove(loadingDisc);
          containerGroup.add(tazoGroup);
          containerGroup.traverse((child) => {
            child.userData.miniId = mini.id;
          });
        } catch (err) {
          console.error('Erro ao carregar Tazo de imagem:', err);
        }
      } else if (mini.assetId || mini.remoteUrl) {
        const loadingPlaceholder = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.24 * mini.footprint, 0),
          new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 0.9,
            wireframe: true,
          })
        );
        loadingPlaceholder.position.y = 0.45 * mini.footprint;
        containerGroup.add(loadingPlaceholder);

        try {
          const cacheKey = mini.remoteUrl || mini.assetId;
          const buf = await fetchAssetBuffer(mini.assetId, mini.remoteUrl);
          if (containerGroup.userData.buildToken !== buildToken) return;
          const rawObj = await parseRawModel(mini.format, buf, cacheKey);
          if (containerGroup.userData.buildToken !== buildToken) return;
          containerGroup.remove(loadingPlaceholder);
          const { normalizedRoot } = normalizeAndDimensionModel(rawObj, {
            footprint: mini.footprint,
            scaleMultiplier: mini.scaleMultiplier,
            fixZUp: mini.fixZUp,
            showBase: mini.showBase,
            finish: mini.finish,
            color: mini.color,
            isPropOnly: mini.isPropOnly,
            resinBump: textures.resinBump,
            stoneMap: textures.chessStoneMap,
            stoneBump: textures.chessStoneBump,
          });
          containerGroup.add(normalizedRoot);
          containerGroup.traverse((child) => {
            child.userData.miniId = mini.id;
          });
        } catch (err) {
          console.error('Erro ao carregar miniatura 3D:', err);
          if (containerGroup.userData.buildToken !== buildToken) return;
          containerGroup.remove(loadingPlaceholder);
          const fallback = createBuiltinMiniature(
            'paladin',
            mini.finish,
            mini.color,
            mini.footprint,
            textures.resinBump
          );
          containerGroup.add(fallback);
          containerGroup.traverse((child) => {
            child.userData.miniId = mini.id;
          });
        }
      }

      containerGroup.traverse((child) => {
        child.userData.miniId = mini.id;
      });
    };

    const syncMinis = (state: RoomState) => {
      const seen = new Set<string>();
      for (const [id, mini] of Object.entries(state.miniatures)) {
        seen.add(id);
        const visualSig = `${mini.format}:${mini.builtinKind}:${mini.assetId}:${mini.remoteUrl || ''}:${mini.footprint}:${mini.scaleMultiplier}:${mini.fixZUp}:${mini.showBase}:${mini.baseStyle || 'rune'}:${mini.color}:${mini.finish}:${mini.isPropOnly}`;
        const targetY = getSurfaceYForCoord(state, mini.x, mini.z);

        const existing = miniEntries.get(id);
        if (existing) {
          const moved =
            Math.abs(existing.targetX - mini.x) > 0.01 ||
            Math.abs(existing.targetZ - mini.z) > 0.01;
          existing.targetX = mini.x;
          existing.targetZ = mini.z;
          existing.targetY = targetY;
          existing.targetRotY = mini.rotationY;
          if (moved) existing.hopProgress = 0;

          if (existing.signature !== visualSig) {
            existing.signature = visualSig;
            existing.group.remove(existing.selectionRing);
            const isProp = Boolean(mini.isPropOnly);
            const selectionRing = createYugiohCornerFrame(mini.footprint * TILE_SIZE, isProp ? 0x10b981 : 0xfbbf24);
            selectionRing.visible = propsRef.current.selectedMiniId === id;
            selectionRing.userData.isSelectionRing = true;
            existing.selectionRing = selectionRing;
            existing.group.add(selectionRing);
            buildMiniGroup(mini, existing.group);
          }
        } else {
          const group = new THREE.Group();
          group.position.set(mini.x, targetY, mini.z);
          group.rotation.y = mini.rotationY;

          const isProp = Boolean(mini.isPropOnly);
          const selectionRing = createYugiohCornerFrame(mini.footprint * TILE_SIZE, isProp ? 0x10b981 : 0xfbbf24);
          selectionRing.visible = propsRef.current.selectedMiniId === id;
          selectionRing.userData.isSelectionRing = true;
          group.add(selectionRing);

          minisRoot.add(group);
          const entry: MiniVisualEntry = {
            group,
            targetX: mini.x,
            targetZ: mini.z,
            targetY,
            targetRotY: mini.rotationY,
            hopProgress: 1,
            signature: visualSig,
            selectionRing,
          };
          miniEntries.set(id, entry);
          buildMiniGroup(mini, group);
        }
      }

      for (const [id, entry] of miniEntries.entries()) {
        if (!seen.has(id)) {
          minisRoot.remove(entry.group);
          miniEntries.delete(id);
        }
      }
    };

    const syncAnnotations = (
      state: RoomState,
      activeRole: Role,
      activeAnnId: string | null
    ) => {
      const seen = new Set<string>();
      const maxAniso = renderer.capabilities.getMaxAnisotropy();

      for (const [id, ann] of Object.entries(state.annotations || {})) {
        if (activeRole === 'player' && ann.gmOnly) continue;
        seen.add(id);

        const isSel = activeAnnId === id;
        const surfY = getSurfaceYForCoord(state, ann.x, ann.z);
        const sig = `${ann.kind}:${ann.x}:${ann.z}:${surfY}:${ann.radius}:${ann.rotationY}:${ann.color}:${ann.label}:${ann.gmOnly}:${isSel}`;

        const existing = annotationEntries.get(id);
        if (existing && existing.signature === sig) continue;

        if (existing) {
          annotationsRoot.remove(existing.group);
          annotationEntries.delete(id);
        }

        const built = createAnnotationVisual(ann, maxAniso, isSel);
        built.group.position.set(ann.x, surfY, ann.z);
        built.group.traverse((child) => {
          child.userData.annotationId = id;
        });
        annotationsRoot.add(built.group);
        annotationEntries.set(id, {
          group: built.group,
          signature: sig,
          crystalMesh: built.crystalMesh,
        });
      }

      for (const [id, entry] of annotationEntries.entries()) {
        if (!seen.has(id)) {
          annotationsRoot.remove(entry.group);
          annotationEntries.delete(id);
        }
      }
    };

    const syncLocalRuler = (
      coords: RulerLineCoords | null,
      rule: MeasureRule,
      color: string
    ) => {
      if (!coords) {
        localRulerVisual.setVisible(false);
        return;
      }
      const rs = propsRef.current.roomState;
      const getSurf = (gx: number, gz: number) => getSurfaceYForCoord(rs, gx, gz);
      localRulerVisual.setVisible(true);
      localRulerVisual.update({
        startX: coords.startX,
        startZ: coords.startZ,
        startY: getSurf(coords.startX, coords.startZ),
        endX: coords.endX,
        endZ: coords.endZ,
        endY: getSurf(coords.endX, coords.endZ),
        startElev: getElevationForCoord(rs, coords.startX, coords.startZ),
        endElev: getElevationForCoord(rs, coords.endX, coords.endZ),
        rule,
        color: color || '#22d3ee',
        getSurfaceY: getSurf,
      });
    };

    const syncRemoteRulers = (rulers: Record<string, RulerMeasurement> | undefined) => {
      const activeIds = new Set<string>();
      const rs = propsRef.current.roomState;
      const getSurf = (gx: number, gz: number) => getSurfaceYForCoord(rs, gx, gz);

      if (rulers) {
        for (const [uid, r] of Object.entries(rulers)) {
          if (!r.active) continue;
          activeIds.add(uid);
          let handle = remoteRulerVisuals.get(uid);
          if (!handle) {
            handle = createRulerVisual(r.color || '#38bdf8', maxAniso, false);
            remoteRulerVisuals.set(uid, handle);
            remoteRulersRoot.add(handle.group);
          }
          handle.setVisible(true);
          handle.update({
            startX: r.startX,
            startZ: r.startZ,
            startY: getSurf(r.startX, r.startZ),
            endX: r.endX,
            endZ: r.endZ,
            endY: getSurf(r.endX, r.endZ),
            startElev: getElevationForCoord(rs, r.startX, r.startZ),
            endElev: getElevationForCoord(rs, r.endX, r.endZ),
            rule: r.rule,
            color: r.color || '#38bdf8',
            ownerLabel: r.userName,
            getSurfaceY: getSurf,
          });
        }
      }

      for (const [uid, handle] of remoteRulerVisuals.entries()) {
        if (!activeIds.has(uid)) {
          remoteRulersRoot.remove(handle.group);
          handle.dispose();
          remoteRulerVisuals.delete(uid);
        }
      }
    };

    const syncDiceRolls = (rolls: DiceRollEvent[], state: RoomState) => {
      if (state.roomId !== lastDiceRoomId) {
        lastDiceRoomId = state.roomId;
        seenRollIds.clear();
        while (activeDice.length > 0) {
          const old = activeDice.shift()!;
          diceRoot.remove(old.visual.group);
          old.visual.dispose();
        }
        for (const r of rolls) {
          if (Date.now() - r.timestamp > 10000) {
            seenRollIds.add(r.id);
          }
        }
      }

      const freshRolls = (rolls || []).slice(0, 4).filter((r) => !seenRollIds.has(r.id));
      for (const roll of freshRolls.reverse()) {
        seenRollIds.add(roll.id);
        const yawJitter = (Math.random() - 0.5) * 0.9;
        const visual = create3DDieInstance(roll, maxAniso, yawJitter);

        const baseCenterX = Math.max(3, Math.min(12, controls.target.x));
        const baseCenterZ = Math.max(3, Math.min(12, controls.target.z));
        const targetX = Math.max(1.5, Math.min(13.5, baseCenterX + (Math.random() - 0.5) * 3.0));
        const targetZ = Math.max(1.5, Math.min(13.5, baseCenterZ + (Math.random() - 0.5) * 3.0));
        const vx = (Math.random() - 0.5) * 3.4;
        const vz = (Math.random() - 0.5) * 3.4;
        const startX = Math.max(1, Math.min(14, targetX - vx * 0.55));
        const startZ = Math.max(1, Math.min(14, targetZ - vz * 0.55));
        const surfY = getSurfaceYForCoord(state, startX, startZ);
        const startY = surfY + 3.1 + Math.random() * 0.5;

        visual.dieMesh.quaternion.setFromEuler(
          new THREE.Euler(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
          )
        );
        visual.group.position.set(startX, 0, startZ);
        visual.dieMesh.position.y = startY;
        visual.shadowMesh.position.y = surfY + 0.014;
        visual.badgeSprite.position.y = surfY + visual.restingOffsetY + 0.62;

        diceRoot.add(visual.group);
        activeDice.push({
          id: roll.id,
          visual,
          x: startX,
          y: startY,
          z: startZ,
          vx,
          vy: -1.4,
          vz,
          spinSpeed: 10 + Math.random() * 6,
          spinAxis: new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
          ).normalize(),
          bounces: 0,
          settled: false,
          age: 0,
          maxAge: 7.5,
        });

        while (activeDice.length > 6) {
          const oldest = activeDice.shift()!;
          diceRoot.remove(oldest.visual.group);
          oldest.visual.dispose();
        }
      }
    };

    const updateSelectionVisuals = (selectedId: string | null) => {
      miniEntries.forEach((entry, id) => {
        entry.selectionRing.visible = id === selectedId;
      });
    };

    const focusOnMini = (miniId: string) => {
      const rs = propsRef.current.roomState;
      const mini = rs?.miniatures[miniId];
      if (!mini) return;
      const surfY = getSurfaceYForCoord(rs, mini.x, mini.z);
      cameraTargetLook = new THREE.Vector3(mini.x, surfY + 0.35, mini.z);
      cameraTargetPos = new THREE.Vector3(mini.x + 3.8, surfY + 4.5, mini.z + 4.8);
    };

    const applyCameraPreset = (preset: CameraPreset) => {
      if (preset === 'top') {
        cameraTargetPos = new THREE.Vector3(7.5, 23, 7.505);
        cameraTargetLook = new THREE.Vector3(7.5, 0, 7.5);
      } else if (preset === 'dramatic') {
        cameraTargetPos = new THREE.Vector3(14.5, 6.8, 15.8);
        cameraTargetLook = new THREE.Vector3(7.5, 1.2, 6.2);
      } else {
        cameraTargetPos = new THREE.Vector3(17, 14.5, 19);
        cameraTargetLook = new THREE.Vector3(7.5, 0.5, 7.5);
      }
    };

    const updateLayerVisuals = (layer: 'all' | 'characters' | 'props') => {
      const rs = propsRef.current.roomState;
      if (!rs) return;

      for (const [id, entry] of miniEntries.entries()) {
        const mini = rs.miniatures[id];
        if (!mini) continue;
        const isProp = Boolean(mini.isPropOnly);
        const isDimmed =
          (layer === 'props' && !isProp) ||
          (layer === 'characters' && isProp);

        const targetOpacity = isDimmed ? 0.32 : 1.0;

        entry.group.traverse((child) => {
          if (
            (child as THREE.Mesh).isMesh &&
            !child.userData?.isSelectionRing &&
            !child.userData?.isHalo &&
            !child.userData?.isShadow
          ) {
            const mesh = child as THREE.Mesh;
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((mat) => {
                if (isDimmed) {
                  mat.transparent = true;
                  mat.opacity = 0.32;
                } else {
                  mat.opacity = 1.0;
                  mat.transparent = Boolean((mat as any).map || (mat as any).alphaMap);
                }
              });
            } else if (mesh.material) {
              const mat = mesh.material;
              if (isDimmed) {
                mat.transparent = true;
                mat.opacity = 0.32;
              } else {
                mat.opacity = 1.0;
                mat.transparent = Boolean((mat as any).map || (mat as any).alphaMap);
              }
            }
          }
        });
      }
    };

    sceneSyncRef.current = {
      syncTiles,
      syncMinis,
      syncAnnotations,
      syncLocalRuler,
      syncRemoteRulers,
      syncDiceRolls,
      applyCameraPreset,
      updateSelectionVisuals,
      updateLayerVisuals,
      focusOnMini,
    };

    if (propsRef.current.roomState) {
      syncTiles(propsRef.current.roomState);
      syncMinis(propsRef.current.roomState);
      syncAnnotations(
        propsRef.current.roomState,
        propsRef.current.role,
        propsRef.current.selectedAnnotationId
      );
      syncRemoteRulers(propsRef.current.roomState.rulers);
      syncDiceRolls(propsRef.current.roomState.recentRolls || [], propsRef.current.roomState);
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycasting & Pointer Interaction
    let pointerDownPos = { x: 0, y: 0 };
    let rightDownPos = { x: 0, y: 0 };
    let isPainting = false;
    let isMeasuring = false;
    let measureStart: { x: number; z: number } | null = null;
    let lastMeasureEndKey = '';
    let lastPaintedKey = '';
    let lastHoverTime = 0;
    let lastActiveCell: { x: number; z: number } | null = null;

    const updateMouseFromEvent = (e: { clientX: number; clientY: number }) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const raycastGridCell = (): { x: number; z: number; y: number } | null => {
      _raycaster.setFromCamera(_mouse, camera);
      const hits = _raycaster.intersectObjects(tileRaycastTargets, true);
      if (hits.length === 0) return null;

      for (const hit of hits) {
        if (typeof hit.object.userData?.gridX === 'number') {
          const gx = hit.object.userData.gridX;
          const gz = hit.object.userData.gridZ;
          return {
            x: gx,
            z: gz,
            y: getSurfaceYForCoord(propsRef.current.roomState, gx, gz),
          };
        }
      }
      // Fallback to floor plane
      const floorHit = hits.find((h) => h.object === raycastFloorPlane);
      if (floorHit) {
        const gx = Math.max(0, Math.min(15, Math.round(floorHit.point.x)));
        const gz = Math.max(0, Math.min(15, Math.round(floorHit.point.z)));
        return {
          x: gx,
          z: gz,
          y: getSurfaceYForCoord(propsRef.current.roomState, gx, gz),
        };
      }
      return null;
    };

    const raycastMeasurePoint = (
      snapToGrid: boolean
    ): { x: number; z: number; y: number } | null => {
      _raycaster.setFromCamera(_mouse, camera);
      const hits = _raycaster.intersectObjects(tileRaycastTargets, true);
      if (hits.length === 0) return null;

      if (snapToGrid) {
        const cell = raycastGridCell();
        return cell;
      }

      // Exact/quarter-cell sub-grid precision
      const pt = hits[0].point;
      const sx = Math.max(0, Math.min(15.5, Math.round(pt.x * 4) / 4));
      const sz = Math.max(0, Math.min(15.5, Math.round(pt.z * 4) / 4));
      return {
        x: sx,
        z: sz,
        y: getSurfaceYForCoord(propsRef.current.roomState, sx, sz),
      };
    };

    const paintCellAt = (gx: number, gz: number) => {
      lastActiveCell = { x: gx, z: gz };
      const { sculptBrush: brush, onPaintTile: emitPaint } = propsRef.current;
      const cell: TileCell = brush.erase
        ? { x: gx, z: gz, terrain: 'void', elevation: 0, prop: 'none', propRotation: 0 }
        : {
            x: gx,
            z: gz,
            terrain: brush.terrain,
            elevation: brush.elevation,
            prop: brush.prop,
            propRotation: brush.propRotation,
          };
      emitPaint(cell);
      audioSynth.playTilePlace();
    };

    const canUserControlMini = (mini: MiniatureData): boolean => {
      const { role: r, userName: u, gmLayer = 'all' } = propsRef.current;
      if (r === 'gm') {
        if (gmLayer === 'characters' && mini.isPropOnly) return false;
        if (gmLayer === 'props' && !mini.isPropOnly) return false;
        return true;
      }
      if (mini.isPropOnly || mini.ownerName === '__GM__' || mini.sheet?.isMonster) return false;
      if (mini.ownerName) {
        return mini.ownerName.toLowerCase() === u.toLowerCase();
      }
      return !mini.sheet?.isMonster && (mini.name.toLowerCase() === u.toLowerCase() || mini.ownerName === '');
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (propsRef.current.isLobby) return;
      const now = performance.now();
      if (now - lastHoverTime < (isMeasuring ? 16 : 28) && !isPainting) return;
      lastHoverTime = now;

      updateMouseFromEvent(e);

      if (isMeasuring && measureStart && propsRef.current.toolMode === 'measure') {
        const snap = propsRef.current.measureSnap && !e.shiftKey;
        const pt = raycastMeasurePoint(snap);
        if (pt) {
          hoverCursor.visible = true;
          hoverCursor.position.set(pt.x, pt.y + 0.025, pt.z);
          setYugiohFrameColor(hoverCursor, 0x22d3ee);

          const key = `${pt.x},${pt.z}`;
          if (key !== lastMeasureEndKey) {
            lastMeasureEndKey = key;
            const coords: RulerLineCoords = {
              startX: measureStart.x,
              startZ: measureStart.z,
              endX: pt.x,
              endZ: pt.z,
            };
            syncLocalRuler(
              coords,
              propsRef.current.measureRule,
              propsRef.current.userColor || '#22d3ee'
            );
            propsRef.current.onLocalRulerChange(coords, true);
          }
        }
        return;
      }

      const cell =
        propsRef.current.toolMode === 'measure'
          ? raycastMeasurePoint(propsRef.current.measureSnap && !e.shiftKey)
          : raycastGridCell();
      if (!cell) {
        hoverCursor.visible = false;
        pathLine.visible = false;
        propsRef.current.onHoverInfo(null);
        return;
      }

      if (isPainting && propsRef.current.toolMode === 'sculpt' && propsRef.current.role === 'gm') {
        const k = tileKey(cell.x, cell.z);
        if (k !== lastPaintedKey) {
          lastPaintedKey = k;
          paintCellAt(cell.x, cell.z);
        }
      }

      const { toolMode: mode, selectedMiniId: selId, roomState: rs } = propsRef.current;
      hoverCursor.visible = true;
      hoverCursor.position.set(cell.x, cell.y + 0.025, cell.z);
      setYugiohFrameColor(
        hoverCursor,
        mode === 'sculpt'
          ? 0x10b981
          : mode === 'annotate'
          ? 0xa855f7
          : mode === 'measure'
          ? 0x22d3ee
          : selId
          ? 0x38bdf8
          : 0xfbbf24
      );

      pathLine.visible = false;
      propsRef.current.onHoverInfo({ x: cell.x, z: cell.z, distanceCells: null });
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (propsRef.current.isLobby) return;
      if (e.button === 2) {
        rightDownPos = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button === 0) {
        propsRef.current.onDismissContextMenu?.();
      }
      pointerDownPos = { x: e.clientX, y: e.clientY };

      if (e.button === 0 && propsRef.current.toolMode === 'measure') {
        controls.enabled = false;
        isMeasuring = true;
        updateMouseFromEvent(e);
        const snap = propsRef.current.measureSnap && !e.shiftKey;
        const pt = raycastMeasurePoint(snap);
        if (pt) {
          measureStart = { x: pt.x, z: pt.z };
          lastMeasureEndKey = `${pt.x},${pt.z}`;
          const coords: RulerLineCoords = {
            startX: pt.x,
            startZ: pt.z,
            endX: pt.x,
            endZ: pt.z,
          };
          syncLocalRuler(
            coords,
            propsRef.current.measureRule,
            propsRef.current.userColor || '#22d3ee'
          );
          propsRef.current.onLocalRulerChange(coords, true);
          audioSynth.playMiniPickup();
        }
        return;
      }

      if (
        e.button === 0 &&
        propsRef.current.toolMode === 'sculpt' &&
        propsRef.current.role === 'gm'
      ) {
        controls.enabled = false;
        isPainting = true;
        propsRef.current.onSculptStrokeStart?.();
        updateMouseFromEvent(e);
        const cell = raycastGridCell();
        if (cell) {
          lastPaintedKey = tileKey(cell.x, cell.z);
          paintCellAt(cell.x, cell.z);
        }
        return;
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (isMeasuring) {
        isMeasuring = false;
        controls.enabled = true;
        if (measureStart) {
          updateMouseFromEvent(e);
          const snap = propsRef.current.measureSnap && !e.shiftKey;
          const pt = raycastMeasurePoint(snap);
          const endX = pt ? pt.x : measureStart.x;
          const endZ = pt ? pt.z : measureStart.z;
          const coords: RulerLineCoords = {
            startX: measureStart.x,
            startZ: measureStart.z,
            endX,
            endZ,
          };
          syncLocalRuler(
            coords,
            propsRef.current.measureRule,
            propsRef.current.userColor || '#22d3ee'
          );
          propsRef.current.onLocalRulerChange(coords, false);
          measureStart = null;
          lastMeasureEndKey = '';
        }
        return;
      }

      if (isPainting) {
        isPainting = false;
        lastPaintedKey = '';
        controls.enabled = true;
        propsRef.current.onSculptStrokeEnd?.();
        return;
      }

      if (propsRef.current.isLobby || e.button !== 0) return;

      const movedDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (movedDist > 6) return; // Usuário estava apenas girando a órbita da câmera

      if (propsRef.current.toolMode === 'sculpt' && propsRef.current.role === 'gm') return;
      if (propsRef.current.toolMode === 'measure') return;

      updateMouseFromEvent(e);
      _raycaster.setFromCamera(_mouse, camera);

      // 0. Se GM está no modo 'annotate', verifica clique em marcador ou posiciona nova anotação
      if (propsRef.current.toolMode === 'annotate' && propsRef.current.role === 'gm') {
        const annObjects = Array.from(annotationEntries.values()).map((v) => v.group);
        const annHits = _raycaster.intersectObjects(annObjects, true);
        if (annHits.length > 0) {
          let hitObj: THREE.Object3D | null = annHits[0].object;
          while (hitObj && !hitObj.userData?.annotationId) {
            hitObj = hitObj.parent;
          }
          const clickedAnnId = hitObj?.userData?.annotationId as string | undefined;
          if (clickedAnnId) {
            propsRef.current.onSelectAnnotation(
              propsRef.current.selectedAnnotationId === clickedAnnId ? null : clickedAnnId
            );
            audioSynth.playMiniPickup();
            return;
          }
        }
        const cell = raycastGridCell();
        if (cell) {
          propsRef.current.onPlaceAnnotation(cell.x, cell.z);
          audioSynth.playTilePlace();
        }
        return;
      }

      // 1. Verifica se usuário clicou diretamente em uma miniatura (filtrado por camada de seleção do Mestre)
      const isGm = propsRef.current.role === 'gm';
      const gmLayer = propsRef.current.gmLayer || 'all';

      const candidateEntries = Array.from(miniEntries.entries()).filter(([id]) => {
        if (!isGm || gmLayer === 'all') return true;
        const m = propsRef.current.roomState?.miniatures[id];
        if (!m) return true;
        if (gmLayer === 'characters') return !m.isPropOnly;
        if (gmLayer === 'props') return !!m.isPropOnly;
        return true;
      });

      const miniObjects = candidateEntries.map(([, v]) => v.group);
      const miniHits = _raycaster.intersectObjects(miniObjects, true);

      let clickedId: string | undefined;

      if (miniHits.length > 0) {
        // Encontra o primeiro hit válido que NÃO seja sombra ou frame de seleção
        for (const hit of miniHits) {
          if (hit.object.userData?.isShadow || hit.object.userData?.isSelectionRing) {
            continue;
          }
          let hitObj: THREE.Object3D | null = hit.object;
          while (hitObj && !hitObj.userData?.miniId) {
            hitObj = hitObj.parent;
          }
          if (hitObj?.userData?.miniId) {
            clickedId = hitObj.userData.miniId as string;
            break;
          }
        }
      }

      // 1b. Se não pegou na malha direta da miniatura, verifica se o clique foi na célula onde está a miniatura
      if (!clickedId && propsRef.current.roomState) {
        const cell = raycastGridCell();
        if (cell) {
          const allMinis = Object.values(propsRef.current.roomState.miniatures);
          const matched = allMinis.find((m) => {
            if (isGm) {
              if (gmLayer === 'characters' && m.isPropOnly) return false;
              if (gmLayer === 'props' && !m.isPropOnly) return false;
            } else if (!canUserControlMini(m)) {
              return false;
            }
            const half = (m.footprint || 1) / 2;
            const diffX = Math.abs(cell.x - m.x);
            const diffZ = Math.abs(cell.z - m.z);
            return diffX <= half && diffZ <= half;
          });
          if (matched) {
            clickedId = matched.id;
          }
        }
      }

      if (clickedId) {
        if (propsRef.current.selectedMiniId === clickedId) {
          propsRef.current.onSelectMini(null);
          audioSynth.playMiniDrop();
        } else {
          propsRef.current.onSelectMini(clickedId);
          propsRef.current.onSelectAnnotation(null);
          audioSynth.playMiniPickup();
          hoverCursor.scale.set(1.2, 1, 1.2);
          const m = propsRef.current.roomState?.miniatures[clickedId];
          if (m) {
            lastActiveCell = { x: Math.floor(m.x), z: Math.floor(m.z) };
          }
        }
        return;
      }

      // 1b. Se GM clica em anotação existente no modo interagir
      if (propsRef.current.role === 'gm') {
        const annObjects = Array.from(annotationEntries.values()).map((v) => v.group);
        const annHits = _raycaster.intersectObjects(annObjects, true);
        if (annHits.length > 0) {
          let hitObj: THREE.Object3D | null = annHits[0].object;
          while (hitObj && !hitObj.userData?.annotationId) {
            hitObj = hitObj.parent;
          }
          const clickedAnnId = hitObj?.userData?.annotationId as string | undefined;
          if (clickedAnnId) {
            propsRef.current.onSelectAnnotation(clickedAnnId);
            propsRef.current.onSelectMini(null);
            audioSynth.playMiniPickup();
            return;
          }
        }
      }

      // Clicar fora ou em célula vazia desseleciona a miniatura sem movê-la pelo mouse
      const selId = propsRef.current.selectedMiniId;
      if (selId) {
        propsRef.current.onSelectMini(null);
        audioSynth.playMiniDrop();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (propsRef.current.isLobby) return;
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (propsRef.current.localRuler) {
          propsRef.current.onLocalRulerChange(null, false);
          return;
        }
        if (propsRef.current.selectedMiniId) {
          propsRef.current.onSelectMini(null);
          audioSynth.playMiniDrop();
        }
        return;
      }

      const selId = propsRef.current.selectedMiniId;
      const rs = propsRef.current.roomState;
      const maxCols = rs?.cols || 20;
      const maxRows = rs?.rows || 20;

      // ========================================================================
      // 🎮 MOVIMENTAÇÃO DE GRID ESTILO YU-GI-OH! FORBIDDEN MEMORIES
      // ADAPTADA RELATIVAMENTE À PERSPECTIVA DA CÂMERA (SCREEN-ALIGNED D-PAD)
      // ========================================================================
      let screenDx = 0;
      let screenDz = 0;

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        screenDz = -1; // Cima / Frente na tela
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        screenDz = 1;  // Baixo / Trás na tela
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        screenDx = -1; // Esquerda na tela
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        screenDx = 1;  // Direita na tela
      }

      let dx = 0;
      let dz = 0;

      if (screenDx !== 0 || screenDz !== 0) {
        const isEditing = propsRef.current.toolMode === 'sculpt';
        const step = getCameraRelativeGridStep(camera, screenDx, screenDz, isEditing);
        dx = step.dx;
        dz = step.dz;
      }

      // 1. MOVIMENTO DISCRETO COM SETAS DO TECLADO (PULO EXATO CASA A CASA)
      if (dx !== 0 || dz !== 0) {
        e.preventDefault();

        // CASO A: HÁ UM OBJETO DE CENÁRIO OU MINIATURA SELECIONADO NA MÃO
        if (selId && rs?.miniatures[selId]) {
          const mini = rs.miniatures[selId];
          if (canUserControlMini(mini)) {
            const isEven = mini.footprint % 2 === 0;
            const currentTileX = isEven ? Math.floor(mini.x) + 0.5 : Math.round(mini.x);
            const currentTileZ = isEven ? Math.floor(mini.z) + 0.5 : Math.round(mini.z);

            const minCoord = isEven ? 0.5 : 0;
            const maxCoordX = isEven ? maxCols - 0.5 : maxCols - 1;
            const maxCoordZ = isEven ? maxRows - 0.5 : maxRows - 1;

            const targetX = Math.max(minCoord, Math.min(maxCoordX, currentTileX + dx));
            const targetZ = Math.max(minCoord, Math.min(maxCoordZ, currentTileZ + dz));

            if (targetX !== mini.x || targetZ !== mini.z) {
              // Mantém a rotação e move 1 casa exata (snap perfeito Yu-Gi-Oh)
              propsRef.current.onMoveMini(mini.id, targetX, targetZ, mini.rotationY);
              audioSynth.playCursorMove();
              lastActiveCell = { x: Math.floor(targetX), z: Math.floor(targetZ) };

              const surfY = getSurfaceYForCoord(rs, lastActiveCell.x, lastActiveCell.z);
              hoverCursor.visible = true;
              hoverCursor.position.set(lastActiveCell.x, surfY + 0.015, lastActiveCell.z);
              hoverCursor.scale.set(1.15, 1, 1.15);
              propsRef.current.onHoverInfo({ x: lastActiveCell.x, z: lastActiveCell.z, distanceCells: null });
            }
            return;
          }
        }

        // CASO B: NENHUM OBJETO SELECIONADO -> MOVE O CURSOR DO TABULEIRO (SNAP DISCRETO DE CASA EM CASA)
        if (!lastActiveCell) {
          lastActiveCell = { x: Math.floor(maxCols / 2), z: Math.floor(maxRows / 2) };
        }
        const nextX = Math.max(0, Math.min(maxCols - 1, lastActiveCell.x + dx));
        const nextZ = Math.max(0, Math.min(maxRows - 1, lastActiveCell.z + dz));

        if (nextX !== lastActiveCell.x || nextZ !== lastActiveCell.z) {
          lastActiveCell = { x: nextX, z: nextZ };
          const surfY = getSurfaceYForCoord(rs, nextX, nextZ);
          hoverCursor.visible = true;
          hoverCursor.position.set(nextX, surfY + 0.015, nextZ);
          hoverCursor.scale.set(1.15, 1, 1.15);
          audioSynth.playCursorMove();
          propsRef.current.onHoverInfo({ x: nextX, z: nextZ, distanceCells: null });
        }
        return;
      }

      // 2. ESPAÇO OU ENTER: PEGAR / SOLTAR (PICKUP & DROP ESTILO FORBIDDEN MEMORIES)
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();

        // Se tem objeto selecionado -> SOLTA / FIXA NO CHÃO
        if (selId && rs?.miniatures[selId]) {
          propsRef.current.onSelectMini(null);
          audioSynth.playMiniDrop();
          return;
        }

        // Se NÃO tem objeto selecionado -> PEGA O OBJETO NA CASA DO CURSOR
        if (lastActiveCell && rs) {
          const cellX = lastActiveCell.x;
          const cellZ = lastActiveCell.z;

          // Procura miniatura ou prop 3D na casa respeitando a camada ativa do Mestre
          const isGm = propsRef.current.role === 'gm';
          const gmLayer = propsRef.current.gmLayer || 'all';

          const foundMini = Object.values(rs.miniatures).find((m) => {
            const isEven = m.footprint % 2 === 0;
            const mx = isEven ? Math.floor(m.x) : Math.round(m.x);
            const mz = isEven ? Math.floor(m.z) : Math.round(m.z);
            if (mx !== cellX || mz !== cellZ) return false;
            if (isGm) {
              if (gmLayer === 'characters' && m.isPropOnly) return false;
              if (gmLayer === 'props' && !m.isPropOnly) return false;
            }
            return true;
          });

          if (foundMini && canUserControlMini(foundMini)) {
            propsRef.current.onSelectMini(foundMini.id);
            audioSynth.playMiniPickup();
            return;
          }
        }
        return;
      }

      // 3. ROTAÇÃO DE 90º EXATA COM R, E ou Q (PARA ALINHAR MUROS, MESAS E CENÁRIOS PERFEITAMENTE)
      if (selId && rs?.miniatures[selId]) {
        const mini = rs.miniatures[selId];
        if (canUserControlMini(mini)) {
          if (e.key === 'e' || e.key === 'E' || e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            const nextRot = Math.round((mini.rotationY + Math.PI / 2) / (Math.PI / 2)) * (Math.PI / 2);
            propsRef.current.onMoveMini(mini.id, mini.x, mini.z, nextRot);
            audioSynth.playCursorMove();
            return;
          } else if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault();
            const nextRot = Math.round((mini.rotationY - Math.PI / 2) / (Math.PI / 2)) * (Math.PI / 2);
            propsRef.current.onMoveMini(mini.id, mini.x, mini.z, nextRot);
            audioSynth.playCursorMove();
            return;
          } else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (propsRef.current.role === 'gm' || mini.ownerName === propsRef.current.userName) {
              e.preventDefault();
              propsRef.current.onDeleteMini(mini.id);
              propsRef.current.onSelectMini(null);
              audioSynth.playMiniDrop();
              return;
            }
          }
        }
      }

      // 4. ROTAÇÃO OU EXCLUSÃO DE ADEREÇO DE TERRENO (SE NÃO FOR MINIATURA 3D)
      if (propsRef.current.role === 'gm' && lastActiveCell && rs) {
        const k = tileKey(lastActiveCell.x, lastActiveCell.z);
        const cell = rs.tiles[k];
        if (cell && cell.prop !== 'none') {
          if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            const nextRot = ((cell.propRotation || 0) + 1) % 4;
            propsRef.current.onPaintTile({
              ...cell,
              propRotation: nextRot,
            });
            audioSynth.playCursorMove();
            return;
          }
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            propsRef.current.onPaintTile({
              ...cell,
              prop: 'none',
              propRotation: 0,
            });
            audioSynth.playMiniDrop();
            return;
          }
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (propsRef.current.isLobby || propsRef.current.role !== 'gm') return;
      const movedDist = Math.hypot(e.clientX - rightDownPos.x, e.clientY - rightDownPos.y);
      if (movedDist > 6) return; // User panned camera with right-click drag

      updateMouseFromEvent(e);
      _raycaster.setFromCamera(_mouse, camera);

      let miniId: string | null = null;
      const miniObjects = Array.from(miniEntries.values()).map((v) => v.group);
      const miniHits = _raycaster.intersectObjects(miniObjects, true);
      if (miniHits.length > 0) {
        let hitObj: THREE.Object3D | null = miniHits[0].object;
        while (hitObj && !hitObj.userData?.miniId) {
          hitObj = hitObj.parent;
        }
        miniId = (hitObj?.userData?.miniId as string | undefined) || null;
      }

      let annotationId: string | null = null;
      if (!miniId) {
        const annObjects = Array.from(annotationEntries.values()).map((v) => v.group);
        const annHits = _raycaster.intersectObjects(annObjects, true);
        if (annHits.length > 0) {
          let hitObj: THREE.Object3D | null = annHits[0].object;
          while (hitObj && !hitObj.userData?.annotationId) {
            hitObj = hitObj.parent;
          }
          annotationId = (hitObj?.userData?.annotationId as string | undefined) || null;
        }
      }

      const cell = raycastGridCell();
      if (!miniId && !annotationId && !cell) {
        propsRef.current.onDismissContextMenu?.();
        return;
      }

      propsRef.current.onOpenContextMenu?.({
        screenX: e.clientX,
        screenY: e.clientY,
        miniId,
        annotationId,
        gridX: cell ? cell.x : null,
        gridZ: cell ? cell.z : null,
      });
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 60fps Animation & Damped Simulation Loop
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = clock.elapsedTime;

      // Lobby scenic camera orbit
      if (propsRef.current.isLobby) {
        controls.autoRotate = !isSoftwareGl;
        controls.autoRotateSpeed = 0.85;
      } else {
        controls.autoRotate = false;
      }

      // Smooth camera preset damping
      if (cameraTargetPos && cameraTargetLook) {
        const k = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(cameraTargetPos, k);
        controls.target.lerp(cameraTargetLook, k);
        if (camera.position.distanceTo(cameraTargetPos) < 0.05) {
          cameraTargetPos = null;
          cameraTargetLook = null;
        }
      }

      controls.update();

      // Smooth damped miniature movement + playful tabletop hop arc
      const moveFactor = 1 - Math.exp(-12 * dt);
      miniEntries.forEach((entry) => {
        const dx = entry.targetX - entry.group.position.x;
        const dz = entry.targetZ - entry.group.position.z;
        const dist = Math.hypot(dx, dz);

        entry.group.position.x += dx * moveFactor;
        entry.group.position.z += dz * moveFactor;

        if (entry.hopProgress < 1) {
          entry.hopProgress = Math.min(1, entry.hopProgress + dt * 3.4);
        }
        const arc = Math.sin(entry.hopProgress * Math.PI) * 0.34 * Math.min(1, dist + 0.3);
        const dampedBaseY = THREE.MathUtils.damp(
          entry.group.position.y,
          entry.targetY + arc,
          14,
          dt
        );
        entry.group.position.y = dampedBaseY;

        // Shortest-angle rotation damping
        let diffRot = entry.targetRotY - entry.group.rotation.y;
        while (diffRot > Math.PI) diffRot -= Math.PI * 2;
        while (diffRot < -Math.PI) diffRot += Math.PI * 2;
        entry.group.rotation.y += diffRot * (1 - Math.exp(-14 * dt));
      });

      // Subtle brazier flame flicker & annotation crystal bobbing
      let idx = 0;
      tileEntries.forEach((t) => {
        idx++;
        if (t.flameMesh && t.pointLight) {
          const wave = Math.sin(elapsed * 9.5 + idx * 1.7) * 0.12 + Math.cos(elapsed * 14 + idx) * 0.08;
          t.flameMesh.scale.set(1 + wave * 0.4, 1 + wave, 1 + wave * 0.4);
          t.pointLight.intensity = 3.1 + wave * 1.8;
        }
      });

      let annIdx = 0;
      annotationEntries.forEach((a) => {
        annIdx++;
        if (a.crystalMesh) {
          a.crystalMesh.position.y = 0.82 + Math.sin(elapsed * 2.4 + annIdx) * 0.065;
          a.crystalMesh.rotation.y = elapsed * 1.1 + annIdx;
        }
      });

      // Physical 3D Dice Bounce & Settling Simulation
      const rsForDice = propsRef.current.roomState;
      for (let i = activeDice.length - 1; i >= 0; i--) {
        const d = activeDice[i];
        d.age += dt;
        if (d.age >= d.maxAge) {
          diceRoot.remove(d.visual.group);
          d.visual.dispose();
          activeDice.splice(i, 1);
          continue;
        }

        const surfY = getSurfaceYForCoord(rsForDice, d.x, d.z);
        const restY = surfY + d.visual.restingOffsetY;

        if (!d.settled) {
          d.vy -= 24 * dt;
          d.x = Math.max(0.8, Math.min(14.2, d.x + d.vx * dt));
          d.z = Math.max(0.8, Math.min(14.2, d.z + d.vz * dt));
          const horizDrag = Math.exp(-3.2 * dt);
          d.vx *= horizDrag;
          d.vz *= horizDrag;
          d.y += d.vy * dt;

          const curSurf = getSurfaceYForCoord(rsForDice, d.x, d.z);
          const curRest = curSurf + d.visual.restingOffsetY;

          if (d.y <= curRest) {
            d.y = curRest;
            if (Math.abs(d.vy) > 1.35 && d.bounces < 3) {
              d.vy = -d.vy * 0.44;
              d.bounces += 1;
              d.spinSpeed *= 0.55;
            } else {
              d.vy = 0;
              d.vx = 0;
              d.vz = 0;
              d.settled = true;
            }
          }

          if (d.bounces === 0) {
            _diceSpinQuat.setFromAxisAngle(d.spinAxis, d.spinSpeed * dt);
            d.visual.dieMesh.quaternion.premultiply(_diceSpinQuat);
          } else if (!d.settled) {
            _diceSpinQuat.setFromAxisAngle(_diceSpinAxis, d.spinSpeed * dt * 0.45);
            d.visual.dieMesh.quaternion.premultiply(_diceSpinQuat);
            d.visual.dieMesh.quaternion.slerp(d.visual.targetQuat, 1 - Math.exp(-8 * dt));
          } else {
            d.visual.dieMesh.quaternion.slerp(d.visual.targetQuat, 1 - Math.exp(-16 * dt));
          }

          d.visual.group.position.set(d.x, 0, d.z);
          d.visual.dieMesh.position.y = d.y;
          d.visual.shadowMesh.position.y = curSurf + 0.015;
          const heightRatio = Math.max(0, Math.min(1, (d.y - curRest) / 2.8));
          const shadowScale = 1 - heightRatio * 0.42;
          d.visual.shadowMesh.scale.set(shadowScale, 1, shadowScale);
          (d.visual.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.72 * (1 - heightRatio * 0.55);
          d.visual.badgeSprite.position.y = curRest + 0.62;
        } else {
          d.visual.dieMesh.quaternion.slerp(d.visual.targetQuat, 1 - Math.exp(-16 * dt));
          d.visual.dieMesh.position.y = THREE.MathUtils.damp(d.visual.dieMesh.position.y, restY, 18, dt);
          d.visual.shadowMesh.position.y = surfY + 0.015;
          d.visual.shadowMesh.scale.set(1, 1, 1);

          const spriteMat = d.visual.badgeSprite.material as THREE.SpriteMaterial;
          const fadeOutStart = d.maxAge - 0.65;
          if (d.age > fadeOutStart) {
            const rem = Math.max(0, (d.maxAge - d.age) / 0.65);
            spriteMat.opacity = rem;
            d.visual.dieMesh.scale.setScalar(0.3 + 0.7 * rem);
            (d.visual.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.72 * rem;
          } else {
            spriteMat.opacity = Math.min(1, spriteMat.opacity + dt * 5.5);
          }
          d.visual.badgeSprite.position.y =
            restY + 0.62 + Math.sin(elapsed * 2.5 + i) * 0.025;
        }
      }

      terrainMaterials.lava.emissiveIntensity = 1.25 + Math.sin(elapsed * 2.2) * 0.25;

      // Gentle atmospheric ember drift (zero GC)
      const moteAttr = moteGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < moteCount; i++) {
        const phase = moteSeeds[i * 2];
        const speed = moteSeeds[i * 2 + 1];
        let py = moteAttr.getY(i) + dt * speed;
        if (py > 3.8) py = 0.35;
        moteAttr.setY(i, py);
        moteAttr.setX(i, moteAttr.getX(i) + Math.sin(elapsed * 0.8 + phase) * dt * 0.08);
      }
      moteAttr.needsUpdate = true;

      // 🌟 Atualizar Holofote, Feixe de Luz e Halo da Vez de Iniciativa
      const combat = propsRef.current.roomState?.combat;
      if (combat && combat.active && Array.isArray(combat.entries) && combat.entries.length > 0) {
        const activeEntry = combat.entries[combat.turnIndex];
        const activeMiniId = activeEntry?.miniId || activeEntry?.id;
        const visualMini = activeMiniId ? miniEntries.get(activeMiniId) : null;
        if (visualMini && activeMiniId) {
          turnHighlightGroup.visible = true;
          // Segue com perfeição a posição e elevação da miniatura
          turnHighlightGroup.position.set(
            visualMini.group.position.x,
            visualMini.group.position.y,
            visualMini.group.position.z
          );
          turnLightTarget.position.set(0, 0, 0);

          // Animações suaves em tempo real
          turnHaloMesh.rotation.y += dt * 1.5;
          turnInnerHaloMesh.rotation.y -= dt * 2.2;
          turnGemMesh.rotation.y += dt * 1.8;
          turnGemMesh.position.y = 1.95 + Math.sin(elapsed * 4.0) * 0.08;

          const pulse = 1.0 + Math.sin(elapsed * 3.6) * 0.16;
          const beamPulse = 0.26 + Math.sin(elapsed * 3.0) * 0.09;
          beamMat.opacity = beamPulse;
          turnSpotLight.intensity = 5.5 * pulse;
          turnPointLight.intensity = 2.2 * pulse;

          const miniData = propsRef.current.roomState?.miniatures[activeMiniId];
          const fp = miniData?.footprint || 1;
          const ringScale = fp * 0.95;
          turnHaloMesh.scale.set(ringScale, 1, ringScale);
          turnInnerHaloMesh.scale.set(ringScale, 1, ringScale);
          turnBeamMesh.scale.set(ringScale, 1, ringScale);
        } else {
          turnHighlightGroup.visible = false;
        }
      } else {
        turnHighlightGroup.visible = false;
      }

      // 🎙️ Atualizar Aura Sonora de Fala em Tempo Real (quando alguém fala pelo personagem)
      const roomUsersList = propsRef.current.roomState?.users || [];
      const speakingUser = roomUsersList.find((u) => u.speaking && u.characterId);
      if (speakingUser && speakingUser.characterId) {
        const charMiniVisual = miniEntries.get(speakingUser.characterId);
        if (charMiniVisual) {
          voiceAuraGroup.visible = true;
          voiceAuraGroup.position.set(
            charMiniVisual.group.position.x,
            charMiniVisual.group.position.y,
            charMiniVisual.group.position.z
          );

          const miniData = propsRef.current.roomState?.miniatures[speakingUser.characterId];
          const fp = miniData?.footprint || 1;

          // Efeito de onda sonora expansiva contínua
          const cycle = (elapsed * 3.2) % 1.0;
          const currentScale = fp * (0.85 + cycle * 0.7);
          voiceRingMesh.scale.set(currentScale, 1, currentScale);
          voiceRingMat.opacity = Math.max(0, 0.85 * (1 - cycle));

          const ecoCycle = (elapsed * 3.2 + 0.5) % 1.0;
          const ecoScale = fp * (0.85 + ecoCycle * 0.7);
          voiceEcoMesh.scale.set(ecoScale, 1, ecoScale);
          voiceEcoMat.opacity = Math.max(0, 0.6 * (1 - ecoCycle));

          voiceRingMesh.rotation.y += dt * 2.0;
          voiceEcoMesh.rotation.y -= dt * 1.5;

          const voicePulse = 1.0 + Math.sin(elapsed * 8.0) * 0.25;
          voiceLight.intensity = 2.4 * voicePulse;
        } else {
          voiceAuraGroup.visible = false;
        }
      } else {
        voiceAuraGroup.visible = false;
      }

      // Animação de bounce suave do cursor de seleção Yu-Gi-Oh
      hoverCursor.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 14));

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      controls.dispose();
      textures.dispose();
      envTex.dispose();
      localRulerVisual.dispose();
      remoteRulerVisuals.forEach((h) => h.dispose());
      remoteRulerVisuals.clear();
      while (activeDice.length > 0) {
        const d = activeDice.shift()!;
        diceRoot.remove(d.visual.group);
        d.visual.dispose();
      }
      disposeSharedDiceResources();
      Object.values(terrainMaterials).forEach((m) => m.dispose());
      cliffSideMat.dispose();
      moteGeo.dispose();
      moteMat.dispose();
      unitBoxGeo.dispose();
      topCapGeo.dispose();
      beamGeo.dispose();
      beamMat.dispose();
      turnHaloGeo.dispose();
      turnHaloMat.dispose();
      turnInnerHaloGeo.dispose();
      turnInnerHaloMat.dispose();
      gemGeo.dispose();
      gemMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [renderKey]);

  // Sync React roomState changes into Three.js objects without resetting camera
  useEffect(() => {
    if (!roomState || !sceneSyncRef.current) return;
    sceneSyncRef.current.syncTiles(roomState);
    sceneSyncRef.current.syncMinis(roomState);
    sceneSyncRef.current.syncAnnotations(roomState, role, selectedAnnotationId);
    sceneSyncRef.current.syncRemoteRulers(roomState.rulers);
    sceneSyncRef.current.syncDiceRolls(roomState.recentRolls || [], roomState);
    sceneSyncRef.current.updateLayerVisuals(gmLayer);
  }, [roomState, role, selectedAnnotationId, gmLayer]);

  useEffect(() => {
    sceneSyncRef.current?.updateLayerVisuals(gmLayer);
  }, [gmLayer]);

  useEffect(() => {
    sceneSyncRef.current?.syncLocalRuler(localRuler, measureRule, userColor || '#22d3ee');
  }, [localRuler, measureRule, userColor, roomState?.tiles]);

  const lastFocusedMiniRef = useRef<string | null>(null);
  useEffect(() => {
    sceneSyncRef.current?.updateSelectionVisuals(selectedMiniId);
    if (selectedMiniId && selectedMiniId !== lastFocusedMiniRef.current) {
      lastFocusedMiniRef.current = selectedMiniId;
      sceneSyncRef.current?.focusOnMini(selectedMiniId);
    }
  }, [selectedMiniId]);

  // Foco suave de câmera quando o turno de iniciativa avança
  const lastCombatTurnMiniRef = useRef<string | null>(null);
  useEffect(() => {
    const combat = roomState?.combat;
    if (combat && combat.active && Array.isArray(combat.entries) && combat.entries.length > 0) {
      const active = combat.entries[combat.turnIndex];
      const targetId = active?.miniId || active?.id;
      if (targetId && targetId !== lastCombatTurnMiniRef.current) {
        lastCombatTurnMiniRef.current = targetId;
        sceneSyncRef.current?.focusOnMini(targetId);
      }
    } else {
      lastCombatTurnMiniRef.current = null;
    }
  }, [roomState?.combat?.turnIndex, roomState?.combat?.active]);

  useEffect(() => {
    if (cameraCommand) {
      sceneSyncRef.current?.applyCameraPreset(cameraCommand.preset);
    }
  }, [cameraCommand]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mountRef}
        className={`w-full h-full ${
          toolMode === 'measure' || ((toolMode === 'sculpt' || toolMode === 'annotate') && role === 'gm')
            ? 'cursor-crosshair'
            : 'cursor-grab active:cursor-grabbing'
        }`}
      />

      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d1015]/95 z-50">
          <div className="max-w-md p-6 border border-stone-700/60 bg-[#141820] rounded-xl text-center shadow-2xl">
            <h2 className="font-display text-lg text-amber-400 mb-2">Contexto WebGL em pausa</h2>
            <p className="text-sm text-stone-300 mb-4">
              O navegador suspendeu a aceleração 3D temporariamente. O cache e recursos foram otimizados.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setContextLost(false);
                  setRenderKey((k) => k + 1);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-semibold text-sm rounded-lg shadow-lg cursor-pointer transition-colors"
              >
                Restaurar 3D Agora
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-2 bg-stone-700 hover:bg-stone-600 text-stone-200 text-sm rounded-lg cursor-pointer transition-colors"
              >
                Recarregar Página
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

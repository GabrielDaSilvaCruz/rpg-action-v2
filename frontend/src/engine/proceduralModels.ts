import * as THREE from 'three';
import {
  BaseStyle,
  BuiltinMiniKind,
  FootprintSize,
  MiniFinish,
  PropKind,
  TILE_SIZE,
} from '../types/vtt';
import { createFinishMaterial } from './modelNormalizer';

function createBeveledRectGeo(
  w: number,
  h: number,
  d: number,
  bevel = 0.016,
  radius = 0.02
): THREE.ExtrudeGeometry {
  const hw = Math.max(0.01, w / 2 - bevel);
  const hd = Math.max(0.01, d / 2 - bevel);
  const r = Math.min(radius, hw * 0.45, hd * 0.45);
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

  const depth = Math.max(0.01, h - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  return geo;
}

export function createContactShadow(
  contactShadowMap: THREE.Texture,
  footprint: FootprintSize
): THREE.Mesh {
  const size = footprint * TILE_SIZE * 1.15;
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: contactShadowMap,
    transparent: true,
    depthWrite: false,
    opacity: 0.58,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.008;
  return mesh;
}

/**
 * 5 Sculpted RPG Character Bases inspired by MakerWorld / TaleSpire plinths
 */
export function createMiniBase(
  footprint: FootprintSize,
  rimColorHex: string,
  baseStyle: BaseStyle = 'rune'
): THREE.Group {
  const group = new THREE.Group();
  const radius = footprint * TILE_SIZE * 0.42;
  const height = 0.085;
  const rimColor = new THREE.Color(rimColorHex || '#d97706');

  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius, 0),
    new THREE.Vector2(radius, 0.024),
    new THREE.Vector2(radius * 0.94, 0.045),
    new THREE.Vector2(radius * 0.9, height),
    new THREE.Vector2(0, height),
  ];
  const baseGeo = new THREE.LatheGeometry(points, 32);

  const plinthColor =
    baseStyle === 'royal'
      ? 0x2c191d
      : baseStyle === 'moss'
      ? 0x262119
      : baseStyle === 'magma'
      ? 0x161213
      : 0x1a1e26;

  const baseMat = new THREE.MeshStandardMaterial({
    color: plinthColor,
    roughness: baseStyle === 'royal' ? 0.38 : 0.72,
    metalness: baseStyle === 'royal' ? 0.38 : 0.14,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  const ringGeo = new THREE.TorusGeometry(radius * 0.955, 0.018, 10, 36);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: baseStyle === 'royal' ? 0xe5b94c : rimColor,
    roughness: 0.22,
    metalness: 0.84,
    emissive: baseStyle === 'magma' ? new THREE.Color(0xea580c) : rimColor,
    emissiveIntensity: baseStyle === 'magma' ? 0.35 : 0.14,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.y = 0.022;
  group.add(ringMesh);

  if (baseStyle === 'rune') {
    const runeGeo = new THREE.RingGeometry(radius * 0.56, radius * 0.67, 6);
    runeGeo.rotateX(-Math.PI / 2);
    const runeMat = new THREE.MeshStandardMaterial({
      color: rimColor,
      emissive: rimColor,
      emissiveIntensity: 0.75,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    const rune = new THREE.Mesh(runeGeo, runeMat);
    rune.position.y = height + 0.004;
    group.add(rune);
  } else if (baseStyle === 'cobble') {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x5d6470,
      roughness: 0.86,
      metalness: 0.06,
    });
    const slabOffsets = [
      [-0.14, -0.1, 0.23, 0.17],
      [0.14, -0.12, 0.21, 0.19],
      [-0.1, 0.15, 0.25, 0.15],
      [0.15, 0.12, 0.17, 0.19],
    ];
    slabOffsets.forEach(([sx, sz, sw, sd], idx) => {
      const slab = new THREE.Mesh(
        createBeveledRectGeo(sw * footprint * 0.9, 0.024, sd * footprint * 0.9, 0.005, 0.015),
        stoneMat
      );
      slab.position.set(sx * footprint, height + 0.008 + (idx % 2) * 0.004, sz * footprint);
      slab.rotation.y = idx * 0.18;
      group.add(slab);
    });
  } else if (baseStyle === 'moss') {
    const turfMat = new THREE.MeshStandardMaterial({ color: 0x355e34, roughness: 0.92 });
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x676d75, roughness: 0.86 });
    const turf = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.85, radius * 0.87, 0.016, 20), turfMat);
    turf.position.y = height + 0.006;
    const rock1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.065 * footprint, 0), rockMat);
    rock1.position.set(-radius * 0.45, height + 0.025, radius * 0.25);
    const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.045 * footprint, 0), rockMat);
    rock2.position.set(radius * 0.48, height + 0.02, -radius * 0.3);
    group.add(turf, rock1, rock2);
  } else if (baseStyle === 'magma') {
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xff6b1a,
      emissive: 0xea580c,
      emissiveIntensity: 1.25,
      roughness: 0.4,
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.84, radius * 0.86, 0.012, 18), glowMat);
    core.position.y = height + 0.003;
    const crustMat = new THREE.MeshStandardMaterial({ color: 0x1e191a, roughness: 0.9 });
    [
      [-0.14, -0.12],
      [0.14, 0.08],
      [-0.08, 0.16],
    ].forEach(([cx, cz]) => {
      const rock = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11 * footprint, 0.13 * footprint, 0.026, 6),
        crustMat
      );
      rock.position.set(cx * footprint, height + 0.01, cz * footprint);
      group.add(rock);
    });
    group.add(core);
  } else if (baseStyle === 'royal') {
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xe5b94c,
      metalness: 0.92,
      roughness: 0.2,
    });
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.8, 0.014, 8, 28), goldMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = height + 0.006;
    group.add(innerRing);
  }

  const notchGeo = new THREE.ConeGeometry(0.055 * Math.sqrt(footprint), 0.08, 4);
  notchGeo.rotateX(Math.PI / 2);
  const notch = new THREE.Mesh(notchGeo, ringMat);
  notch.position.set(0, 0.032, radius * 0.98);
  group.add(notch);

  return group;
}

export function createBuiltinMiniature(
  kind: BuiltinMiniKind,
  finish: MiniFinish,
  colorHex: string,
  footprint: FootprintSize,
  resinBump?: THREE.Texture
): THREE.Group {
  const root = new THREE.Group();
  const baseTopY = 0.085;
  const accentColor = new THREE.Color(colorHex || '#d97706');

  const bodyMat =
    finish === 'original'
      ? createFinishMaterial('bronze', colorHex, resinBump)
      : createFinishMaterial(finish, colorHex, resinBump);

  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x2a2f3a,
    metalness: 0.86,
    roughness: 0.28,
  });
  const brightSteel = new THREE.MeshStandardMaterial({
    color: 0xd4dbe3,
    metalness: 0.92,
    roughness: 0.18,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    metalness: 0.08,
    roughness: 0.78,
  });
  const goldTrim = new THREE.MeshStandardMaterial({
    color: 0xe2ab43,
    metalness: 0.92,
    roughness: 0.2,
  });
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xd9d2c5,
    metalness: 0.05,
    roughness: 0.74,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6b4423,
    metalness: 0.06,
    roughness: 0.78,
  });

  const fig = new THREE.Group();
  fig.position.y = baseTopY;

  if (kind === 'paladin') {
    // Sculpted greaves & armored skirt
    const lowerPoints = [
      new THREE.Vector2(0.19, 0),
      new THREE.Vector2(0.17, 0.25),
      new THREE.Vector2(0.135, 0.44),
      new THREE.Vector2(0, 0.44),
    ];
    fig.add(new THREE.Mesh(new THREE.LatheGeometry(lowerPoints, 16), darkMetal));

    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.024, 8, 20), goldTrim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.45;
    fig.add(belt);

    const torso = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.13, 0),
          new THREE.Vector2(0.175, 0.22),
          new THREE.Vector2(0.16, 0.36),
          new THREE.Vector2(0, 0.38),
        ],
        16
      ),
      bodyMat
    );
    torso.position.y = 0.44;
    fig.add(torso);

    // Layered pauldrons with gold trim
    const pauldronGeo = new THREE.SphereGeometry(0.105, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
    [-1, 1].forEach((side) => {
      const p = new THREE.Mesh(pauldronGeo, brightSteel);
      p.position.set(side * 0.2, 0.77, 0);
      p.rotation.z = -side * 0.35;
      const pRim = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 6, 16), goldTrim);
      pRim.rotation.x = Math.PI / 2;
      pRim.position.set(side * 0.21, 0.75, 0);
      pRim.rotation.y = -side * 0.35;
      fig.add(p, pRim);
    });

    // Visored knight greathelm + swept plume
    const helm = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.105, 0),
          new THREE.Vector2(0.11, 0.14),
          new THREE.Vector2(0.085, 0.21),
          new THREE.Vector2(0, 0.23),
        ],
        16
      ),
      brightSteel
    );
    helm.position.y = 0.81;
    const visor = new THREE.Mesh(createBeveledRectGeo(0.14, 0.03, 0.06, 0.006), goldTrim);
    visor.position.set(0, 0.92, 0.09);
    const plumeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.03, 0.02),
      new THREE.Vector3(0, 1.11, -0.07),
      new THREE.Vector3(0, 1.02, -0.18),
    ]);
    const crest = new THREE.Mesh(new THREE.TubeGeometry(plumeCurve, 10, 0.032, 8, false), clothMat);

    // Curved flowing cape
    const capeShape = new THREE.Shape();
    capeShape.moveTo(-0.14, 0);
    capeShape.lineTo(0.14, 0);
    capeShape.lineTo(0.22, -0.68);
    capeShape.lineTo(-0.22, -0.68);
    capeShape.closePath();
    const cape = new THREE.Mesh(
      new THREE.ExtrudeGeometry(capeShape, {
        depth: 0.028,
        bevelEnabled: true,
        bevelThickness: 0.01,
        bevelSize: 0.01,
        bevelSegments: 2,
      }),
      clothMat
    );
    cape.position.set(0, 0.78, -0.14);
    cape.rotation.x = 0.18;
    fig.add(helm, visor, crest, cape);

    // Beveled heater shield + boss
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(0, -0.24);
    shieldShape.lineTo(0.15, 0.04);
    shieldShape.lineTo(0.13, 0.22);
    shieldShape.lineTo(-0.13, 0.22);
    shieldShape.lineTo(-0.15, 0.04);
    shieldShape.closePath();
    const shield = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shieldShape, {
        depth: 0.035,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 2,
      }),
      goldTrim
    );
    shield.position.set(-0.24, 0.54, 0.11);
    shield.rotation.y = -0.38;

    // Tapered broadsword
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.024, 0);
    bladeShape.lineTo(0.024, 0);
    bladeShape.lineTo(0.018, 0.48);
    bladeShape.lineTo(0, 0.58);
    bladeShape.lineTo(-0.018, 0.48);
    bladeShape.closePath();
    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(bladeShape, {
        depth: 0.012,
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.004,
      }),
      brightSteel
    );
    blade.position.set(0.24, 0.51, 0.08);
    blade.rotation.x = 0.35;
    const guard = new THREE.Mesh(createBeveledRectGeo(0.16, 0.03, 0.04, 0.006), goldTrim);
    guard.position.set(0.24, 0.5, 0.07);
    guard.rotation.x = 0.35;
    fig.add(shield, blade, guard);
  } else if (kind === 'mage') {
    const robePoints = [
      new THREE.Vector2(0.23, 0),
      new THREE.Vector2(0.19, 0.28),
      new THREE.Vector2(0.13, 0.58),
      new THREE.Vector2(0.16, 0.76),
      new THREE.Vector2(0, 0.78),
    ];
    fig.add(new THREE.Mesh(new THREE.LatheGeometry(robePoints, 20), clothMat));

    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.026, 8, 22), goldTrim);
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 0.56;
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 16, 1, true), darkMetal);
    mantle.position.y = 0.72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), bodyMat);
    head.position.y = 0.87;
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 8), boneMat);
    beard.rotation.x = Math.PI;
    beard.position.set(0, 0.77, 0.065);
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.24, 0.025, 20), clothMat);
    hatBrim.position.y = 0.94;
    const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.36, 16), clothMat);
    hatCone.position.set(0, 1.11, -0.02);
    hatCone.rotation.x = -0.16;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 1.12, 10), woodMat);
    staff.position.set(0.23, 0.56, 0.08);
    staff.rotation.z = -0.08;
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.012, 6, 16), goldTrim);
    cage.position.set(0.28, 1.16, 0.08);
    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.072, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 1.0,
        roughness: 0.1,
        clearcoat: 1,
      })
    );
    orb.position.set(0.28, 1.16, 0.08);
    const book = new THREE.Mesh(createBeveledRectGeo(0.15, 0.04, 0.19, 0.008), goldTrim);
    book.position.set(-0.19, 0.62, 0.14);
    book.rotation.set(0.4, 0.2, 0.2);
    fig.add(sash, mantle, head, beard, hatBrim, hatCone, staff, cage, orb, book);
  } else if (kind === 'rogue') {
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 6, 10), darkMetal);
    legL.position.set(-0.08, 0.2, 0.04);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 6, 10), darkMetal);
    legR.position.set(0.08, 0.2, -0.04);
    const tunic = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.36, 14), bodyMat);
    tunic.position.y = 0.54;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 6, 18), woodMat);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.42;
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.64, 14, 1, true), clothMat);
    cloak.position.set(0, 0.54, -0.04);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), clothMat);
    hood.position.set(0, 0.83, -0.01);
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.34, 10), woodMat);
    quiver.position.set(-0.08, 0.68, -0.15);
    quiver.rotation.z = 0.38;
    const daggerL = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.28, 6), brightSteel);
    daggerL.position.set(-0.2, 0.5, 0.14);
    daggerL.rotation.x = Math.PI / 2.4;
    const daggerR = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.28, 6), brightSteel);
    daggerR.position.set(0.2, 0.48, 0.14);
    daggerR.rotation.x = Math.PI / 2.2;
    fig.add(legL, legR, tunic, belt, cloak, hood, quiver, daggerL, daggerR);
  } else if (kind === 'barbarian') {
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.28, 6, 10), darkMetal);
    legL.position.set(-0.1, 0.2, 0);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.28, 6, 10), darkMetal);
    legR.position.set(0.1, 0.2, 0);
    const loin = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 12), clothMat);
    loin.position.y = 0.36;
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 0.4, 14), bodyMat);
    chest.position.y = 0.64;
    const furMantle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.065, 10, 18), woodMat);
    furMantle.rotation.x = Math.PI / 2;
    furMantle.position.y = 0.82;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 12), bodyMat);
    head.position.y = 0.94;
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.17, 8), boneMat);
    hornL.position.set(-0.1, 1.02, 0);
    hornL.rotation.z = 0.65;
    const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.17, 8), boneMat);
    hornR.position.set(0.1, 1.02, 0);
    hornR.rotation.z = -0.65;
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 1.05, 10), woodMat);
    haft.position.set(0.26, 0.6, 0.12);
    haft.rotation.set(0.25, 0, -0.2);
    const axeShape = new THREE.Shape();
    axeShape.moveTo(-0.15, -0.11);
    axeShape.quadraticCurveTo(-0.04, -0.05, 0.04, -0.05);
    axeShape.lineTo(0.15, -0.11);
    axeShape.quadraticCurveTo(0.18, 0, 0.15, 0.11);
    axeShape.lineTo(0.04, 0.05);
    axeShape.lineTo(-0.04, 0.05);
    axeShape.lineTo(-0.15, 0.11);
    axeShape.quadraticCurveTo(-0.18, 0, -0.15, -0.11);
    const axeHead = new THREE.Mesh(
      new THREE.ExtrudeGeometry(axeShape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.006,
      }),
      brightSteel
    );
    axeHead.position.set(0.35, 1.0, 0.23);
    axeHead.rotation.set(0.25, 0, -0.2);
    fig.add(legL, legR, loin, chest, furMantle, head, hornL, hornR, haft, axeHead);
  } else if (kind === 'cleric') {
    const vestment = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.66, 16), clothMat);
    vestment.position.y = 0.33;
    const cuirass = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.145, 0.32, 14), goldTrim);
    cuirass.position.y = 0.64;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), bodyMat);
    head.position.y = 0.9;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.016, 8, 24), goldTrim);
    halo.position.set(0, 0.96, -0.06);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 18), goldTrim);
    shield.rotation.x = Math.PI / 2;
    shield.position.set(-0.22, 0.56, 0.09);
    const maceShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), darkMetal);
    maceShaft.position.set(0.23, 0.68, 0.12);
    maceShaft.rotation.x = 0.3;
    const maceHead = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0), brightSteel);
    maceHead.position.set(0.23, 0.94, 0.21);
    fig.add(vestment, cuirass, head, halo, shield, maceShaft, maceHead);
  } else if (kind === 'bard') {
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 6, 10), darkMetal);
    legL.position.set(-0.08, 0.2, 0);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 6, 10), darkMetal);
    legR.position.set(0.08, 0.2, 0);
    const doublet = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.38, 12), clothMat);
    doublet.position.y = 0.56;
    const cape = new THREE.Mesh(createBeveledRectGeo(0.24, 0.55, 0.03, 0.008), clothMat);
    cape.position.set(-0.06, 0.52, -0.14);
    cape.rotation.set(0.2, 0.2, 0.15);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 12), bodyMat);
    head.position.y = 0.85;
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.022, 18), darkMetal);
    hatBrim.position.y = 0.92;
    hatBrim.rotation.z = 0.15;
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 6), goldTrim);
    feather.position.set(-0.12, 1.04, -0.02);
    feather.rotation.z = 0.65;
    const luteBody = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), woodMat);
    luteBody.scale.set(1, 1.25, 0.55);
    luteBody.position.set(0.04, 0.55, 0.17);
    luteBody.rotation.z = -0.5;
    const luteNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.28, 8), woodMat);
    luteNeck.position.set(0.16, 0.68, 0.18);
    luteNeck.rotation.z = -0.75;
    fig.add(legL, legR, doublet, cape, head, hatBrim, feather, luteBody, luteNeck);
  } else if (kind === 'ranger') {
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.28, 6, 10), darkMetal);
    legL.position.set(-0.075, 0.2, 0);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.28, 6, 10), darkMetal);
    legR.position.set(0.075, 0.2, 0);
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.44, 14), clothMat);
    coat.position.y = 0.56;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 12), clothMat);
    hood.position.y = 0.87;
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.36, 10), woodMat);
    quiver.position.set(0.08, 0.72, -0.15);
    quiver.rotation.z = -0.4;
    const bowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, 0.24, 0.18),
      new THREE.Vector3(-0.29, 0.56, 0.27),
      new THREE.Vector3(-0.22, 0.88, 0.18),
    ]);
    const bow = new THREE.Mesh(new THREE.TubeGeometry(bowCurve, 14, 0.022, 8, false), woodMat);
    fig.add(legL, legR, coat, hood, quiver, bow);
  } else if (kind === 'skeleton') {
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.42, 8), boneMat);
    legL.position.set(-0.07, 0.21, 0);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.42, 8), boneMat);
    legR.position.set(0.07, 0.21, 0);
    const pelvis = new THREE.Mesh(createBeveledRectGeo(0.16, 0.07, 0.1, 0.01), boneMat);
    pelvis.position.y = 0.42;
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.38, 8), boneMat);
    spine.position.y = 0.58;
    for (let r = 0; r < 3; r++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.105 - r * 0.01, 0.016, 6, 14), boneMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = 0.72 - r * 0.06;
      fig.add(rib);
    }
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), boneMat);
    skull.position.y = 0.88;
    const jaw = new THREE.Mesh(createBeveledRectGeo(0.09, 0.06, 0.09, 0.008), boneMat);
    jaw.position.set(0, 0.81, 0.04);
    const scimitar = new THREE.Mesh(createBeveledRectGeo(0.03, 0.46, 0.016, 0.004), darkMetal);
    scimitar.position.set(0.2, 0.68, 0.14);
    scimitar.rotation.x = 0.4;
    const buckler = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.028, 14), woodMat);
    buckler.rotation.x = Math.PI / 2;
    buckler.position.set(-0.18, 0.58, 0.1);
    fig.add(legL, legR, pelvis, spine, skull, jaw, scimitar, buckler);
  } else if (kind === 'orc') {
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.25, 6, 10), darkMetal);
    legL.position.set(-0.11, 0.19, 0);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.25, 6, 10), darkMetal);
    legR.position.set(0.11, 0.19, 0);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.17, 0.44, 14), bodyMat);
    torso.position.y = 0.56;
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.125, 10, 10), darkMetal);
    shoulder.position.set(-0.25, 0.74, 0);
    const head = new THREE.Mesh(createBeveledRectGeo(0.2, 0.2, 0.2, 0.025), clothMat);
    head.position.set(0, 0.88, 0.04);
    const tuskL = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), boneMat);
    tuskL.position.set(-0.055, 0.82, 0.15);
    const tuskR = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), boneMat);
    tuskR.position.set(0.055, 0.82, 0.15);
    const hammerShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), woodMat);
    hammerShaft.position.set(0.28, 0.58, 0.14);
    hammerShaft.rotation.x = 0.25;
    const hammerHead = new THREE.Mesh(createBeveledRectGeo(0.16, 0.16, 0.26, 0.015), darkMetal);
    hammerHead.position.set(0.28, 0.98, 0.24);
    hammerHead.rotation.x = 0.25;
    fig.add(legL, legR, torso, shoulder, head, tuskL, tuskR, hammerShaft, hammerHead);
  } else if (kind === 'beholder') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), clothMat);
    body.position.y = 0.62;
    const mainEye = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.15 })
    );
    mainEye.position.set(0, 0.68, 0.22);
    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xef4444, emissiveIntensity: 0.85 })
    );
    pupil.position.set(0, 0.68, 0.315);
    for (let t = -3; t <= 3; t++) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 5), boneMat);
      fang.position.set(t * 0.036, 0.49, 0.23 - Math.abs(t) * 0.012);
      fang.rotation.x = Math.PI;
      fig.add(fang);
    }
    fig.add(body, mainEye, pupil);

    const eyeGlowMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.95,
      roughness: 0.2,
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sx = Math.cos(a) * 0.22;
      const sz = Math.sin(a) * 0.22;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx * 0.7, 0.78, sz * 0.7),
        new THREE.Vector3(sx * 1.4, 0.96 + (i % 2) * 0.1, sz * 1.4),
        new THREE.Vector3(sx * 1.65, 1.08 + (i % 3) * 0.06, sz * 1.65),
      ]);
      const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.025, 8, false), bodyMat);
      const smallEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), eyeGlowMat);
      smallEye.position.set(sx * 1.65, 1.08 + (i % 3) * 0.06, sz * 1.65);
      fig.add(stalk, smallEye);
    }
  } else if (kind === 'mimic') {
    const baseBox = new THREE.Mesh(createBeveledRectGeo(0.54, 0.24, 0.38, 0.015), woodMat);
    baseBox.position.y = 0.14;
    const lid = new THREE.Mesh(createBeveledRectGeo(0.54, 0.16, 0.38, 0.015), woodMat);
    lid.position.set(0, 0.38, -0.12);
    lid.rotation.x = -0.65;
    const band = new THREE.Mesh(createBeveledRectGeo(0.57, 0.06, 0.4, 0.008), goldTrim);
    band.position.y = 0.22;
    const tongueCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.24, 0.05),
      new THREE.Vector3(0.04, 0.32, 0.24),
      new THREE.Vector3(-0.04, 0.16, 0.36),
    ]);
    const tongue = new THREE.Mesh(
      new THREE.TubeGeometry(tongueCurve, 12, 0.045, 8, false),
      new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.3 })
    );
    fig.add(baseBox, lid, band, tongue);
    for (let t = -2; t <= 2; t++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 5), boneMat);
      tooth.position.set(t * 0.1, 0.29, 0.18);
      fig.add(tooth);
    }
  } else if (kind === 'goblin') {
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.22, 10), darkMetal);
    legs.position.y = 0.11;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.26, 10), bodyMat);
    torso.position.set(0, 0.33, 0.03);
    torso.rotation.x = 0.22;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), clothMat);
    head.position.set(0, 0.53, 0.07);
    const earGeo = new THREE.ConeGeometry(0.04, 0.16, 5);
    const earL = new THREE.Mesh(earGeo, clothMat);
    earL.position.set(-0.14, 0.55, 0.04);
    earL.rotation.z = 1.25;
    const earR = new THREE.Mesh(earGeo, clothMat);
    earR.position.set(0.14, 0.55, 0.04);
    earR.rotation.z = -1.25;
    const cleaver = new THREE.Mesh(createBeveledRectGeo(0.03, 0.32, 0.09, 0.005), brightSteel);
    cleaver.position.set(0.2, 0.44, 0.14);
    cleaver.rotation.x = 0.5;
    const buckler = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14), goldTrim);
    buckler.rotation.z = Math.PI / 2;
    buckler.position.set(-0.18, 0.36, 0.1);
    fig.add(legs, torso, head, earL, earR, cleaver, buckler);
  } else if (kind === 'golem') {
    const legL = new THREE.Mesh(createBeveledRectGeo(0.18, 0.38, 0.2, 0.018), bodyMat);
    legL.position.set(-0.15, 0.19, 0);
    const legR = new THREE.Mesh(createBeveledRectGeo(0.18, 0.38, 0.2, 0.018), bodyMat);
    legR.position.set(0.15, 0.19, 0);
    const torso = new THREE.Mesh(createBeveledRectGeo(0.52, 0.46, 0.34, 0.025), bodyMat);
    torso.position.y = 0.6;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 1.5,
      })
    );
    core.position.set(0, 0.62, 0.16);
    const head = new THREE.Mesh(createBeveledRectGeo(0.22, 0.18, 0.22, 0.018), darkMetal);
    head.position.y = 0.92;
    const armL = new THREE.Mesh(createBeveledRectGeo(0.18, 0.54, 0.18, 0.018), bodyMat);
    armL.position.set(-0.37, 0.52, 0.04);
    const armR = new THREE.Mesh(createBeveledRectGeo(0.18, 0.54, 0.18, 0.018), bodyMat);
    armR.position.set(0.37, 0.52, 0.04);
    fig.add(legL, legR, torso, core, head, armL, armR);
  } else {
    // Dragon with sculpted snout, jaw, dorsal spine & veined beveled bat wings
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), bodyMat);
    body.scale.set(0.95, 0.85, 1.38);
    body.position.set(0, 0.36, -0.05);
    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.44, 0.18),
      new THREE.Vector3(0, 0.72, 0.28),
      new THREE.Vector3(0, 0.92, 0.18),
      new THREE.Vector3(0, 1.02, 0.32),
    ]);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 14, 0.105, 10, false), bodyMat);
    const cranium = new THREE.Mesh(createBeveledRectGeo(0.2, 0.15, 0.22, 0.025), bodyMat);
    cranium.position.set(0, 1.05, 0.36);
    const snout = new THREE.Mesh(createBeveledRectGeo(0.13, 0.1, 0.2, 0.018), bodyMat);
    snout.position.set(0, 1.01, 0.52);
    const jaw = new THREE.Mesh(createBeveledRectGeo(0.11, 0.05, 0.17, 0.01), darkMetal);
    jaw.position.set(0, 0.94, 0.49);
    jaw.rotation.x = 0.18;
    const hornGeo = new THREE.ConeGeometry(0.036, 0.25, 8);
    const hornL = new THREE.Mesh(hornGeo, goldTrim);
    hornL.position.set(-0.08, 1.18, 0.26);
    hornL.rotation.x = -0.68;
    const hornR = new THREE.Mesh(hornGeo, goldTrim);
    hornR.position.set(0.08, 1.18, 0.26);
    hornR.rotation.x = -0.68;
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.28, -0.35),
      new THREE.Vector3(-0.16, 0.22, -0.58),
      new THREE.Vector3(0.08, 0.32, -0.78),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 14, 0.058, 8, false), bodyMat);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(0.65, 0.48);
    wingShape.lineTo(0.48, -0.06);
    wingShape.lineTo(0.32, 0.08);
    wingShape.lineTo(0.18, -0.08);
    wingShape.lineTo(0, -0.14);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.02,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.008,
    });
    const wingL = new THREE.Mesh(wingGeo, clothMat);
    wingL.position.set(-0.15, 0.56, -0.05);
    wingL.rotation.set(0.15, -Math.PI * 0.82, 0.2);
    const wingR = new THREE.Mesh(wingGeo, clothMat);
    wingR.position.set(0.15, 0.56, -0.05);
    wingR.rotation.set(0.15, -0.18, 0.2);
    fig.add(body, neck, cranium, snout, jaw, hornL, hornR, tail, wingL, wingR);
  }

  const scaleFactor = footprint * 0.92;
  fig.scale.setScalar(scaleFactor);
  fig.position.y = baseTopY;

  fig.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  root.add(fig);
  return root;
}

export function createTerrainProp(
  kind: PropKind,
  textures: { stoneMap: THREE.Texture; woodMap: THREE.Texture }
): { group: THREE.Group; pointLight?: THREE.PointLight; flameMesh?: THREE.Mesh } {
  const group = new THREE.Group();
  let pointLight: THREE.PointLight | undefined;
  let flameMesh: THREE.Mesh | undefined;

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    color: 0xa4acb8,
    roughness: 0.82,
    metalness: 0.08,
  });
  const darkStone = new THREE.MeshStandardMaterial({
    color: 0x454b56,
    roughness: 0.88,
    metalness: 0.06,
  });
  const darkIron = new THREE.MeshStandardMaterial({
    color: 0x22262f,
    roughness: 0.34,
    metalness: 0.88,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodMap,
    color: 0xb27e50,
    roughness: 0.76,
    metalness: 0.05,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xdca43e,
    roughness: 0.22,
    metalness: 0.92,
  });

  if (kind === 'wall' || kind === 'wall_torch') {
    const plinth = new THREE.Mesh(createBeveledRectGeo(0.98, 0.16, 0.44, 0.015), darkStone);
    plinth.position.y = 0.08;
    // Stacked ashlar stone courses for realistic masonry relief
    for (let row = 0; row < 3; row++) {
      const y = 0.28 + row * 0.26;
      const split = row % 2 === 0;
      if (split) {
        const b1 = new THREE.Mesh(createBeveledRectGeo(0.46, 0.24, 0.34, 0.012), stoneMat);
        b1.position.set(-0.24, y, 0);
        const b2 = new THREE.Mesh(createBeveledRectGeo(0.46, 0.24, 0.34, 0.012), stoneMat);
        b2.position.set(0.24, y, 0);
        group.add(b1, b2);
      } else {
        const bMid = new THREE.Mesh(createBeveledRectGeo(0.54, 0.24, 0.35, 0.012), stoneMat);
        bMid.position.set(0, y, 0);
        const bL = new THREE.Mesh(createBeveledRectGeo(0.2, 0.24, 0.33, 0.01), darkStone);
        bL.position.set(-0.38, y, 0);
        const bR = new THREE.Mesh(createBeveledRectGeo(0.2, 0.24, 0.33, 0.01), darkStone);
        bR.position.set(0.38, y, 0);
        group.add(bMid, bL, bR);
      }
    }
    const cornice = new THREE.Mesh(createBeveledRectGeo(0.99, 0.13, 0.43, 0.015), darkIron);
    cornice.position.y = 1.02;
    const merlonL = new THREE.Mesh(createBeveledRectGeo(0.34, 0.16, 0.38, 0.012), stoneMat);
    merlonL.position.set(-0.28, 1.15, 0);
    const merlonR = new THREE.Mesh(createBeveledRectGeo(0.34, 0.16, 0.38, 0.012), stoneMat);
    merlonR.position.set(0.28, 1.15, 0);
    group.add(plinth, cornice, merlonL, merlonR);

    if (kind === 'wall_torch') {
      const sconceRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 14), darkIron);
      sconceRing.position.set(0, 0.78, 0.21);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.28, 8), woodMat);
      stick.position.set(0, 0.85, 0.29);
      stick.rotation.x = 0.35;
      flameMesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.065, 0.2, 8),
        new THREE.MeshStandardMaterial({
          color: 0xffc15e,
          emissive: 0xff7b1a,
          emissiveIntensity: 2.4,
          transparent: true,
          opacity: 0.92,
        })
      );
      flameMesh.position.set(0, 1.03, 0.34);
      pointLight = new THREE.PointLight(0xff8c32, 2.9, 5.4, 1.8);
      pointLight.position.set(0, 1.08, 0.42);
      group.add(sconceRing, stick, flameMesh, pointLight);
    }
  } else if (kind === 'pillar') {
    const plinth = new THREE.Mesh(createBeveledRectGeo(0.58, 0.14, 0.58, 0.018), darkStone);
    plinth.position.y = 0.07;
    const shaftPoints = [
      new THREE.Vector2(0.26, 0),
      new THREE.Vector2(0.24, 0.08),
      new THREE.Vector2(0.19, 0.16),
      new THREE.Vector2(0.18, 0.96),
      new THREE.Vector2(0.24, 1.06),
      new THREE.Vector2(0.27, 1.15),
      new THREE.Vector2(0, 1.15),
    ];
    const shaft = new THREE.Mesh(new THREE.LatheGeometry(shaftPoints, 14), stoneMat);
    shaft.position.y = 0.14;
    const collarB = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 16), darkIron);
    collarB.rotation.x = Math.PI / 2;
    collarB.position.y = 0.22;
    const collarT = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 8, 16), brassMat);
    collarT.rotation.x = Math.PI / 2;
    collarT.position.y = 1.2;
    const capital = new THREE.Mesh(createBeveledRectGeo(0.56, 0.12, 0.56, 0.016), stoneMat);
    capital.position.y = 1.35;
    group.add(plinth, shaft, collarB, collarT, capital);
  } else if (kind === 'brazier') {
    const baseFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.08, 6), darkIron);
    baseFoot.position.y = 0.04;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.18, 0.34, 8), darkIron);
    stand.position.y = 0.22;
    const bowlPoints = [
      new THREE.Vector2(0.08, 0),
      new THREE.Vector2(0.27, 0.06),
      new THREE.Vector2(0.32, 0.19),
      new THREE.Vector2(0.24, 0.19),
      new THREE.Vector2(0.16, 0.06),
      new THREE.Vector2(0, 0.04),
    ];
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPoints, 16), darkIron);
    bowl.position.y = 0.38;
    const bowlRim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.02, 8, 16), brassMat);
    bowlRim.rotation.x = Math.PI / 2;
    bowlRim.position.y = 0.56;
    const coals = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.18, 1),
      new THREE.MeshStandardMaterial({
        color: 0x3b1206,
        emissive: 0xff5a1f,
        emissiveIntensity: 1.5,
        roughness: 0.88,
      })
    );
    coals.scale.set(1, 0.38, 1);
    coals.position.y = 0.49;
    flameMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.135, 0.36, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffbe55,
        emissive: 0xff7b1a,
        emissiveIntensity: 2.3,
        transparent: true,
        opacity: 0.9,
        roughness: 0.2,
      })
    );
    flameMesh.position.y = 0.67;
    pointLight = new THREE.PointLight(0xff8c32, 3.2, 5.6, 1.8);
    pointLight.position.set(0, 0.88, 0);
    group.add(baseFoot, stand, bowl, bowlRim, coals, flameMesh, pointLight);
  } else if (kind === 'chest') {
    const body = new THREE.Mesh(createBeveledRectGeo(0.58, 0.26, 0.4, 0.015), woodMat);
    body.position.y = 0.13;
    const lid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.195, 0.195, 0.56, 14, 1, false, 0, Math.PI),
      woodMat
    );
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.25;
    const bandL = new THREE.Mesh(createBeveledRectGeo(0.055, 0.3, 0.43, 0.008), brassMat);
    bandL.position.set(-0.18, 0.16, 0);
    const bandR = new THREE.Mesh(createBeveledRectGeo(0.055, 0.3, 0.43, 0.008), brassMat);
    bandR.position.set(0.18, 0.16, 0);
    const lock = new THREE.Mesh(createBeveledRectGeo(0.09, 0.11, 0.045, 0.008), brassMat);
    lock.position.set(0, 0.22, 0.21);
    group.add(body, lid, bandL, bandR, lock);
  } else if (kind === 'tree') {
    // Organic gnarled trunk with flared roots + layered foliage clusters
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3321, roughness: 0.92 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x264b2b, roughness: 0.84 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x366538, roughness: 0.78 });
    const trunk = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.16, 0),
          new THREE.Vector2(0.11, 0.14),
          new THREE.Vector2(0.08, 0.45),
          new THREE.Vector2(0.04, 0.95),
          new THREE.Vector2(0, 0.95),
        ],
        10
      ),
      trunkMat
    );
    group.add(trunk);
    const clusters = [
      { x: 0, y: 0.68, z: 0, r: 0.36, m: leafMat1 },
      { x: -0.18, y: 0.76, z: 0.14, r: 0.24, m: leafMat2 },
      { x: 0.18, y: 0.78, z: -0.12, r: 0.24, m: leafMat1 },
      { x: 0, y: 0.98, z: 0, r: 0.3, m: leafMat2 },
      { x: 0.1, y: 1.04, z: 0.12, r: 0.2, m: leafMat1 },
      { x: 0, y: 1.24, z: 0, r: 0.21, m: leafMat2 },
    ];
    clusters.forEach((c) => {
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(c.r, 1), c.m);
      puff.scale.set(1.12, 0.82, 1.12);
      puff.position.set(c.x, c.y, c.z);
      group.add(puff);
    });
  } else if (kind === 'stairs') {
    for (let s = 0; s < 4; s++) {
      const h = (s + 1) * 0.115;
      const step = new THREE.Mesh(createBeveledRectGeo(0.9, h, 0.24, 0.012), stoneMat);
      step.position.set(0, h / 2, -0.36 + s * 0.24);
      group.add(step);
    }
    const trimL = new THREE.Mesh(createBeveledRectGeo(0.07, 0.48, 0.96, 0.012), darkStone);
    trimL.position.set(-0.46, 0.24, 0);
    const trimR = new THREE.Mesh(createBeveledRectGeo(0.07, 0.48, 0.96, 0.012), darkStone);
    trimR.position.set(0.46, 0.24, 0);
    group.add(trimL, trimR);
  } else if (kind === 'arch') {
    // True curved stone archway + recessed oak double door
    const archShape = new THREE.Shape();
    archShape.moveTo(-0.49, 0);
    archShape.lineTo(-0.27, 0);
    archShape.lineTo(-0.27, 0.72);
    archShape.absarc(0, 0.72, 0.27, Math.PI, 0, true);
    archShape.lineTo(0.27, 0);
    archShape.lineTo(0.49, 0);
    archShape.lineTo(0.49, 1.22);
    archShape.lineTo(-0.49, 1.22);
    archShape.closePath();

    const archMesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(archShape, {
        depth: 0.34,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.015,
        bevelSegments: 2,
      }),
      stoneMat
    );
    archMesh.position.set(0, 0, -0.17);
    const keystone = new THREE.Mesh(createBeveledRectGeo(0.18, 0.22, 0.4, 0.012), brassMat);
    keystone.position.set(0, 1.08, 0);
    const doorLeaf = new THREE.Mesh(createBeveledRectGeo(0.38, 0.94, 0.06, 0.01), woodMat);
    doorLeaf.position.set(-0.18, 0.47, 0.14);
    doorLeaf.rotation.y = 0.58;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), brassMat);
    handle.position.set(-0.04, 0.45, 0.24);
    group.add(archMesh, keystone, doorLeaf, handle);
  } else if (kind === 'table') {
    const top = new THREE.Mesh(createBeveledRectGeo(0.88, 0.075, 0.64, 0.014), woodMat);
    top.position.y = 0.42;
    const legGeo = new THREE.CylinderGeometry(0.036, 0.045, 0.4, 8);
    [
      [-0.34, -0.22],
      [0.34, -0.22],
      [-0.34, 0.22],
      [0.34, 0.22],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, 0.2, lz);
      group.add(leg);
    });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), brassMat);
    mug.position.set(0.16, 0.5, 0.08);
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.028, 0.1, 8),
      new THREE.MeshStandardMaterial({ color: 0xf5e8c8, roughness: 0.6 })
    );
    candle.position.set(-0.12, 0.5, -0.05);
    const wickGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xff8c24, emissiveIntensity: 2.2 })
    );
    wickGlow.position.set(-0.12, 0.56, -0.05);
    group.add(top, mug, candle, wickGlow);
  } else if (kind === 'bookshelf') {
    const frame = new THREE.Mesh(createBeveledRectGeo(0.88, 1.12, 0.32, 0.014), woodMat);
    frame.position.y = 0.56;
    const cornice = new THREE.Mesh(createBeveledRectGeo(0.94, 0.08, 0.36, 0.012), woodMat);
    cornice.position.y = 1.14;
    group.add(frame, cornice);
    const bookColors = [0x991b1b, 0x1e3a8a, 0x166534, 0x92400e, 0x581c87];
    for (let shelf = 0; shelf < 3; shelf++) {
      const sy = 0.26 + shelf * 0.3;
      for (let b = 0; b < 5; b++) {
        const book = new THREE.Mesh(
          createBeveledRectGeo(0.1, 0.22, 0.24, 0.008),
          new THREE.MeshStandardMaterial({
            color: bookColors[(shelf + b) % bookColors.length],
            roughness: 0.62,
          })
        );
        book.position.set(-0.28 + b * 0.14, sy, 0.07);
        group.add(book);
      }
    }
  } else if (kind === 'barrel') {
    const bPoints = [
      new THREE.Vector2(0.15, 0),
      new THREE.Vector2(0.205, 0.22),
      new THREE.Vector2(0.15, 0.44),
      new THREE.Vector2(0, 0.44),
    ];
    const bGeo = new THREE.LatheGeometry(bPoints, 16);
    const b1 = new THREE.Mesh(bGeo, woodMat);
    b1.position.set(-0.18, 0, -0.1);
    const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.198, 0.014, 6, 16), darkIron);
    hoop1.rotation.x = Math.PI / 2;
    hoop1.position.set(-0.18, 0.22, -0.1);
    const hoop2 = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.012, 6, 16), darkIron);
    hoop2.rotation.x = Math.PI / 2;
    hoop2.position.set(-0.18, 0.36, -0.1);
    const crate = new THREE.Mesh(createBeveledRectGeo(0.38, 0.36, 0.38, 0.015), woodMat);
    crate.position.set(0.18, 0.18, 0.12);
    crate.rotation.y = 0.25;
    group.add(b1, hoop1, hoop2, crate);
  } else if (kind === 'altar') {
    const base = new THREE.Mesh(createBeveledRectGeo(0.88, 0.14, 0.66, 0.016), darkStone);
    base.position.y = 0.07;
    const pedestal = new THREE.Mesh(createBeveledRectGeo(0.66, 0.38, 0.44, 0.014), stoneMat);
    pedestal.position.y = 0.33;
    const slab = new THREE.Mesh(createBeveledRectGeo(0.84, 0.1, 0.6, 0.016), stoneMat);
    slab.position.y = 0.56;
    const cloth = new THREE.Mesh(
      createBeveledRectGeo(0.36, 0.48, 0.62, 0.012),
      new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.85 })
    );
    cloth.position.y = 0.38;
    const chalice = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.055, 0),
          new THREE.Vector2(0.02, 0.06),
          new THREE.Vector2(0.065, 0.14),
          new THREE.Vector2(0.052, 0.14),
          new THREE.Vector2(0, 0.08),
        ],
        14
      ),
      brassMat
    );
    chalice.position.y = 0.61;
    group.add(base, pedestal, slab, cloth, chalice);
  } else if (kind === 'throne') {
    const dais = new THREE.Mesh(createBeveledRectGeo(0.78, 0.12, 0.74, 0.016), darkStone);
    dais.position.y = 0.06;
    const seat = new THREE.Mesh(createBeveledRectGeo(0.52, 0.32, 0.46, 0.014), stoneMat);
    seat.position.set(0, 0.28, 0.04);
    const back = new THREE.Mesh(createBeveledRectGeo(0.56, 0.94, 0.14, 0.016), stoneMat);
    back.position.set(0, 0.62, -0.18);
    const armL = new THREE.Mesh(createBeveledRectGeo(0.1, 0.22, 0.44, 0.012), darkStone);
    armL.position.set(-0.24, 0.46, 0.02);
    const armR = new THREE.Mesh(createBeveledRectGeo(0.1, 0.22, 0.44, 0.012), darkStone);
    armR.position.set(0.24, 0.46, 0.02);
    const cushion = new THREE.Mesh(
      createBeveledRectGeo(0.4, 0.07, 0.36, 0.014),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.8 })
    );
    cushion.position.set(0, 0.46, 0.05);
    const crownTop = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), brassMat);
    crownTop.position.set(0, 1.16, -0.18);
    group.add(dais, seat, back, armL, armR, cushion, crownTop);
  } else if (kind === 'bed') {
    const frame = new THREE.Mesh(createBeveledRectGeo(0.68, 0.18, 0.92, 0.014), woodMat);
    frame.position.y = 0.12;
    const headboard = new THREE.Mesh(createBeveledRectGeo(0.7, 0.52, 0.08, 0.014), woodMat);
    headboard.position.set(0, 0.28, -0.42);
    const mattress = new THREE.Mesh(
      createBeveledRectGeo(0.58, 0.14, 0.82, 0.018),
      new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.9 })
    );
    mattress.position.set(0, 0.26, 0);
    const pillow = new THREE.Mesh(
      createBeveledRectGeo(0.42, 0.07, 0.18, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f4, roughness: 0.85 })
    );
    pillow.position.set(0, 0.34, -0.27);
    const blanket = new THREE.Mesh(
      createBeveledRectGeo(0.6, 0.15, 0.52, 0.018),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.85 })
    );
    blanket.position.set(0, 0.27, 0.16);
    group.add(frame, headboard, mattress, pillow, blanket);
  } else if (kind === 'fireplace') {
    const hearth = new THREE.Mesh(createBeveledRectGeo(0.94, 0.12, 0.62, 0.015), darkStone);
    hearth.position.y = 0.06;
    const sideL = new THREE.Mesh(createBeveledRectGeo(0.22, 0.92, 0.46, 0.014), stoneMat);
    sideL.position.set(-0.34, 0.52, -0.05);
    const sideR = new THREE.Mesh(createBeveledRectGeo(0.22, 0.92, 0.46, 0.014), stoneMat);
    sideR.position.set(0.34, 0.52, -0.05);
    const back = new THREE.Mesh(createBeveledRectGeo(0.9, 1.12, 0.16, 0.014), darkStone);
    back.position.set(0, 0.62, -0.22);
    const mantle = new THREE.Mesh(createBeveledRectGeo(0.98, 0.14, 0.52, 0.016), woodMat);
    mantle.position.set(0, 1.02, -0.04);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8), woodMat);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.16, 0.02);
    flameMesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.38, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffb347,
        emissive: 0xff6a1a,
        emissiveIntensity: 2.3,
        transparent: true,
        opacity: 0.9,
      })
    );
    flameMesh.position.set(0, 0.34, 0.02);
    pointLight = new THREE.PointLight(0xff8c32, 3.4, 6.2, 1.8);
    pointLight.position.set(0, 0.54, 0.28);
    group.add(hearth, sideL, sideR, back, mantle, log, flameMesh, pointLight);
  } else if (kind === 'crystal') {
    const rockBase = new THREE.Mesh(new THREE.DodecahedronGeometry(0.27, 1), darkStone);
    rockBase.scale.set(1.2, 0.45, 1.2);
    rockBase.position.y = 0.08;
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.35,
      roughness: 0.12,
      metalness: 0.15,
      clearcoat: 1,
    });
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.8, 6), crystalMat);
    c1.position.set(0, 0.45, 0);
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.54, 6), crystalMat);
    c2.position.set(-0.14, 0.3, 0.08);
    c2.rotation.z = 0.32;
    const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.46, 6), crystalMat);
    c3.position.set(0.14, 0.26, -0.06);
    c3.rotation.z = -0.35;
    pointLight = new THREE.PointLight(0x38bdf8, 2.5, 4.8, 1.8);
    pointLight.position.set(0, 0.65, 0);
    group.add(rockBase, c1, c2, c3, pointLight);
  } else if (kind === 'grave') {
    const mound = new THREE.Mesh(createBeveledRectGeo(0.58, 0.1, 0.78, 0.018), darkStone);
    mound.position.set(0, 0.05, 0.08);
    const headstone = new THREE.Mesh(createBeveledRectGeo(0.46, 0.56, 0.14, 0.016), stoneMat);
    headstone.position.set(0, 0.32, -0.24);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.14, 14, 1, false, 0, Math.PI),
      stoneMat
    );
    cap.rotation.x = Math.PI / 2;
    cap.rotation.z = Math.PI / 2;
    cap.position.set(0, 0.58, -0.24);
    group.add(mound, headstone, cap);
  } else if (kind === 'bridge') {
    const deck = new THREE.Mesh(createBeveledRectGeo(0.98, 0.12, 0.98, 0.015), woodMat);
    deck.position.y = 0.08;
    const railL = new THREE.Mesh(createBeveledRectGeo(0.08, 0.34, 0.96, 0.012), stoneMat);
    railL.position.set(-0.44, 0.24, 0);
    const railR = new THREE.Mesh(createBeveledRectGeo(0.08, 0.34, 0.96, 0.012), stoneMat);
    railR.position.set(0.44, 0.24, 0);
    group.add(deck, railL, railR);
  } else if (kind === 'fountain') {
    const basin = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.44, 0),
          new THREE.Vector2(0.46, 0.22),
          new THREE.Vector2(0.39, 0.22),
          new THREE.Vector2(0.36, 0.08),
          new THREE.Vector2(0, 0.08),
        ],
        16
      ),
      stoneMat
    );
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.37, 0.37, 0.04, 16),
      new THREE.MeshPhysicalMaterial({
        color: 0x0ea5e9,
        roughness: 0.08,
        metalness: 0.2,
        clearcoat: 1,
        transparent: true,
        opacity: 0.84,
      })
    );
    water.position.y = 0.18;
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.14, 0.64, 12), stoneMat);
    spire.position.y = 0.38;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.1, 0.12, 12), brassMat);
    bowl.position.y = 0.62;
    group.add(basin, water, spire, bowl);
  }

  group.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return { group, pointLight, flameMesh };
}

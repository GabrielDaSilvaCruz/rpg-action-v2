import * as THREE from 'three';

export interface ProceduralTexturePack {
  stoneMap: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  cobbleMap: THREE.CanvasTexture;
  cobbleBump: THREE.CanvasTexture;
  woodMap: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  grassMap: THREE.CanvasTexture;
  grassBump: THREE.CanvasTexture;
  cliffMap: THREE.CanvasTexture;
  cliffBump: THREE.CanvasTexture;
  lavaMap: THREE.CanvasTexture;
  tableWoodMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  resinBump: THREE.CanvasTexture;
  chessStoneMap: THREE.CanvasTexture;
  chessStoneBump: THREE.CanvasTexture;
  emberMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size = 512): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number,
  repeat = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  tex.needsUpdate = true;
  return tex;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTexturePack {
  const rng = seededRand(42017);

  // 1. Sculpted Dungeon Flagstone (512x512)
  const [stoneC, stoneCtx] = makeCanvas(512);
  const [stoneBC, stoneBCtx] = makeCanvas(512);
  stoneCtx.fillStyle = '#252a32';
  stoneCtx.fillRect(0, 0, 512, 512);
  stoneBCtx.fillStyle = '#282828';
  stoneBCtx.fillRect(0, 0, 512, 512);

  const slabs = [
    [10, 10, 236, 236],
    [264, 10, 238, 236],
    [10, 264, 236, 238],
    [264, 264, 238, 238],
  ];
  slabs.forEach(([x, y, w, h], idx) => {
    const base = 74 + idx * 5;
    const grad = stoneCtx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, `rgb(${base + 12}, ${base + 16}, ${base + 24})`);
    grad.addColorStop(0.5, `rgb(${base}, ${base + 4}, ${base + 11})`);
    grad.addColorStop(1, `rgb(${base - 10}, ${base - 6}, ${base + 2})`);
    stoneCtx.fillStyle = grad;
    stoneCtx.beginPath();
    stoneCtx.roundRect(x, y, w, h, 14);
    stoneCtx.fill();

    // Subtle chisel highlight on top-left bevel
    stoneCtx.strokeStyle = 'rgba(210, 222, 240, 0.16)';
    stoneCtx.lineWidth = 4;
    stoneCtx.stroke();

    const bGrad = stoneBCtx.createRadialGradient(
      x + w / 2,
      y + h / 2,
      10,
      x + w / 2,
      y + h / 2,
      w * 0.72
    );
    bGrad.addColorStop(0, '#c8c8c8');
    bGrad.addColorStop(0.85, '#9e9e9e');
    bGrad.addColorStop(1, '#585858');
    stoneBCtx.fillStyle = bGrad;
    stoneBCtx.beginPath();
    stoneBCtx.roundRect(x, y, w, h, 14);
    stoneBCtx.fill();

    // Fine stone cracks
    stoneCtx.strokeStyle = 'rgba(18, 21, 27, 0.45)';
    stoneCtx.lineWidth = 2;
    stoneBCtx.strokeStyle = '#3c3c3c';
    stoneBCtx.lineWidth = 2.5;
    const cx = x + 35 + rng() * (w - 70);
    const cy = y + 35 + rng() * (h - 70);
    stoneCtx.beginPath();
    stoneCtx.moveTo(cx, cy);
    stoneCtx.lineTo(cx + (rng() - 0.5) * 65, cy + (rng() - 0.5) * 65);
    stoneCtx.lineTo(cx + (rng() - 0.5) * 90, cy + (rng() - 0.5) * 90);
    stoneCtx.stroke();
    stoneBCtx.beginPath();
    stoneBCtx.moveTo(cx, cy);
    stoneBCtx.lineTo(cx + 22, cy + 16);
    stoneBCtx.stroke();
  });

  for (let i = 0; i < 3200; i++) {
    const px = rng() * 512;
    const py = rng() * 512;
    const sz = 1 + rng() * 3;
    const light = rng() > 0.5;
    stoneCtx.fillStyle = light ? 'rgba(205,215,230,0.06)' : 'rgba(14,17,22,0.12)';
    stoneCtx.fillRect(px, py, sz, sz);
    stoneBCtx.fillStyle = light ? 'rgba(225,225,225,0.12)' : 'rgba(55,55,55,0.14)';
    stoneBCtx.fillRect(px, py, sz, sz);
  }

  const stoneMap = finalizeTexture(stoneC, true, maxAnisotropy);
  const stoneBump = finalizeTexture(stoneBC, false, maxAnisotropy);

  // 2. Sculpted Cobblestone (512x512)
  const [cobC, cobCtx] = makeCanvas(512);
  const [cobBC, cobBCtx] = makeCanvas(512);
  cobCtx.fillStyle = '#1d2128';
  cobCtx.fillRect(0, 0, 512, 512);
  cobBCtx.fillStyle = '#202020';
  cobBCtx.fillRect(0, 0, 512, 512);

  const cols = 4;
  const rows = 4;
  const cellW = 512 / cols;
  const cellH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offset = r % 2 === 1 ? cellW * 0.42 : 0;
      const sx = (c * cellW + offset) % 512;
      const sy = r * cellH;
      const drawStone = (ox: number) => {
        const shade = 78 + ((r * 17 + c * 29) % 28);
        const warm = ((r + c) % 3) * 5;
        const g = cobCtx.createLinearGradient(ox, sy, ox + cellW, sy + cellH);
        g.addColorStop(0, `rgb(${shade + 14 + warm}, ${shade + 14}, ${shade + 18})`);
        g.addColorStop(1, `rgb(${shade - 12}, ${shade - 10}, ${shade - 6})`);
        cobCtx.fillStyle = g;
        cobCtx.beginPath();
        cobCtx.roundRect(ox + 6, sy + 6, cellW - 12, cellH - 12, 18);
        cobCtx.fill();
        cobCtx.strokeStyle = 'rgba(225,232,245,0.15)';
        cobCtx.lineWidth = 3;
        cobCtx.stroke();

        const bg = cobBCtx.createRadialGradient(
          ox + cellW / 2,
          sy + cellH / 2,
          6,
          ox + cellW / 2,
          sy + cellH / 2,
          cellW * 0.52
        );
        bg.addColorStop(0, '#dadada');
        bg.addColorStop(0.75, '#a8a8a8');
        bg.addColorStop(1, '#505050');
        cobBCtx.fillStyle = bg;
        cobBCtx.beginPath();
        cobBCtx.roundRect(ox + 6, sy + 6, cellW - 12, cellH - 12, 18);
        cobBCtx.fill();
      };
      drawStone(sx);
      if (sx + cellW > 512) drawStone(sx - 512);
    }
  }
  for (let i = 0; i < 1800; i++) {
    cobCtx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.09)';
    cobCtx.fillRect(rng() * 512, rng() * 512, 2.5, 2.5);
  }
  const cobbleMap = finalizeTexture(cobC, true, maxAnisotropy);
  const cobbleBump = finalizeTexture(cobBC, false, maxAnisotropy);

  // 3. Tavern / Bridge Oak Wood Planks (512x512)
  const [woodC, woodCtx] = makeCanvas(512);
  const [woodBC, woodBCtx] = makeCanvas(512);
  woodCtx.fillStyle = '#3b2414';
  woodCtx.fillRect(0, 0, 512, 512);
  woodBCtx.fillStyle = '#303030';
  woodBCtx.fillRect(0, 0, 512, 512);

  for (let p = 0; p < 4; p++) {
    const y = p * 128;
    const tone = 92 + (p % 2) * 14 - (p === 2 ? 8 : 0);
    const pg = woodCtx.createLinearGradient(0, y, 0, y + 124);
    pg.addColorStop(0, `rgb(${tone + 26}, ${Math.round(tone * 0.78)}, ${Math.round(tone * 0.48)})`);
    pg.addColorStop(0.5, `rgb(${tone + 14}, ${Math.round(tone * 0.68)}, ${Math.round(tone * 0.4)})`);
    pg.addColorStop(1, `rgb(${tone - 4}, ${Math.round(tone * 0.55)}, ${Math.round(tone * 0.32)})`);
    woodCtx.fillStyle = pg;
    woodCtx.fillRect(0, y + 3, 512, 121);

    woodBCtx.fillStyle = '#9a9a9a';
    woodBCtx.fillRect(0, y + 3, 512, 121);

    // Organic wood grain waves
    for (let g = 0; g < 34; g++) {
      const gy = y + 6 + (g * 3.4);
      woodCtx.strokeStyle = g % 2 === 0 ? 'rgba(38, 20, 8, 0.24)' : 'rgba(188, 134, 82, 0.14)';
      woodCtx.lineWidth = 1.6;
      woodCtx.beginPath();
      woodCtx.moveTo(0, gy);
      woodCtx.bezierCurveTo(170, gy + Math.sin(g) * 4, 340, gy - Math.cos(g) * 4, 512, gy);
      woodCtx.stroke();

      woodBCtx.strokeStyle = g % 2 === 0 ? '#767676' : '#b2b2b2';
      woodBCtx.lineWidth = 1.4;
      woodBCtx.beginPath();
      woodBCtx.moveTo(0, gy);
      woodBCtx.lineTo(512, gy);
      woodBCtx.stroke();
    }

    // Iron plank nails
    const nailXs = [28, 484, p % 2 === 0 ? 256 : 168];
    for (const nx of nailXs) {
      for (const ny of [y + 24, y + 102]) {
        woodCtx.fillStyle = '#1b1817';
        woodCtx.beginPath();
        woodCtx.arc(nx, ny, 4.5, 0, Math.PI * 2);
        woodCtx.fill();
        woodBCtx.fillStyle = '#e0e0e0';
        woodBCtx.beginPath();
        woodBCtx.arc(nx, ny, 4.5, 0, Math.PI * 2);
        woodBCtx.fill();
      }
    }

    // Seam
    woodCtx.fillStyle = '#201107';
    woodCtx.fillRect(0, y, 512, 5);
    woodBCtx.fillStyle = '#1c1c1c';
    woodBCtx.fillRect(0, y, 512, 5);
  }
  const woodMap = finalizeTexture(woodC, true, maxAnisotropy);
  const woodBump = finalizeTexture(woodBC, false, maxAnisotropy);

  // 4. Organic Forest Turf & Moss (512x512)
  const [grassC, grassCtx] = makeCanvas(512);
  const [grassBC, grassBCtx] = makeCanvas(512);
  grassCtx.fillStyle = '#2d4725';
  grassCtx.fillRect(0, 0, 512, 512);
  grassBCtx.fillStyle = '#747474';
  grassBCtx.fillRect(0, 0, 512, 512);

  // Soil & moss patches
  for (let i = 0; i < 42; i++) {
    const cx = rng() * 512;
    const cy = rng() * 512;
    const rad = 24 + rng() * 52;
    const g = grassCtx.createRadialGradient(cx, cy, 4, cx, cy, rad);
    if (i % 4 === 0) {
      g.addColorStop(0, 'rgba(65, 52, 34, 0.45)');
      g.addColorStop(1, 'rgba(65, 52, 34, 0)');
    } else {
      g.addColorStop(0, 'rgba(72, 118, 52, 0.48)');
      g.addColorStop(1, 'rgba(72, 118, 52, 0)');
    }
    grassCtx.fillStyle = g;
    grassCtx.beginPath();
    grassCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    grassCtx.fill();
  }
  // Grass blade strokes
  for (let i = 0; i < 2400; i++) {
    const gx = rng() * 512;
    const gy = rng() * 512;
    const shade = 75 + Math.floor(rng() * 55);
    grassCtx.strokeStyle = `rgb(${Math.round(shade * 0.62)}, ${shade}, ${Math.round(shade * 0.44)})`;
    grassCtx.lineWidth = 2;
    grassCtx.beginPath();
    grassCtx.moveTo(gx, gy);
    grassCtx.lineTo(gx + (rng() - 0.5) * 6, gy - 6 - rng() * 7);
    grassCtx.stroke();

    const bv = 100 + Math.floor(rng() * 110);
    grassBCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    grassBCtx.fillRect(gx, gy, 3, 4);
  }
  const grassMap = finalizeTexture(grassC, true, maxAnisotropy);
  const grassBump = finalizeTexture(grassBC, false, maxAnisotropy);

  // 5. Stratified Cliff Masonry for Elevated Blocks (512x512)
  const [cliffC, cliffCtx] = makeCanvas(512);
  const [cliffBC, cliffBCtx] = makeCanvas(512);
  cliffCtx.fillStyle = '#20242c';
  cliffCtx.fillRect(0, 0, 512, 512);
  cliffBCtx.fillStyle = '#262626';
  cliffBCtx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 4; row++) {
    const ry = row * 128;
    const offset = row % 2 === 0 ? 0 : 64;
    for (let col = -1; col < 5; col++) {
      const rx = col * 128 + offset;
      const tone = 56 + ((row * 13 + (col + 2) * 19) % 24);
      cliffCtx.fillStyle = `rgb(${tone}, ${tone + 4}, ${tone + 10})`;
      cliffCtx.beginPath();
      cliffCtx.roundRect(rx + 4, ry + 4, 120, 120, 8);
      cliffCtx.fill();
      cliffCtx.strokeStyle = 'rgba(200,210,225,0.12)';
      cliffCtx.lineWidth = 2;
      cliffCtx.stroke();

      cliffBCtx.fillStyle = `rgb(${155 + ((row + col) % 35)}, ${155 + ((row + col) % 35)}, ${155 + ((row + col) % 35)})`;
      cliffBCtx.beginPath();
      cliffBCtx.roundRect(rx + 4, ry + 4, 120, 120, 8);
      cliffBCtx.fill();
    }
  }
  const cliffMap = finalizeTexture(cliffC, true, maxAnisotropy);
  const cliffBump = finalizeTexture(cliffBC, false, maxAnisotropy);

  // 6. Magma / Lava Crust (512x512)
  const [lavaC, lavaCtx] = makeCanvas(512);
  lavaCtx.fillStyle = '#26100a';
  lavaCtx.fillRect(0, 0, 512, 512);
  const grad = lavaCtx.createRadialGradient(256, 256, 20, 256, 256, 280);
  grad.addColorStop(0, '#ffae38');
  grad.addColorStop(0.42, '#ef4c11');
  grad.addColorStop(1, '#331109');
  lavaCtx.fillStyle = grad;
  lavaCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 28; i++) {
    const cx = 24 + rng() * 464;
    const cy = 24 + rng() * 464;
    const r = 16 + rng() * 34;
    lavaCtx.fillStyle = '#1b1312';
    lavaCtx.beginPath();
    lavaCtx.arc(cx, cy, r, 0, Math.PI * 2);
    lavaCtx.fill();
    lavaCtx.strokeStyle = 'rgba(255, 140, 35, 0.55)';
    lavaCtx.lineWidth = 3;
    lavaCtx.stroke();
  }
  const lavaMap = finalizeTexture(lavaC, true, maxAnisotropy);

  // 7. Rich Walnut Tabletop Frame (512x512)
  const [tabC, tabCtx] = makeCanvas(512);
  tabCtx.fillStyle = '#24160e';
  tabCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 120; i++) {
    tabCtx.fillStyle = i % 2 === 0 ? 'rgba(66, 40, 24, 0.34)' : 'rgba(16, 9, 5, 0.38)';
    tabCtx.fillRect(0, i * 4.3, 512, 3);
  }
  const tableWoodMap = finalizeTexture(tabC, true, maxAnisotropy, 3);

  // 8. Soft Radial Contact Shadow
  const [shC, shCtx] = makeCanvas(128);
  const shGrad = shCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  shGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shC);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;
  contactShadowMap.needsUpdate = true;

  // 9. Fine 3D-Print Micro-Layer Bump
  const [resC, resCtx] = makeCanvas(128);
  resCtx.fillStyle = '#808080';
  resCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    resCtx.fillStyle = y % 4 === 0 ? '#8c8c8c' : '#747474';
    resCtx.fillRect(0, y, 128, 1);
  }
  const resinBump = finalizeTexture(resC, false, maxAnisotropy, 4);

  // 9b. Honed Gray Chess-Stone (Granite / Limestone Marble 512x512)
  const [csC, csCtx] = makeCanvas(512);
  const [csBC, csBCtx] = makeCanvas(512);
  csCtx.fillStyle = '#a2a7af';
  csCtx.fillRect(0, 0, 512, 512);
  csBCtx.fillStyle = '#808080';
  csBCtx.fillRect(0, 0, 512, 512);

  // Soft cloudy mineral variations (keeps neutral chess-stone gray tone)
  for (let i = 0; i < 60; i++) {
    const cx = rng() * 512;
    const cy = rng() * 512;
    const rad = 28 + rng() * 75;
    const shade = rng() > 0.5 ? 'rgba(202, 207, 214, 0.14)' : 'rgba(112, 117, 126, 0.14)';
    const g = csCtx.createRadialGradient(cx, cy, 4, cx, cy, rad);
    g.addColorStop(0, shade);
    g.addColorStop(1, 'rgba(162, 167, 175, 0)');
    csCtx.fillStyle = g;
    csCtx.beginPath();
    csCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    csCtx.fill();
  }

  // Subtle carved stone veins
  for (let v = 0; v < 14; v++) {
    let vx = rng() * 512;
    let vy = rng() * 512;
    const lightVein = v % 3 === 0;
    csCtx.strokeStyle = lightVein ? 'rgba(218, 223, 230, 0.16)' : 'rgba(84, 89, 98, 0.14)';
    csCtx.lineWidth = 1.2 + rng() * 1.4;
    csBCtx.strokeStyle = lightVein ? '#949494' : '#6c6c6c';
    csBCtx.lineWidth = 1.4;
    csCtx.beginPath();
    csBCtx.beginPath();
    csCtx.moveTo(vx, vy);
    csBCtx.moveTo(vx, vy);
    for (let s = 0; s < 5; s++) {
      vx += (rng() - 0.5) * 90;
      vy += (rng() - 0.5) * 90;
      csCtx.lineTo(vx, vy);
      csBCtx.lineTo(vx, vy);
    }
    csCtx.stroke();
    csBCtx.stroke();
  }

  // Fine mineral grain speckles
  for (let i = 0; i < 4800; i++) {
    const px = rng() * 512;
    const py = rng() * 512;
    const sz = 1 + rng() * 2.2;
    const light = rng() > 0.48;
    csCtx.fillStyle = light ? 'rgba(220, 224, 230, 0.09)' : 'rgba(65, 70, 78, 0.09)';
    csCtx.fillRect(px, py, sz, sz);
    csBCtx.fillStyle = light ? 'rgba(180, 180, 180, 0.16)' : 'rgba(90, 90, 90, 0.16)';
    csBCtx.fillRect(px, py, sz, sz);
  }
  const chessStoneMap = finalizeTexture(csC, true, maxAnisotropy);
  const chessStoneBump = finalizeTexture(csBC, false, maxAnisotropy);

  // 10. Atmospheric Ember / Dust Sprite
  const [embC, embCtx] = makeCanvas(64);
  const embGrad = embCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  embGrad.addColorStop(0, 'rgba(255, 226, 165, 1)');
  embGrad.addColorStop(0.45, 'rgba(255, 155, 65, 0.55)');
  embGrad.addColorStop(1, 'rgba(255, 120, 20, 0)');
  embCtx.fillStyle = embGrad;
  embCtx.fillRect(0, 0, 64, 64);
  const emberMap = new THREE.CanvasTexture(embC);
  emberMap.colorSpace = THREE.SRGBColorSpace;
  emberMap.needsUpdate = true;

  return {
    stoneMap,
    stoneBump,
    cobbleMap,
    cobbleBump,
    woodMap,
    woodBump,
    grassMap,
    grassBump,
    cliffMap,
    cliffBump,
    lavaMap,
    tableWoodMap,
    contactShadowMap,
    resinBump,
    chessStoneMap,
    chessStoneBump,
    emberMap,
    dispose: () => {
      stoneMap.dispose();
      stoneBump.dispose();
      cobbleMap.dispose();
      cobbleBump.dispose();
      woodMap.dispose();
      woodBump.dispose();
      grassMap.dispose();
      grassBump.dispose();
      cliffMap.dispose();
      cliffBump.dispose();
      lavaMap.dispose();
      tableWoodMap.dispose();
      contactShadowMap.dispose();
      resinBump.dispose();
      chessStoneMap.dispose();
      chessStoneBump.dispose();
      emberMap.dispose();
    },
  };
}

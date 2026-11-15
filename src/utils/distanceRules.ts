import { MeasureRule } from '../types/vtt';

export const FEET_PER_CELL = 5;
export const METERS_PER_CELL = 1.5;

export interface DistanceResult {
  cells: number;
  feet: number;
  meters: number;
  dx: number;
  dz: number;
  elevationDiffSteps: number;
  elevationDiffFeet: number;
  ruleLabel: string;
}

export const MEASURE_RULES: { id: MeasureRule; label: string; shortDesc: string }[] = [
  { id: 'dnd5e', label: 'D&D 5e (5 ft)', shortDesc: 'Padrao 5e: toda casa e diagonal custam 5 ft (1 casa)' },
  { id: 'dnd5e_alt', label: '5e Alt (5/10/5)', shortDesc: 'Alternativo DMG: diagonais alternam entre 5 ft e 10 ft' },
  { id: 'euclidean', label: 'Direta (Real)', shortDesc: 'Distancia geometrica exata em linha reta' },
];

export function calculateGridDistance(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  rule: MeasureRule = 'dnd5e',
  startElev = 0,
  endElev = 0
): DistanceResult {
  const dx = Math.abs(endX - startX);
  const dz = Math.abs(endZ - startZ);

  let cells = 0;
  let feet = 0;

  if (rule === 'dnd5e') {
    const rawMax = Math.max(dx, dz);
    cells = Math.abs(rawMax - Math.round(rawMax)) < 0.05 ? Math.round(rawMax) : Number(rawMax.toFixed(1));
    feet = Math.round(cells * FEET_PER_CELL);
  } else if (rule === 'dnd5e_alt') {
    const maxAxis = Math.max(dx, dz);
    const minAxis = Math.min(dx, dz);
    const rawCells = maxAxis + Math.floor(minAxis / 2 + 1e-6);
    cells = Math.abs(rawCells - Math.round(rawCells)) < 0.05 ? Math.round(rawCells) : Number(rawCells.toFixed(1));
    feet = Math.round(cells * FEET_PER_CELL);
  } else {
    const dist = Math.hypot(dx, dz);
    cells = Math.abs(dist - Math.round(dist)) < 0.05 ? Math.round(dist) : Number(dist.toFixed(1));
    feet = Math.round(dist * FEET_PER_CELL);
  }

  const meters = Number((cells * METERS_PER_CELL).toFixed(1));
  const elevationDiffSteps = Math.abs(Math.round(endElev) - Math.round(startElev));
  const elevationDiffFeet = elevationDiffSteps * FEET_PER_CELL;
  const ruleLabel = MEASURE_RULES.find((r) => r.id === rule)?.label || 'D&D 5e';

  return {
    cells,
    feet,
    meters,
    dx: Number(dx.toFixed(2)),
    dz: Number(dz.toFixed(2)),
    elevationDiffSteps,
    elevationDiffFeet,
    ruleLabel,
  };
}

/**
 * Computes supercover grid coordinates traversed from (x0, z0) to (x1, z1)
 * for crisp grid-cell path highlights along the ruler beam.
 */
export function getTraversedGridCells(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  maxCells = 40
): { x: number; z: number }[] {
  const x0 = Math.round(startX);
  const z0 = Math.round(startZ);
  const x1 = Math.round(endX);
  const z1 = Math.round(endZ);

  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  if (steps === 0) return [{ x: x0, z: z0 }];

  const seen = new Set<string>();
  const result: { x: number; z: number }[] = [];
  const sampleCount = Math.min(steps * 2, maxCells * 2);

  for (let i = 0; i <= sampleCount; i++) {
    const t = i / sampleCount;
    const gx = Math.round(x0 + (x1 - x0) * t);
    const gz = Math.round(z0 + (z1 - z0) * t);
    const key = `${gx},${gz}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ x: gx, z: gz });
      if (result.length >= maxCells) break;
    }
  }

  return result;
}

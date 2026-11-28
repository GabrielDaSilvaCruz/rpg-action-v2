import { MapAnnotation, SavedScenario, TileCell, MiniatureData, MusicState } from '../types/vtt';

const SCENARIOS_KEY = 'rpg_v2_saved_scenarios';

export function getSavedScenarios(): SavedScenario[] {
  try {
    const raw = localStorage.getItem(SCENARIOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Falha ao carregar cenários salvos:', err);
    return [];
  }
}

export function saveScenario(
  name: string,
  tiles: Record<string, TileCell>,
  miniatures: Record<string, MiniatureData>,
  annotations: Record<string, MapAnnotation>,
  options: {
    description?: string;
    cols?: number;
    rows?: number;
    music?: MusicState | null;
    id?: string;
  } = {}
): SavedScenario {
  const scenarios = getSavedScenarios();
  const existingIdx = options.id
    ? scenarios.findIndex((s) => s.id === options.id)
    : scenarios.findIndex((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());

  const now = Date.now();
  const scenario: SavedScenario = {
    id: options.id || (existingIdx >= 0 ? scenarios[existingIdx].id : `scen-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`),
    name: name.trim() || 'Cenário Sem Nome',
    description: options.description || '',
    createdAt: existingIdx >= 0 ? scenarios[existingIdx].createdAt : now,
    updatedAt: now,
    cols: options.cols || 16,
    rows: options.rows || 16,
    tiles: JSON.parse(JSON.stringify(tiles || {})),
    miniatures: JSON.parse(JSON.stringify(miniatures || {})),
    annotations: JSON.parse(JSON.stringify(annotations || {})),
    music: options.music || null,
  };

  if (existingIdx >= 0) {
    scenarios[existingIdx] = scenario;
  } else {
    scenarios.unshift(scenario);
  }

  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  } catch (err) {
    console.error('Erro ao gravar cenário no localStorage:', err);
  }

  return scenario;
}

export function deleteScenario(id: string): void {
  const scenarios = getSavedScenarios().filter((s) => s.id !== id);
  try {
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
  } catch (err) {
    console.error('Erro ao deletar cenário do localStorage:', err);
  }
}

export function exportScenarioAsJson(scenario: SavedScenario): void {
  try {
    const jsonStr = JSON.stringify(scenario, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = scenario.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    a.href = url;
    a.download = `cenario-${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Erro ao exportar cenário como JSON:', err);
  }
}

export async function importScenarioFromJson(file: File): Promise<SavedScenario> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== 'object' || !parsed.tiles) {
    throw new Error('Arquivo JSON inválido. O arquivo não contém a estrutura de um cenário do RPG.');
  }

  const now = Date.now();
  const scenario: SavedScenario = {
    id: `scen-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: parsed.name ? `${parsed.name} (Importado)` : 'Cenário Importado',
    description: parsed.description || '',
    createdAt: now,
    updatedAt: now,
    cols: Number(parsed.cols) || 16,
    rows: Number(parsed.rows) || 16,
    tiles: parsed.tiles || {},
    miniatures: parsed.miniatures || {},
    annotations: parsed.annotations || {},
    music: parsed.music || null,
  };

  const scenarios = getSavedScenarios();
  scenarios.unshift(scenario);
  localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));

  return scenario;
}

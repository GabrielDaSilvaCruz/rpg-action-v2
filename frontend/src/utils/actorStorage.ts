import { CharacterSheet, MiniatureData, ModelFormat, FootprintSize, BaseStyle, MiniFinish, SavedActorTemplate } from '../types/vtt';

const ACTORS_KEY = 'rpg_v2_saved_actors';

export function getSavedActors(): SavedActorTemplate[] {
  try {
    const raw = localStorage.getItem(ACTORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Falha ao carregar fichas e monstros salvos:', err);
    return [];
  }
}

export function saveActorFromMini(mini: MiniatureData, customName?: string): SavedActorTemplate {
  const actors = getSavedActors();
  const name = customName?.trim() || mini.name;
  const isMonster = Boolean(mini.sheet?.isMonster || mini.ownerName === '__GM__');
  const type: 'hero' | 'monster' | 'npc' = isMonster ? 'monster' : 'hero';

  const template: SavedActorTemplate = {
    id: `actor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    type,
    format: mini.format,
    assetId: mini.assetId,
    assetName: mini.assetName,
    remoteUrl: mini.remoteUrl,
    footprint: mini.footprint,
    scaleMultiplier: mini.scaleMultiplier,
    fixZUp: mini.fixZUp,
    showBase: mini.showBase,
    baseStyle: mini.baseStyle,
    color: mini.color,
    finish: mini.finish,
    hp: mini.hp,
    maxHp: mini.maxHp,
    ownerName: mini.ownerName,
    sheet: mini.sheet ? JSON.parse(JSON.stringify(mini.sheet)) : {
      isMonster,
      hiddenFromPlayers: isMonster,
      raceOrType: 'Criatura',
      classOrRole: 'Combatente',
      levelOrCr: '1',
      ac: 12,
      speed: '30 ft (6 casas)',
      initiativeBonus: 0,
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      attacks: [{ name: 'Ataque Básico', bonus: '+2', damage: '1d6' }],
      abilities: '',
      equipment: '',
      notes: '',
    },
    savedAt: Date.now(),
  };

  actors.unshift(template);
  try {
    localStorage.setItem(ACTORS_KEY, JSON.stringify(actors));
  } catch (err) {
    console.error('Erro ao salvar ficha no localStorage:', err);
  }

  return template;
}

export function deleteSavedActor(id: string): void {
  const actors = getSavedActors().filter((a) => a.id !== id);
  try {
    localStorage.setItem(ACTORS_KEY, JSON.stringify(actors));
  } catch (err) {
    console.error('Erro ao deletar ator:', err);
  }
}

export function exportActorAsJson(actor: SavedActorTemplate | MiniatureData): void {
  try {
    const jsonStr = JSON.stringify(actor, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (actor.name || 'ficha').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    a.href = url;
    a.download = `ficha-${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Erro ao exportar ficha como JSON:', err);
  }
}

export async function importActorFromJson(file: File): Promise<SavedActorTemplate> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== 'object' || (!parsed.sheet && !parsed.name)) {
    throw new Error('Arquivo JSON inválido. O arquivo não contém a estrutura de uma ficha de RPG.');
  }

  const isMonster = Boolean(parsed.sheet?.isMonster || parsed.type === 'monster' || parsed.ownerName === '__GM__');

  const actor: SavedActorTemplate = {
    id: `actor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: parsed.name ? `${parsed.name} (Importado)` : 'Personagem Importado',
    type: isMonster ? 'monster' : 'hero',
    format: parsed.format || 'procedural',
    assetId: parsed.assetId || 'cat:guard',
    assetName: parsed.assetName || parsed.name || 'Miniatura',
    remoteUrl: parsed.remoteUrl || '',
    footprint: (parsed.footprint as FootprintSize) || 1,
    scaleMultiplier: Number(parsed.scaleMultiplier) || 1,
    fixZUp: Boolean(parsed.fixZUp),
    showBase: parsed.showBase !== false,
    baseStyle: (parsed.baseStyle as BaseStyle) || 'rune',
    color: parsed.color || '#f59e0b',
    finish: (parsed.finish as MiniFinish) || 'stone',
    hp: Number(parsed.hp) || 30,
    maxHp: Number(parsed.maxHp) || 30,
    ownerName: parsed.ownerName || '',
    sheet: parsed.sheet || {
      isMonster,
      hiddenFromPlayers: isMonster,
      raceOrType: 'Criatura',
      classOrRole: 'Guerreiro',
      levelOrCr: '1',
      ac: 12,
      speed: '30 ft',
      initiativeBonus: 0,
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      attacks: [{ name: 'Ataque', bonus: '+2', damage: '1d6' }],
      abilities: '',
      equipment: '',
      notes: '',
    },
    savedAt: Date.now(),
  };

  const actors = getSavedActors();
  actors.unshift(actor);
  localStorage.setItem(ACTORS_KEY, JSON.stringify(actors));

  return actor;
}

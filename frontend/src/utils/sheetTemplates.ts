import { CharacterSheet, MiniatureData, Role } from '../types/vtt';

export interface SheetTemplate {
  id: string;
  label: string;
  isMonster: boolean;
  suggestedHp: number;
  catalogAssetId?: string;
  sheet: CharacterSheet;
}

export function calcMod(score: number): number {
  const safe = Number.isFinite(score) ? score : 10;
  return Math.floor((safe - 10) / 2);
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function parseAttackBonus(bonusStr: string): number {
  const match = String(bonusStr || '').match(/[+-]?\d+/);
  if (!match) return 0;
  const val = parseInt(match[0], 10);
  return Number.isFinite(val) ? val : 0;
}

export const HERO_SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: 'hero-barbarian',
    label: 'Barbaro Draconato',
    isMonster: false,
    suggestedHp: 52,
    catalogAssetId: 'stl-hero-barbarian',
    sheet: {
      isMonster: false,
      hiddenFromPlayers: false,
      raceOrType: 'Draconato / Humanoide',
      classOrRole: 'Barbaro',
      levelOrCr: 'Nivel 4',
      ac: 15,
      speed: '40 ft (8 casas)',
      initiativeBonus: 2,
      stats: { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 },
      attacks: [
        { name: 'Machado Grande de Batalha', bonus: '+6', damage: '1d12+4 Cortante' },
        { name: 'Machadinha Arremesso', bonus: '+6', damage: '1d6+4 Cortante' },
      ],
      abilities: 'Furia (3/dia, +2 dano e resistencia a fisico), Ataque Descuidado, Sopro Draconico.',
      equipment: 'Machado Grande, 2 Machadinhas, Pocao de Cura (2d4+2).',
      notes: '',
    },
  },
  {
    id: 'hero-paladin',
    label: 'Cavaleiro / Paladino',
    isMonster: false,
    suggestedHp: 46,
    catalogAssetId: 'stl-hero-knight',
    sheet: {
      isMonster: false,
      hiddenFromPlayers: false,
      raceOrType: 'Humano / Humanoide',
      classOrRole: 'Paladino',
      levelOrCr: 'Nivel 4',
      ac: 18,
      speed: '30 ft (6 casas)',
      initiativeBonus: 1,
      stats: { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 16 },
      attacks: [
        { name: 'Espada Longa Runica', bonus: '+5', damage: '1d8+3 Cortante' },
        { name: 'Destruicao Divina (Smite)', bonus: '+5', damage: '1d8+3 + 2d8 Radiante' },
      ],
      abilities: 'Imposicao das Maos (20 PV), Sentido Divino, Juramento de Devocao.',
      equipment: 'Armadura de Placas, Escudo (+2 CA), Espada Longa, Simbolo Sagrado.',
      notes: '',
    },
  },
  {
    id: 'hero-mage',
    label: 'Arquimago Arcano',
    isMonster: false,
    suggestedHp: 30,
    catalogAssetId: 'stl-hero-mage',
    sheet: {
      isMonster: false,
      hiddenFromPlayers: false,
      raceOrType: 'Alto Elfo / Humanoide',
      classOrRole: 'Mago',
      levelOrCr: 'Nivel 4',
      ac: 13,
      speed: '30 ft (6 casas)',
      initiativeBonus: 2,
      stats: { str: 8, dex: 14, con: 13, int: 18, wis: 14, cha: 11 },
      attacks: [
        { name: 'Raio de Fogo (Truque)', bonus: '+6', damage: '1d10 Fogo' },
        { name: 'Misseis Magicos', bonus: '+6', damage: '3x (1d4+1 Forca)' },
        { name: 'Cajado Arcano', bonus: '+1', damage: '1d6-1 Concussao' },
      ],
      abilities: 'Armadura Arcana, Escudo Arcano (+5 CA reacao), Passo Nebuloso, Bola de Fogo (pergaminho).',
      equipment: 'Cajado Arcano, Grimorio, 2 Pocoes de Mana, Pergaminho Antigo.',
      notes: '',
    },
  },
  {
    id: 'hero-rogue',
    label: 'Ladino Tiefling',
    isMonster: false,
    suggestedHp: 34,
    catalogAssetId: 'stl-hero-rogue',
    sheet: {
      isMonster: false,
      hiddenFromPlayers: false,
      raceOrType: 'Tiefling / Humanoide',
      classOrRole: 'Ladino',
      levelOrCr: 'Nivel 4',
      ac: 15,
      speed: '35 ft (7 casas)',
      initiativeBonus: 4,
      stats: { str: 10, dex: 18, con: 13, int: 13, wis: 12, cha: 14 },
      attacks: [
        { name: 'Adagas Gemeas + Ataque Furtivo', bonus: '+6', damage: '1d4+4 + 2d6 Perfurante' },
        { name: 'Arco Curto Sombrio', bonus: '+6', damage: '1d6+4 Perfurante' },
      ],
      abilities: 'Ataque Furtivo (+2d6), Acao Ardilosa (Correr/Desengajar/Esconder bonus), Visao no Escuro.',
      equipment: 'Armadura de Couro Batido, Adagas Gemeas, Kit de Ladrao, Corda de Seda.',
      notes: '',
    },
  },
  {
    id: 'hero-cleric',
    label: 'Cleriga Ana',
    isMonster: false,
    suggestedHp: 40,
    catalogAssetId: 'stl-hero-cleric',
    sheet: {
      isMonster: false,
      hiddenFromPlayers: false,
      raceOrType: 'Ana da Colina / Humanoide',
      classOrRole: 'Cleriga',
      levelOrCr: 'Nivel 4',
      ac: 17,
      speed: '25 ft (5 casas)',
      initiativeBonus: 0,
      stats: { str: 14, dex: 10, con: 16, int: 10, wis: 18, cha: 12 },
      attacks: [
        { name: 'Martelo de Guerra', bonus: '+4', damage: '1d8+2 Concussao' },
        { name: 'Chama Sagrada (Truque)', bonus: '+6', damage: '1d8 Radiante (CD 14 DES)' },
      ],
      abilities: 'Curar Ferimentos (1d8+4), Palavra Curativa, Espiritos Guardioes, Expulsar Mortos-Vivos.',
      equipment: 'Cota de Malha, Escudo Sagrado, Martelo de Guerra, Simbolo da Forja.',
      notes: '',
    },
  },
  {
    id: 'hero-druid',
    label: 'Druida Elfa',
    isMonster: false,
    suggestedHp: 36,
    catalogAssetId: 'stl-hero-druid',
    sheet: {
      isMonster: false,
      hiddenFromPlayers: false,
      raceOrType: 'Elfa da Floresta / Humanoide',
      classOrRole: 'Druida',
      levelOrCr: 'Nivel 4',
      ac: 14,
      speed: '35 ft (7 casas)',
      initiativeBonus: 2,
      stats: { str: 10, dex: 14, con: 14, int: 12, wis: 18, cha: 11 },
      attacks: [
        { name: 'Cajado Espinhoso', bonus: '+6', damage: '1d8+4 Concussao' },
        { name: 'Lamina de Chamas / Espinhos', bonus: '+6', damage: '2d6 Fogo/Perfurante' },
      ],
      abilities: 'Forma Selvagem (2/descanso), Enredar, Curar Ferimentos, Chamar Relampagos.',
      equipment: 'Armadura de Couro, Foco Druidico, Cajado de Carvalho, Ervas Medicinais.',
      notes: '',
    },
  },
  {
    id: 'hero-custom',
    label: 'Aventureiro Personalizado',
    isMonster: false,
    suggestedHp: 35,
    catalogAssetId: 'stl-hero-fighter',
    sheet: {
      isMonster: false,
      hiddenFromPlayers: false,
      raceOrType: 'Humano',
      classOrRole: 'Aventureiro',
      levelOrCr: 'Nivel 1',
      ac: 14,
      speed: '30 ft (6 casas)',
      initiativeBonus: 2,
      stats: { str: 12, dex: 14, con: 13, int: 10, wis: 12, cha: 11 },
      attacks: [{ name: 'Arma Principal', bonus: '+4', damage: '1d8+2' }],
      abilities: '',
      equipment: 'Mochila de explorador, tochas, racoes.',
      notes: '',
    },
  },
];

export const MONSTER_SHEET_TEMPLATES: SheetTemplate[] = [
  {
    id: 'mon-goblin-warrior',
    label: 'Goblin Guerreiro',
    isMonster: true,
    suggestedHp: 18,
    catalogAssetId: 'stl-goblin',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Humanoide (Goblin)',
      classOrRole: 'Batedor / Infantaria',
      levelOrCr: 'ND 1/4',
      ac: 15,
      speed: '30 ft (6 casas)',
      initiativeBonus: 2,
      stats: { str: 10, dex: 14, con: 11, int: 10, wis: 8, cha: 8 },
      attacks: [
        { name: 'Clava com Espinhos', bonus: '+4', damage: '1d6+2 Concussao' },
        { name: 'Arco Curto', bonus: '+4', damage: '1d6+2 Perfurante' },
      ],
      abilities: 'Fuga Agil: usa acao bonus para Desengajar ou Esconder.',
      equipment: 'Escudo de Madeira, Clava, 5 moedas de ouro.',
      notes: 'Ataca em grupo e recua para cobertura.',
    },
  },
  {
    id: 'mon-lich-necromancer',
    label: 'Lich Necromante',
    isMonster: true,
    suggestedHp: 58,
    catalogAssetId: 'stl-lich',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Morto-Vivo (Lich)',
      classOrRole: 'Conjurador Sombrio',
      levelOrCr: 'ND 5',
      ac: 15,
      speed: '30 ft (6 casas)',
      initiativeBonus: 2,
      stats: { str: 10, dex: 14, con: 14, int: 18, wis: 14, cha: 14 },
      attacks: [
        { name: 'Raio Necrotico', bonus: '+7', damage: '3d8 Necrotico' },
        { name: 'Toque Paralisante', bonus: '+7', damage: '3d6 Frio (CD 15 CON)' },
      ],
      abilities: 'Invocar Mortos-Vivos, Contramagica, Visao Verdadeira.',
      equipment: 'Cajado Ossudo, Filacteria Oculta.',
      notes: 'Mantem distancia no altar elevado.',
    },
  },
  {
    id: 'mon-red-dragon',
    label: 'Dragao Vermelho / Wyrm',
    isMonster: true,
    suggestedHp: 150,
    catalogAssetId: 'stl-red-dragon',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Dragao (Fogo)',
      classOrRole: 'Chefe Lendario',
      levelOrCr: 'ND 10',
      ac: 18,
      speed: '40 ft · Voo 80 ft',
      initiativeBonus: 2,
      stats: { str: 23, dex: 12, con: 21, int: 14, wis: 13, cha: 19 },
      attacks: [
        { name: 'Mordida Flamejante', bonus: '+10', damage: '2d10+6 + 1d6 Fogo' },
        { name: 'Garras (2 ataques)', bonus: '+10', damage: '2d6+6 Cortante' },
        { name: 'Sopro de Fogo (Cone 9m)', bonus: '+8', damage: '10d6 Fogo (CD 17 DES)' },
      ],
      abilities: 'Resistencia Lendaria (2/dia), Presenca Aterradora, Imune a Fogo.',
      equipment: 'Tesouro Draconico (Bau Dourado na camara norte).',
      notes: 'Usa Sopro de Fogo no turno 1 (Recarga 5-6 no d6).',
    },
  },
  {
    id: 'mon-dracolich',
    label: 'Dracolich Durnehviir',
    isMonster: true,
    suggestedHp: 165,
    catalogAssetId: 'stl-dracolich',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Dragao Morto-Vivo',
      classOrRole: 'Chefe de Arena',
      levelOrCr: 'ND 12',
      ac: 19,
      speed: '40 ft · Voo 80 ft',
      initiativeBonus: 3,
      stats: { str: 22, dex: 12, con: 20, int: 17, wis: 15, cha: 18 },
      attacks: [
        { name: 'Mordida Necrotica', bonus: '+11', damage: '2d10+6 + 2d6 Necrotico' },
        { name: 'Sopro da Ruina da Alma', bonus: '+9', damage: '10d8 Necrotico (CD 18 CON)' },
      ],
      abilities: 'Imune a Veneno/Necrotico, Resistencia a Magia, Filacteria oculta.',
      equipment: 'Gema da Alma Negra.',
      notes: 'Acompanhado pelo Cavaleiro da Morte no Pico dos Dragoes.',
    },
  },
  {
    id: 'mon-death-knight',
    label: 'Cavaleiro da Morte',
    isMonster: true,
    suggestedHp: 75,
    catalogAssetId: 'stl-death-knight',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Morto-Vivo Blindado',
      classOrRole: 'Campeao Sombrio',
      levelOrCr: 'ND 6',
      ac: 18,
      speed: '30 ft (6 casas)',
      initiativeBonus: 1,
      stats: { str: 19, dex: 12, con: 18, int: 12, wis: 14, cha: 16 },
      attacks: [
        { name: 'Espada Montante Amaldicoada', bonus: '+7', damage: '2d6+4 + 2d8 Necrotico' },
        { name: 'Orbe do Fogo Infernal', bonus: '+6', damage: '4d6 Fogo + 4d6 Necrotico' },
      ],
      abilities: 'Aparar (+3 CA reacao), Aura Profana (vantagem contra expulsao).',
      equipment: 'Armadura de Placas Ebano.',
      notes: '',
    },
  },
  {
    id: 'mon-orc',
    label: 'Orc Orsimer',
    isMonster: true,
    suggestedHp: 32,
    catalogAssetId: 'stl-orc',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Humanoide (Orc)',
      classOrRole: 'Guerreiro Brutal',
      levelOrCr: 'ND 1/2',
      ac: 13,
      speed: '30 ft (6 casas)',
      initiativeBonus: 1,
      stats: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
      attacks: [
        { name: 'Machado Grande', bonus: '+5', damage: '1d12+3 Cortante' },
        { name: 'Azagaia', bonus: '+5', damage: '1d6+3 Perfurante' },
      ],
      abilities: 'Agressivo: usa acao bonus para avancar ate o inimigo.',
      equipment: 'Machado, 2 Azagaias.',
      notes: '',
    },
  },
  {
    id: 'mon-beholder',
    label: 'Beholder D&D',
    isMonster: true,
    suggestedHp: 120,
    catalogAssetId: 'stl-beholder',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Aberracao Flutuante',
      classOrRole: 'Tirano dos Olhos',
      levelOrCr: 'ND 9',
      ac: 17,
      speed: 'Voo 20 ft (Pairar)',
      initiativeBonus: 2,
      stats: { str: 10, dex: 14, con: 18, int: 17, wis: 15, cha: 17 },
      attacks: [
        { name: 'Raio Ocular (Desintegracao / Medo / Paralisia)', bonus: '+7', damage: '6d8 Forca (CD 16)' },
        { name: 'Mordida', bonus: '+4', damage: '4d6 Perfurante' },
      ],
      abilities: 'Cone Antimagia (Olho Central), 3 Raios Oculares por turno.',
      equipment: 'Anel de Protecao no tesouro.',
      notes: '',
    },
  },
  {
    id: 'mon-dire-wolf',
    label: 'Lobo Terrivel',
    isMonster: true,
    suggestedHp: 37,
    catalogAssetId: 'stl-dire-wolf',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Besta Grande',
      classOrRole: 'Predador de Alcateia',
      levelOrCr: 'ND 1',
      ac: 14,
      speed: '50 ft (10 casas)',
      initiativeBonus: 2,
      stats: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 },
      attacks: [{ name: 'Mordida Derrubadora', bonus: '+5', damage: '2d6+3 Perfurante (CD 13 FOR)' }],
      abilities: 'Tatica de Matilha (vantagem se aliado estiver adjacente ao alvo).',
      equipment: 'Nenhum.',
      notes: '',
    },
  },
  {
    id: 'mon-custom',
    label: 'Monstro Personalizado',
    isMonster: true,
    suggestedHp: 45,
    catalogAssetId: 'stl-minotaur',
    sheet: {
      isMonster: true,
      hiddenFromPlayers: true,
      raceOrType: 'Monstruosidade',
      classOrRole: 'Inimigo / Chefe',
      levelOrCr: 'ND 2',
      ac: 14,
      speed: '30 ft (6 casas)',
      initiativeBonus: 1,
      stats: { str: 16, dex: 12, con: 15, int: 8, wis: 10, cha: 8 },
      attacks: [{ name: 'Ataque Brutal', bonus: '+5', damage: '2d6+3' }],
      abilities: 'Descreva aqui habilidades especiais, resistencias ou magias do monstro.',
      equipment: 'Tesouro guardado pelo monstro.',
      notes: 'Notas secretas do Mestre.',
    },
  },
];

export const ALL_SHEET_TEMPLATES: SheetTemplate[] = [
  ...HERO_SHEET_TEMPLATES,
  ...MONSTER_SHEET_TEMPLATES,
];

export function cloneSheet(sheet: CharacterSheet): CharacterSheet {
  return {
    ...sheet,
    stats: { ...sheet.stats },
    attacks: sheet.attacks.map((a) => ({ ...a })),
  };
}

export function createDefaultSheet(isMonster: boolean, hint?: string): CharacterSheet {
  const lower = (hint || '').toLowerCase();
  const byCatalog = ALL_SHEET_TEMPLATES.find(
    (t) =>
      (t.catalogAssetId && lower.includes(t.catalogAssetId.toLowerCase())) ||
      lower.includes(t.label.toLowerCase())
  );
  if (byCatalog) {
    return cloneSheet(byCatalog.sheet);
  }
  if (lower.includes('dragon') || lower.includes('dragao') || lower.includes('wyrm')) {
    return cloneSheet(MONSTER_SHEET_TEMPLATES[2].sheet);
  }
  if (lower.includes('dracolich')) {
    return cloneSheet(MONSTER_SHEET_TEMPLATES[3].sheet);
  }
  if (lower.includes('death') || lower.includes('morte')) {
    return cloneSheet(MONSTER_SHEET_TEMPLATES[4].sheet);
  }
  if (lower.includes('goblin')) {
    return cloneSheet(MONSTER_SHEET_TEMPLATES[0].sheet);
  }
  if (lower.includes('necrom') || lower.includes('mage') || lower.includes('mago') || lower.includes('lich') || lower.includes('warlock')) {
    return cloneSheet(isMonster ? MONSTER_SHEET_TEMPLATES[1].sheet : HERO_SHEET_TEMPLATES[2].sheet);
  }
  if (lower.includes('rogue') || lower.includes('ladino')) {
    return cloneSheet(HERO_SHEET_TEMPLATES[3].sheet);
  }
  if (lower.includes('cleric') || lower.includes('clerig')) {
    return cloneSheet(HERO_SHEET_TEMPLATES[4].sheet);
  }
  if (lower.includes('druid')) {
    return cloneSheet(HERO_SHEET_TEMPLATES[5].sheet);
  }
  if (lower.includes('knight') || lower.includes('paladin') || lower.includes('cavaleiro') || lower.includes('fighter') || lower.includes('drow')) {
    return cloneSheet(HERO_SHEET_TEMPLATES[1].sheet);
  }
  if (lower.includes('barbar') || lower.includes('berserker')) {
    return cloneSheet(HERO_SHEET_TEMPLATES[0].sheet);
  }
  return cloneSheet(
    isMonster
      ? MONSTER_SHEET_TEMPLATES[MONSTER_SHEET_TEMPLATES.length - 1].sheet
      : HERO_SHEET_TEMPLATES[HERO_SHEET_TEMPLATES.length - 1].sheet
  );
}

export function resolveMiniSheet(mini: MiniatureData): CharacterSheet {
  if (mini.sheet) {
    return cloneSheet(mini.sheet);
  }
  const isMonster = mini.ownerName === '__GM__';
  return createDefaultSheet(isMonster, `${mini.assetId || ''} ${mini.name}`);
}

export function canUserEditSheet(mini: MiniatureData, role: Role, userName: string): boolean {
  if (mini.isPropOnly) return false;
  if (role === 'gm') return true;
  if (mini.ownerName === '__GM__' || mini.sheet?.isMonster) return false;
  if (!mini.ownerName) return true;
  return mini.ownerName.toLowerCase() === userName.toLowerCase();
}

export function canUserViewSheet(mini: MiniatureData, role: Role): boolean {
  if (mini.isPropOnly) return false;
  if (role === 'gm') return true;
  if (mini.sheet?.hiddenFromPlayers) return false;
  if (!mini.sheet && mini.ownerName === '__GM__') return false;
  return true;
}

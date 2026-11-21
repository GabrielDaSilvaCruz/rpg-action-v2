import React, { useEffect, useState } from 'react';
import {
  Check,
  Crown,
  Dices,
  Eye,
  EyeOff,
  Heart,
  Lock,
  Plus,
  ScrollText,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { CharacterSheet, MiniatureData, Role, RoomUser } from '../types/vtt';
import {
  ALL_SHEET_TEMPLATES,
  calcMod,
  canUserEditSheet,
  canUserViewSheet,
  cloneSheet,
  formatMod,
  parseAttackBonus,
  resolveMiniSheet,
} from '../utils/sheetTemplates';

interface CharacterSheetModalProps {
  mini: MiniatureData;
  role: Role;
  userName: string;
  users: RoomUser[];
  onSaveSheet: (
    id: string,
    payload: {
      name: string;
      hp: number;
      maxHp: number;
      sheet: CharacterSheet;
      ownerName?: string;
    }
  ) => void;
  onRollDice: (die: number, modifier?: number) => void;
  onClose: () => void;
}

const STAT_FIELDS: { key: keyof CharacterSheet['stats']; label: string }[] = [
  { key: 'str', label: 'FOR' },
  { key: 'dex', label: 'DES' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'SAB' },
  { key: 'cha', label: 'CAR' },
];

export const CharacterSheetModal: React.FC<CharacterSheetModalProps> = ({
  mini,
  role,
  userName,
  users,
  onSaveSheet,
  onRollDice,
  onClose,
}) => {
  const canView = canUserViewSheet(mini, role);
  const canEdit = canUserEditSheet(mini, role, userName);

  const [name, setName] = useState(mini.name);
  const [hp, setHp] = useState(mini.hp);
  const [maxHp, setMaxHp] = useState(mini.maxHp);
  const [ownerName, setOwnerName] = useState(mini.ownerName);
  const [sheet, setSheet] = useState<CharacterSheet>(() => resolveMiniSheet(mini));
  const [templateId, setTemplateId] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);

  // Sync draft when switching to a different miniature or receiving an external update
  useEffect(() => {
    setName(mini.name);
    setHp(mini.hp);
    setMaxHp(mini.maxHp);
    setOwnerName(mini.ownerName);
    setSheet(resolveMiniSheet(mini));
    setTemplateId('');
  }, [mini]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleApplyTemplate = (selectedId: string) => {
    setTemplateId(selectedId);
    const tpl = ALL_SHEET_TEMPLATES.find((t) => t.id === selectedId);
    if (!tpl) return;
    setSheet(cloneSheet(tpl.sheet));
    setHp(tpl.suggestedHp);
    setMaxHp(tpl.suggestedHp);
    if (tpl.isMonster) {
      setOwnerName('__GM__');
    } else if (ownerName === '__GM__') {
      setOwnerName('');
    }
  };

  const handleSave = (closeAfter = false) => {
    if (!canEdit) return;
    const safeMax = Math.max(1, Math.round(maxHp || 1));
    const safeHp = Math.max(0, Math.min(safeMax, Math.round(hp || 0)));
    onSaveSheet(mini.id, {
      name: name.trim() || mini.name,
      hp: safeHp,
      maxHp: safeMax,
      sheet,
      ownerName: role === 'gm' ? ownerName : undefined,
    });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1600);
    if (closeAfter) {
      onClose();
    }
  };

  const adjustHp = (delta: number) => {
    if (!canEdit) return;
    const nextHp = Math.max(0, Math.min(Math.max(1, maxHp), hp + delta));
    setHp(nextHp);
  };

  const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))) : 0;
  const hpBarColor =
    hpPct > 55 ? 'bg-emerald-500' : hpPct > 25 ? 'bg-amber-500' : 'bg-rose-500';

  if (!canView) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 pointer-events-auto"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md bg-[#12161e] border border-stone-700 rounded-2xl p-6 text-center space-y-3 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <Lock className="w-8 h-8 text-amber-400 mx-auto" />
          <h2 className="font-display text-lg font-bold text-stone-100">
            Ficha Oculta pelo Mestre
          </h2>
          <p className="text-xs text-stone-400">
            Os atributos e segredos de <strong>{mini.name}</strong> estao ocultos para jogadores.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 pointer-events-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ficha de ${name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-[#12161e] border border-stone-700/80 rounded-2xl shadow-2xl overflow-hidden text-stone-200"
      >
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[#0c0f15] border-b border-stone-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                sheet.isMonster
                  ? 'bg-rose-950/60 border-rose-500/50 text-rose-300'
                  : 'bg-amber-950/50 border-amber-500/50 text-amber-300'
              }`}
            >
              {sheet.isMonster ? (
                <Skull className="w-4.5 h-4.5" />
              ) : (
                <ScrollText className="w-4.5 h-4.5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono-tabular uppercase tracking-wider px-2 py-0.5 rounded bg-[#181d27] border border-stone-700 text-amber-300">
                  {sheet.isMonster ? 'Ficha de Monstro / NPC' : 'Ficha de Personagem'}
                </span>
                {!canEdit && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-stone-800 text-stone-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Somente Leitura
                  </span>
                )}
                {ownerName && ownerName !== '__GM__' && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-sky-950/60 border border-sky-500/40 text-sky-300">
                    Dono: {ownerName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {savedNotice && (
              <span className="flex items-center gap-1 text-xs text-emerald-300 font-medium">
                <Check className="w-3.5 h-3.5" />
                Salvo na mesa
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar ficha"
              className="p-1.5 text-stone-400 hover:text-white bg-[#181d27] hover:bg-stone-700 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* GM Quick Configuration Bar */}
        {role === 'gm' && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-[#161b25] border-b border-stone-800/90 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-amber-300 font-medium">
                <Crown className="w-3.5 h-3.5" />
                Mestre:
              </span>

              <button
                type="button"
                onClick={() => {
                  const nextIsMonster = !sheet.isMonster;
                  setSheet((prev) => ({
                    ...prev,
                    isMonster: nextIsMonster,
                    hiddenFromPlayers: nextIsMonster ? prev.hiddenFromPlayers : false,
                  }));
                  if (nextIsMonster) setOwnerName('__GM__');
                  else if (ownerName === '__GM__') setOwnerName('');
                }}
                className={`px-2.5 py-1 rounded-lg border cursor-pointer ${
                  sheet.isMonster
                    ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                    : 'bg-sky-950/50 border-sky-500/50 text-sky-200'
                }`}
              >
                {sheet.isMonster ? 'Tipo: Monstro / NPC' : 'Tipo: Personagem'}
              </button>

              <select
                value={templateId}
                onChange={(e) => handleApplyTemplate(e.target.value)}
                className="px-2.5 py-1 bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-200"
              >
                <option value="">Aplicar Modelo Pronta...</option>
                <optgroup label="Modelos de Monstros">
                  {ALL_SHEET_TEMPLATES.filter((t) => t.isMonster).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.suggestedHp} PV)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Modelos de Herois">
                  {ALL_SHEET_TEMPLATES.filter((t) => !t.isMonster).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} ({t.suggestedHp} PV)
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="px-2.5 py-1 bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-200"
              >
                <option value="">Editavel: Qualquer Jogador</option>
                <option value="__GM__">Editavel: Apenas Mestre</option>
                {users
                  .filter((u) => u.role === 'player')
                  .map((u) => (
                    <option key={u.id} value={u.name}>
                      Jogador: {u.name}
                    </option>
                  ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  setSheet((prev) => ({
                    ...prev,
                    hiddenFromPlayers: !prev.hiddenFromPlayers,
                  }))
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer ${
                  sheet.hiddenFromPlayers
                    ? 'bg-amber-950/60 border-amber-500/60 text-amber-200'
                    : 'bg-[#0c0f15] border-stone-700 text-stone-300'
                }`}
              >
                {sheet.hiddenFromPlayers ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                    <span>Oculta p/ Jogadores</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Visivel p/ Jogadores</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Sheet Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Identity Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="sm:col-span-2 block">
              <span className="text-[11px] text-stone-400 block mb-1">Nome</span>
              <input
                type="text"
                disabled={!canEdit}
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 text-sm font-semibold bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-100 disabled:opacity-70 focus:outline-none focus:border-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-stone-400 block mb-1">
                {sheet.isMonster ? 'Tipo / Criatura' : 'Raca / Origem'}
              </span>
              <input
                type="text"
                disabled={!canEdit}
                maxLength={48}
                value={sheet.raceOrType}
                onChange={(e) => setSheet({ ...sheet, raceOrType: e.target.value })}
                placeholder="Ex: Nordico / Dragao"
                className="w-full px-3 py-2 text-xs bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-200 disabled:opacity-70 focus:outline-none focus:border-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-stone-400 block mb-1">
                {sheet.isMonster ? 'Papel / Desafio' : 'Classe / Nivel'}
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  disabled={!canEdit}
                  maxLength={48}
                  value={sheet.classOrRole}
                  onChange={(e) => setSheet({ ...sheet, classOrRole: e.target.value })}
                  placeholder="Classe"
                  className="w-full px-2.5 py-2 text-xs bg-[#0c0f15] border border-stone-700 rounded-lg text-stone-200 disabled:opacity-70 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="text"
                  disabled={!canEdit}
                  maxLength={24}
                  value={sheet.levelOrCr}
                  onChange={(e) => setSheet({ ...sheet, levelOrCr: e.target.value })}
                  placeholder="Nv/ND"
                  className="w-20 px-2 py-2 text-xs font-mono-tabular bg-[#0c0f15] border border-stone-700 rounded-lg text-amber-300 disabled:opacity-70 focus:outline-none focus:border-amber-500"
                />
              </div>
            </label>
          </div>

          {/* Combat Vitals Strip: HP + AC + Speed + Initiative */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* HP Box */}
            <div className="md:col-span-6 p-3.5 bg-[#0c0f15] border border-stone-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-300">
                  <Heart className="w-4 h-4 text-rose-400" />
                  Pontos de Vida (PV)
                </span>
                <div className="flex items-center gap-1.5 font-mono-tabular">
                  <input
                    type="number"
                    disabled={!canEdit}
                    min={0}
                    max={9999}
                    value={hp}
                    onChange={(e) => setHp(Math.max(0, parseInt(e.target.value || '0', 10)))}
                    className="w-16 px-2 py-1 text-sm font-bold text-center bg-[#161b24] border border-stone-700 rounded text-stone-100 disabled:opacity-70"
                  />
                  <span className="text-stone-500">/</span>
                  <input
                    type="number"
                    disabled={!canEdit}
                    min={1}
                    max={9999}
                    value={maxHp}
                    onChange={(e) =>
                      setMaxHp(Math.max(1, parseInt(e.target.value || '1', 10)))
                    }
                    className="w-16 px-2 py-1 text-sm font-bold text-center bg-[#161b24] border border-stone-700 rounded text-stone-300 disabled:opacity-70"
                  />
                </div>
              </div>

              <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${hpBarColor}`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>

              {canEdit && (
                <div className="flex items-center justify-between gap-1 pt-0.5">
                  <div className="flex items-center gap-1">
                    {[-5, -1].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        onClick={() => adjustHp(delta)}
                        className="px-2 py-0.5 text-[11px] font-mono-tabular bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/30 rounded text-rose-200 cursor-pointer"
                      >
                        {delta} PV
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    {[+1, +5].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        onClick={() => adjustHp(delta)}
                        className="px-2 py-0.5 text-[11px] font-mono-tabular bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/30 rounded text-emerald-200 cursor-pointer"
                      >
                        +{delta} PV
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AC, Speed, Initiative */}
            <div className="md:col-span-2 p-3.5 bg-[#0c0f15] border border-stone-800 rounded-xl flex flex-col justify-between">
              <span className="flex items-center gap-1 text-[11px] text-stone-400">
                <Shield className="w-3.5 h-3.5 text-sky-400" />
                CA (Armadura)
              </span>
              <input
                type="number"
                disabled={!canEdit}
                min={1}
                max={50}
                value={sheet.ac}
                onChange={(e) =>
                  setSheet({ ...sheet, ac: Math.max(1, parseInt(e.target.value || '10', 10)) })
                }
                className="w-full mt-1 px-2 py-1 text-lg font-bold font-mono-tabular text-center bg-[#161b24] border border-stone-700 rounded-lg text-sky-300 disabled:opacity-70"
              />
            </div>

            <div className="md:col-span-2 p-3.5 bg-[#0c0f15] border border-stone-800 rounded-xl flex flex-col justify-between">
              <span className="text-[11px] text-stone-400">Deslocamento</span>
              <input
                type="text"
                disabled={!canEdit}
                maxLength={32}
                value={sheet.speed}
                onChange={(e) => setSheet({ ...sheet, speed: e.target.value })}
                className="w-full mt-1 px-2 py-1.5 text-xs font-mono-tabular text-center bg-[#161b24] border border-stone-700 rounded-lg text-stone-200 disabled:opacity-70"
              />
            </div>

            <div className="md:col-span-2 p-3.5 bg-[#0c0f15] border border-stone-800 rounded-xl flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-stone-400">Iniciativa</span>
                <button
                  type="button"
                  title="Rolar Iniciativa (d20 + bonus)"
                  onClick={() => onRollDice(20, sheet.initiativeBonus)}
                  className="p-1 text-amber-400 hover:text-amber-300 bg-[#181d27] rounded cursor-pointer"
                >
                  <Dices className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="number"
                disabled={!canEdit}
                min={-10}
                max={30}
                value={sheet.initiativeBonus}
                onChange={(e) =>
                  setSheet({
                    ...sheet,
                    initiativeBonus: parseInt(e.target.value || '0', 10) || 0,
                  })
                }
                className="w-full mt-1 px-2 py-1 text-base font-bold font-mono-tabular text-center bg-[#161b24] border border-stone-700 rounded-lg text-amber-300 disabled:opacity-70"
              />
            </div>
          </div>

          {/* 6 Attributes with clickable d20 + Modifier Roll */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Atributos (clique no dado para testar d20 + mod)
              </h3>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {STAT_FIELDS.map(({ key, label }) => {
                const score = sheet.stats[key];
                const mod = calcMod(score);
                return (
                  <div
                    key={key}
                    className="p-2.5 bg-[#0c0f15] border border-stone-800 rounded-xl flex flex-col items-center gap-1.5"
                  >
                    <span className="text-[11px] font-bold tracking-wider text-stone-400">
                      {label}
                    </span>
                    <input
                      type="number"
                      disabled={!canEdit}
                      min={1}
                      max={30}
                      value={score}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(30, parseInt(e.target.value || '10', 10)));
                        setSheet({
                          ...sheet,
                          stats: { ...sheet.stats, [key]: val },
                        });
                      }}
                      className="w-14 px-1.5 py-1 text-base font-bold font-mono-tabular text-center bg-[#161b24] border border-stone-700 rounded-lg text-stone-100 disabled:opacity-70"
                    />
                    <button
                      type="button"
                      onClick={() => onRollDice(20, mod)}
                      title={`Rolar Teste de ${label} (d20 ${formatMod(mod)})`}
                      className="w-full flex items-center justify-center gap-1 py-1 text-xs font-mono-tabular font-semibold bg-[#181d27] hover:bg-amber-600 hover:text-stone-950 border border-stone-700/80 rounded-md text-amber-300 transition-colors cursor-pointer"
                    >
                      <Dices className="w-3 h-3" />
                      <span>{formatMod(mod)}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Attacks & Combat Actions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-300">
                <Swords className="w-3.5 h-3.5 text-amber-400" />
                Ataques & Acoes
              </h3>
              {canEdit && sheet.attacks.length < 10 && (
                <button
                  type="button"
                  onClick={() =>
                    setSheet({
                      ...sheet,
                      attacks: [...sheet.attacks, { name: 'Novo Ataque', bonus: '+4', damage: '1d8+2' }],
                    })
                  }
                  className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#181d27] hover:bg-[#222938] border border-stone-700 rounded-lg text-amber-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Ataque</span>
                </button>
              )}
            </div>

            <div className="space-y-2">
              {sheet.attacks.map((atk, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 bg-[#0c0f15] border border-stone-800 rounded-xl"
                >
                  <input
                    type="text"
                    disabled={!canEdit}
                    maxLength={48}
                    value={atk.name}
                    onChange={(e) => {
                      const next = [...sheet.attacks];
                      next[idx] = { ...atk, name: e.target.value };
                      setSheet({ ...sheet, attacks: next });
                    }}
                    placeholder="Nome da arma / magia"
                    className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-100 disabled:opacity-70"
                  />
                  <input
                    type="text"
                    disabled={!canEdit}
                    maxLength={12}
                    value={atk.bonus}
                    onChange={(e) => {
                      const next = [...sheet.attacks];
                      next[idx] = { ...atk, bonus: e.target.value };
                      setSheet({ ...sheet, attacks: next });
                    }}
                    placeholder="+5"
                    className="w-16 px-2 py-1.5 text-xs font-mono-tabular text-center bg-[#161b24] border border-stone-700 rounded-lg text-amber-300 disabled:opacity-70"
                  />
                  <input
                    type="text"
                    disabled={!canEdit}
                    maxLength={48}
                    value={atk.damage}
                    onChange={(e) => {
                      const next = [...sheet.attacks];
                      next[idx] = { ...atk, damage: e.target.value };
                      setSheet({ ...sheet, attacks: next });
                    }}
                    placeholder="1d8+3 Cortante"
                    className="w-40 px-2.5 py-1.5 text-xs bg-[#161b24] border border-stone-700 rounded-lg text-stone-200 disabled:opacity-70"
                  />
                  <button
                    type="button"
                    onClick={() => onRollDice(20, parseAttackBonus(atk.bonus))}
                    title={`Rolar Ataque (${atk.name}: d20 ${atk.bonus})`}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-amber-600/20 hover:bg-amber-600 hover:text-stone-950 border border-amber-500/40 rounded-lg text-amber-300 transition-colors cursor-pointer"
                  >
                    <Dices className="w-3.5 h-3.5" />
                    <span>Rolar</span>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        setSheet({
                          ...sheet,
                          attacks: sheet.attacks.filter((_, i) => i !== idx),
                        })
                      }
                      aria-label="Remover ataque"
                      className="p-1.5 text-stone-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {sheet.attacks.length === 0 && (
                <p className="text-xs text-stone-500 italic">Nenhum ataque cadastrado.</p>
              )}
            </div>
          </div>

          {/* Abilities, Equipment & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-stone-300 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                Habilidades, Magias & Tracos
              </span>
              <textarea
                rows={4}
                disabled={!canEdit}
                maxLength={1500}
                value={sheet.abilities}
                onChange={(e) => setSheet({ ...sheet, abilities: e.target.value })}
                placeholder="Magias preparadas, talentos, resistencias, acoes lendarias..."
                className="w-full p-2.5 text-xs bg-[#0c0f15] border border-stone-700 rounded-xl text-stone-200 disabled:opacity-70 focus:outline-none focus:border-amber-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-stone-300 block mb-1.5">
                {sheet.isMonster ? 'Tesouro / Loot' : 'Equipamento & Mochila'}
              </span>
              <textarea
                rows={4}
                disabled={!canEdit}
                maxLength={1500}
                value={sheet.equipment}
                onChange={(e) => setSheet({ ...sheet, equipment: e.target.value })}
                placeholder="Armas, pocoes, moedas de ouro, itens magicos..."
                className="w-full p-2.5 text-xs bg-[#0c0f15] border border-stone-700 rounded-xl text-stone-200 disabled:opacity-70 focus:outline-none focus:border-amber-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-stone-300 block mb-1.5">
              {sheet.isMonster ? 'Taticas & Anotacoes do Mestre' : 'Historia & Anotacoes'}
            </span>
            <textarea
              rows={2}
              disabled={!canEdit}
              maxLength={1500}
              value={sheet.notes}
              onChange={(e) => setSheet({ ...sheet, notes: e.target.value })}
              placeholder="Anotacoes de sessao, condicoes, segredos..."
              className="w-full p-2.5 text-xs bg-[#0c0f15] border border-stone-700 rounded-xl text-stone-200 disabled:opacity-70 focus:outline-none focus:border-amber-500"
            />
          </label>
        </div>

        {/* Bottom Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[#0c0f15] border-t border-stone-800">
          <span className="text-[11px] text-stone-400">
            {canEdit
              ? role === 'gm'
                ? 'Como Mestre, voce pode editar qualquer ficha de jogador ou monstro e sincronizar em tempo real.'
                : 'Voce pode preencher e atualizar a ficha do seu personagem em tempo real.'
              : 'Ficha protegida — apenas o dono ou o Mestre pode editar.'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs text-stone-300 hover:text-white bg-[#181d27] border border-stone-700 rounded-lg cursor-pointer"
            >
              Fechar
            </button>
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  className="px-3.5 py-2 text-xs font-medium bg-[#1f2634] hover:bg-[#2a3346] border border-amber-500/40 text-amber-300 rounded-lg cursor-pointer"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg cursor-pointer"
                >
                  Salvar & Fechar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

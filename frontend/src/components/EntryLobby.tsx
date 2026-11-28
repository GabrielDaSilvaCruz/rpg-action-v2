import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { Crown, Shield, ArrowRight, Cloud, LogOut, FolderOpen } from 'lucide-react';
import { Role } from '../types/vtt';
import { getSavedPlayerProfile, savePlayerProfile } from '../utils/cookieStorage';

interface EntryLobbyProps {
  initialRoomId: string;
  firebaseUser: User | null;
  savedRooms: { roomId: string; presetName: string; gmName: string }[];
  onGoogleSignOut: () => void;
  onRoleChange?: (role: Role) => void;
  onEnter: (config: {
    name: string;
    roomId: string;
    role: Role;
    color: string;
    loadFromCloud?: boolean;
  }) => void;
}

const USER_COLORS = ['#d97706', '#0ea5e9', '#10b981', '#e11d48', '#8b5cf6'];

export const EntryLobby: React.FC<EntryLobbyProps> = ({
  initialRoomId,
  firebaseUser,
  savedRooms,
  onGoogleSignOut,
  onRoleChange,
  onEnter,
}) => {
  const [savedProfile] = useState(() => (typeof window !== 'undefined' ? getSavedPlayerProfile() : null));
  const [name, setName] = useState(() => savedProfile?.name || 'Mestre Eldrin');
  const [roomId, setRoomId] = useState(() => initialRoomId || savedProfile?.roomId || 'MESA-01');
  const [role, setRole] = useState<Role>(() => savedProfile?.role || 'gm');
  const [color, setColor] = useState(() => savedProfile?.color || USER_COLORS[0]);

  React.useEffect(() => {
    if (savedProfile) {
      onRoleChange?.(savedProfile.role);
    }
  }, []);

  const handleRoleSelect = (nextRole: Role) => {
    setRole(nextRole);
    onRoleChange?.(nextRole);
    if (nextRole === 'gm' && name === 'Aventureiro') {
      setName('Mestre Eldrin');
    } else if (nextRole === 'player' && name === 'Mestre Eldrin') {
      setName(savedProfile?.role === 'player' && savedProfile?.name ? savedProfile.name : 'Aventureiro');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = name.trim() || (role === 'gm' ? 'Mestre Eldrin' : 'Aventureiro');
    const finalRoom = roomId.trim().toUpperCase() || 'MESA-01';

    // Salva perfil em cookies e storage
    savePlayerProfile({
      name: finalName,
      role,
      color,
      roomId: finalRoom,
    });

    onEnter({
      name: finalName,
      roomId: finalRoom,
      role,
      color,
      loadFromCloud: role === 'gm' && Boolean(firebaseUser?.emailVerified),
    });
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-between p-6 md:p-10 pointer-events-none">
      {/* Subtle dark left vignette so title lockup has crisp contrast against live 3D board */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, rgba(11,14,19,0.88) 0%, rgba(11,14,19,0.52) 45%, rgba(11,14,19,0.12) 100%)',
        }}
      />

      {/* Top Brand Lockup */}
      <div className="relative z-10 flex items-center gap-3.5 pointer-events-auto max-w-fit">
        <div className="relative w-12 h-12 md:w-14 md:h-14 rounded-full p-0.5 bg-gradient-to-br from-amber-400 via-amber-600 to-amber-900 shadow-[0_0_20px_rgba(245,158,11,0.35)] shrink-0">
          <img
            src="/logo.png"
            alt="RPG Ação Logo"
            className="w-full h-full object-cover rounded-full"
          />
        </div>
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-200 to-amber-400 leading-none drop-shadow">
            RPG Ação
          </h1>
          <p className="text-xs text-stone-400 mt-1">
            Tabuleiro virtual de RPG · Mapas 3D · Dados físicos · Fichas & Nuvem
          </p>
        </div>
      </div>

      {/* Left-aligned Solid Entry Panel leaving 60%+ of live 3D diorama visible */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md bg-[#12161e]/95 border border-stone-700/60 rounded-xl p-6 shadow-2xl pointer-events-auto"
      >
        <div className="flex items-center gap-3 mb-3.5 pb-3 border-b border-stone-800">
          <img
            src="/logo.png"
            alt="RPG Logo"
            className="w-10 h-10 rounded-full object-cover border border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]"
          />
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-100 leading-tight">
              Entrar na Mesa
            </h2>
            <span className="text-[11px] text-stone-400">
              Escolha seu papel e acesse o tabuleiro 3D
            </span>
          </div>
        </div>

        {/* Role Selector */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <button
            type="button"
            onClick={() => handleRoleSelect('gm')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              role === 'gm'
                ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                : 'bg-[#191f2a] border-stone-700/70 text-stone-300 hover:border-stone-500'
            }`}
          >
            <Crown className="w-4 h-4 shrink-0" />
            <span>Mestre (GM)</span>
          </button>
          <button
            type="button"
            onClick={() => handleRoleSelect('player')}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
              role === 'player'
                ? 'bg-sky-600/20 border-sky-500 text-sky-300'
                : 'bg-[#191f2a] border-stone-700/70 text-stone-300 hover:border-stone-500'
            }`}
          >
            <Shield className="w-4 h-4 shrink-0" />
            <span>Jogador</span>
          </button>
        </div>

        <p className="text-xs text-stone-400 mb-4 leading-relaxed">
          {role === 'gm'
            ? 'Modo Mestre: construa o cenario do zero ou escolha modelos prontos, adicione monstros, personagens extras e controle a trilha sonora.'
            : 'Modo Jogador: adicione seu personagem (1 proprio), preencha sua ficha, role dados 3D e controle personagens extras liberados pelo Mestre.'}
        </p>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-stone-300 mb-1">
              Seu Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={28}
              placeholder="Ex: Mestre Eldrin"
              className="w-full px-3 py-2 text-sm bg-[#0c0f15] border border-stone-700/80 rounded-lg text-stone-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Codigo da Sala
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                maxLength={16}
                placeholder="MESA-01"
                className="w-full px-3 py-2 text-sm font-mono-tabular bg-[#0c0f15] border border-stone-700/80 rounded-lg text-stone-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-300 mb-1">
                Cor do Marcador
              </label>
              <div className="flex items-center gap-2 h-[38px]">
                {USER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Cor ${c}`}
                    className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                      color === c ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm rounded-lg transition-colors cursor-pointer"
        >
          <span>Entrar na Mesa</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Cloud DB (Firebase Firestore) Account & Saved Campaigns */}
        {firebaseUser && (
          <div className="mt-4 pt-3.5 border-t border-stone-800/80">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-300 truncate">
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Nuvem: {firebaseUser.displayName || firebaseUser.email}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[#191f2a] hover:bg-stone-800 border border-stone-700 rounded text-stone-300 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Sair</span>
                </button>
              </div>
              {savedRooms.length > 0 && (
                <div className="space-y-1">
                  <span className="text-[11px] text-stone-400">
                    Suas mesas salvas no banco:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {savedRooms.slice(0, 4).map((sr) => (
                      <button
                        key={sr.roomId}
                        type="button"
                        onClick={() =>
                          onEnter({
                            name: name.trim() || 'Mestre Eldrin',
                            roomId: sr.roomId,
                            role: 'gm',
                            color,
                            loadFromCloud: true,
                          })
                        }
                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono-tabular bg-[#191f2a] hover:bg-amber-600/20 border border-stone-700 hover:border-amber-500/60 rounded text-amber-300 cursor-pointer"
                      >
                        <FolderOpen className="w-3 h-3" />
                        <span>{sr.roomId}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </form>

      {/* Single Flat Control-Hint Line */}
      <div className="relative z-10 text-xs text-stone-400 pointer-events-none">
        Arraste para orbitar · Zoom no scroll · Use as setas do teclado (ou WASD) para mover miniaturas, muros e cenários · R para rotacionar
      </div>
    </div>
  );
};


import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  MapPin,
  Sparkles,
  User as UserIcon,
  Crown,
  Sword,
  Radio,
} from 'lucide-react';
import { MiniatureData, RoomState, RoomUser } from '../types/vtt';
import { webrtc, WebRTCStatus } from '../engine/webrtcManager';

interface VoiceVideoDockProps {
  myUserId: string;
  roomState: RoomState;
  onFocusMiniature?: (miniId: string) => void;
  className?: string;
}

export const VoiceVideoDock: React.FC<VoiceVideoDockProps> = ({
  myUserId,
  roomState,
  onFocusMiniature,
  className = '',
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const [webrtcStatus, setWebrtcStatus] = useState<WebRTCStatus>(() => webrtc.getStatus());
  const [speakingMap, setSpeakingMap] = useState<Map<string, boolean>>(() => webrtc.getSpeakingMap());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(() => webrtc.getRemoteStreams());
  const [localStream, setLocalStream] = useState<MediaStream | null>(() => webrtc.getLocalStream());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-clear message de erro após 6 segundos
  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(null), 6000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  useEffect(() => {
    const unsubStatus = webrtc.subscribeStatus(setWebrtcStatus);
    const unsubSpeaking = webrtc.subscribeSpeaking(setSpeakingMap);
    const unsubStreams = webrtc.subscribeStreams((remotes, local) => {
      setRemoteStreams(new Map(remotes));
      setLocalStream(local);
    });
    const unsubError = webrtc.subscribeErrors((err) => {
      setErrorMessage(err);
    });

    return () => {
      unsubStatus();
      unsubSpeaking();
      unsubStreams();
      unsubError();
    };
  }, []);

  const handleToggleMic = () => {
    webrtc.toggleMic();
  };

  const handleToggleCam = () => {
    void webrtc.toggleCamera();
  };

  const handleToggleDeafen = () => {
    webrtc.toggleDeafen();
  };

  const handleSelectCharacter = (characterId: string) => {
    webrtc.setCharacterId(characterId || undefined);
  };

  const users = roomState.users || [];
  const miniatures = Object.values(roomState.miniatures || {});

  // Local user
  const me = users.find((u) => u.id === myUserId);
  const myCharacterId = webrtcStatus.activeCharacterId || me?.characterId;
  const myCharMini = myCharacterId ? roomState.miniatures[myCharacterId] : null;

  return (
    <div
      className={`fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-40 max-w-[94vw] sm:max-w-xl transition-all duration-300 ${className}`}
    >
      {/* Toast de Erro de Permissão / Dispositivo */}
      {errorMessage && (
        <div className="mb-2 px-3 py-1.5 bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs rounded-lg shadow-lg flex items-center justify-between gap-3 animate-fade-in backdrop-blur-md">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-stone-400 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Dock Container */}
      <div className="bg-[#0b0e14]/95 backdrop-blur-md border border-stone-800/80 shadow-[0_12px_40px_rgba(0,0,0,0.65)] rounded-2xl overflow-hidden text-stone-200">
        {/* Barra de Título / Controle Rápido */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-gradient-to-r from-[#121620] via-[#0d1017] to-[#121620] border-b border-stone-800/60 select-none">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold tracking-wide text-stone-200 flex items-center gap-1.5">
              <span>Voz & Vídeo</span>
              <span className="text-[10px] text-stone-400 font-mono-tabular bg-stone-800/80 px-1.5 py-0.5 rounded">
                {users.length} {users.length === 1 ? 'presente' : 'presentes'}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Botão Microfone Rápido */}
            <button
              type="button"
              onClick={handleToggleMic}
              title={webrtcStatus.micMuted ? 'Ativar Microfone' : 'Mutar Microfone'}
              className={`p-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                webrtcStatus.micMuted
                  ? 'bg-rose-900/60 text-rose-300 hover:bg-rose-850 border border-rose-700/60'
                  : 'bg-emerald-950/80 text-emerald-300 hover:bg-emerald-900 border border-emerald-600/60 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
              }`}
            >
              {webrtcStatus.micMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>

            {/* Botão Câmera Rápido */}
            <button
              type="button"
              onClick={handleToggleCam}
              title={webrtcStatus.videoOff ? 'Ligar Câmera' : 'Desligar Câmera'}
              className={`p-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                webrtcStatus.videoOff
                  ? 'bg-stone-800/80 text-stone-400 hover:text-stone-200 hover:bg-stone-700 border border-stone-700/60'
                  : 'bg-indigo-950/80 text-indigo-300 hover:bg-indigo-900 border border-indigo-600/60 shadow-[0_0_10px_rgba(99,102,241,0.25)]'
              }`}
            >
              {webrtcStatus.videoOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            </button>

            {/* Botão Ensurdecer */}
            <button
              type="button"
              onClick={handleToggleDeafen}
              title={webrtcStatus.isDeafened ? 'Reativar Áudio dos Outros' : 'Ensurdecer (Silenciar Outros)'}
              className={`p-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                webrtcStatus.isDeafened
                  ? 'bg-amber-950/80 text-amber-300 hover:bg-amber-900 border border-amber-600/60'
                  : 'bg-stone-800/80 text-stone-400 hover:text-stone-200 hover:bg-stone-700 border border-stone-700/60'
              }`}
            >
              {webrtcStatus.isDeafened ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {/* Toggle Recolher / Expandir */}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              title={collapsed ? 'Expandir Câmeras' : 'Minimizar Câmeras'}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors cursor-pointer ml-1"
            >
              {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Corpo com Grid de Câmeras / Avatares */}
        {!collapsed && (
          <div className="p-2.5">
            <div className="flex items-stretch gap-2.5 overflow-x-auto max-w-[88vw] scrollbar-thin pb-1">
              {/* Card do Usuário Local (Você) */}
              <UserMediaCard
                isSelf={true}
                user={
                  me || {
                    id: myUserId,
                    name: 'Você',
                    role: 'player',
                    color: '#d97706',
                    micMuted: webrtcStatus.micMuted,
                    videoOff: webrtcStatus.videoOff,
                    characterId: myCharacterId,
                  }
                }
                stream={localStream}
                isSpeaking={!!speakingMap.get(myUserId)}
                micMuted={webrtcStatus.micMuted}
                videoOff={webrtcStatus.videoOff}
                character={myCharMini}
                miniaturesList={miniatures}
                onSelectCharacter={handleSelectCharacter}
                onFocusMiniature={onFocusMiniature}
                onToggleMic={handleToggleMic}
                onToggleCam={handleToggleCam}
              />

              {/* Cards dos Outros Usuários na Sala */}
              {users
                .filter((u) => u.id !== myUserId)
                .map((user) => {
                  const charMini = user.characterId ? roomState.miniatures[user.characterId] : null;
                  const remoteStream = remoteStreams.get(user.id) || null;
                  const isSpeaking = !!speakingMap.get(user.id);

                  return (
                    <UserMediaCard
                      key={user.id}
                      isSelf={false}
                      user={user}
                      stream={remoteStream}
                      isSpeaking={isSpeaking}
                      micMuted={!!user.micMuted}
                      videoOff={user.videoOff !== false && (!remoteStream || remoteStream.getVideoTracks().length === 0)}
                      character={charMini}
                      onFocusMiniature={onFocusMiniature}
                    />
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Card Individual de Usuário (Vídeo ou Avatar Estilizado com Aura de Voz)
// ============================================================================
interface UserMediaCardProps {
  isSelf: boolean;
  user: RoomUser;
  stream: MediaStream | null;
  isSpeaking: boolean;
  micMuted: boolean;
  videoOff: boolean;
  character: MiniatureData | null;
  miniaturesList?: MiniatureData[];
  onSelectCharacter?: (charId: string) => void;
  onFocusMiniature?: (miniId: string) => void;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
}

const UserMediaCard: React.FC<UserMediaCardProps> = ({
  isSelf,
  user,
  stream,
  isSpeaking,
  micMuted,
  videoOff,
  character,
  miniaturesList = [],
  onSelectCharacter,
  onFocusMiniature,
  onToggleMic,
  onToggleCam,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
    }
  }, [stream, videoOff]);

  const hasVideoTrack = stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
  const showVideo = !videoOff && hasVideoTrack;

  return (
    <div
      className={`relative flex flex-col justify-between w-[148px] h-[172px] sm:w-[164px] sm:h-[188px] rounded-xl bg-[#0e121a] border transition-all duration-200 overflow-hidden shrink-0 group ${
        isSpeaking
          ? 'border-emerald-400 ring-2 ring-emerald-500/70 shadow-[0_0_18px_rgba(16,185,129,0.35)]'
          : 'border-stone-800 hover:border-stone-700 shadow-md'
      }`}
    >
      {/* Área Visual Principal: Vídeo WebRTC ou Avatar Estilizado */}
      <div className="relative w-full h-[116px] sm:h-[130px] bg-[#080a0f] flex items-center justify-center overflow-hidden">
        {showVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isSelf}
            className={`w-full h-full object-cover ${isSelf ? '-scale-x-100' : ''}`}
          />
        ) : (
          <div className="relative flex flex-col items-center justify-center w-full h-full p-2">
            {/* Círculo do Avatar com Indicador de Voz */}
            <div
              className={`relative w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-inner transition-all duration-150 ${
                isSpeaking
                  ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-[#080a0f] scale-105'
                  : 'ring-2 ring-stone-700'
              }`}
              style={{ backgroundColor: user.color || '#3b82f6' }}
            >
              {character?.assetName ? (
                <span className="text-sm font-semibold">{character.assetName.slice(0, 2).toUpperCase()}</span>
              ) : (
                <span>{(user.name || 'U').slice(0, 2).toUpperCase()}</span>
              )}

              {/* Ondas sonoras animadas ao falar */}
              {isSpeaking && (
                <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-black p-0.5 rounded-full shadow">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                </div>
              )}
            </div>

            {/* Aviso de câmera desligada */}
            <span className="text-[10px] text-stone-500 mt-1 flex items-center gap-1">
              <VideoOff className="w-2.5 h-2.5" />
              <span>Sem câmera</span>
            </span>
          </div>
        )}

        {/* Badge do Papel (Mestre / Jogador) */}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur text-[9px] font-semibold">
          {user.role === 'gm' ? (
            <span className="text-amber-400 flex items-center gap-0.5">
              <Crown className="w-2.5 h-2.5" />
              <span>Mestre</span>
            </span>
          ) : (
            <span className="text-sky-400 flex items-center gap-0.5">
              <Sword className="w-2.5 h-2.5" />
              <span>Jogador</span>
            </span>
          )}
        </div>

        {/* Indicador de Microfone Mutado */}
        {micMuted && (
          <div
            className="absolute top-1.5 right-1.5 p-1 rounded bg-rose-950/85 border border-rose-500/60 text-rose-300 text-[10px]"
            title="Microfone Mutado"
          >
            <MicOff className="w-3 h-3" />
          </div>
        )}

        {/* Efeito de equalizer flutuante quando o usuário está falando */}
        {isSpeaking && (
          <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-center gap-0.5 bg-black/60 backdrop-blur py-0.5 px-2 rounded-full">
            <span className="w-1 h-2.5 bg-emerald-400 rounded-full animate-bounce"></span>
            <span className="w-1 h-4 bg-emerald-300 rounded-full animate-bounce [animation-delay:0.12s]"></span>
            <span className="w-1 h-3 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.24s]"></span>
            <span className="text-[9px] font-medium text-emerald-300 ml-1">Falando...</span>
          </div>
        )}
      </div>

      {/* Rodapé do Card: Nome e Seleção/Associação de Personagem */}
      <div className="p-1.5 bg-[#0e121a] border-t border-stone-800/80 flex flex-col justify-between flex-1">
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-xs font-semibold text-stone-200 truncate"
            title={user.name}
          >
            {user.name} {isSelf && <span className="text-[10px] text-stone-400">(Você)</span>}
          </span>

          {/* Botão de Localizar/Focar Personagem no Mapa 3D */}
          {character && onFocusMiniature && (
            <button
              type="button"
              onClick={() => onFocusMiniature(character.id)}
              title={`Focar em ${character.name} no tabuleiro 3D`}
              className="p-1 text-stone-400 hover:text-amber-300 hover:bg-[#1a202c] rounded transition-colors cursor-pointer"
            >
              <MapPin className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* "Falar pelo Personagem" */}
        {isSelf && onSelectCharacter ? (
          <div className="mt-1">
            <select
              value={character?.id || ''}
              onChange={(e) => onSelectCharacter(e.target.value)}
              className="w-full text-[10px] bg-[#141822] text-amber-300 border border-stone-700/80 rounded px-1 py-0.5 truncate cursor-pointer hover:border-amber-500/60 transition-colors"
              title="Escolha a miniatura que representa sua fala no mapa"
            >
              <option value="">Interpretando: Nenhum</option>
              {miniaturesList
                .filter((m) => !m.isPropOnly)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    🎭 {m.name}
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div className="mt-1 text-[10px] text-stone-400 truncate flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            <span className="truncate">
              {character ? character.name : 'Sem personagem'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

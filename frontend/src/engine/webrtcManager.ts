import { ClientMessage, RoomUser } from '../types/vtt';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export interface WebRTCStatus {
  micMuted: boolean;
  videoOff: boolean;
  isDeafened: boolean;
  hasCamera: boolean;
  hasMic: boolean;
  activeCharacterId?: string;
  isInitializing: boolean;
}

export type StreamUpdateCallback = (
  remoteStreams: Map<string, MediaStream>,
  localStream: MediaStream | null
) => void;

export type SpeakingUpdateCallback = (speakingMap: Map<string, boolean>) => void;
export type StatusUpdateCallback = (status: WebRTCStatus) => void;
export type ErrorCallback = (error: string) => void;

export class WebRTCManager {
  private myUserId: string = '';
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private remoteStreams = new Map<string, MediaStream>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private speakingMap = new Map<string, boolean>();

  private micMuted = false;
  private videoOff = true;
  private isDeafened = false;
  private hasCamera = false;
  private hasMic = false;
  private activeCharacterId?: string;
  private isInitializing = false;

  private sendWs: ((msg: ClientMessage) => void) | null = null;

  // Analisador Web Audio para detecção de voz em tempo real (VAD)
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadInterval: number | null = null;
  private lastSpeakingState = false;
  private silenceCounter = 0;

  // Callbacks
  private onStreamCallbacks = new Set<StreamUpdateCallback>();
  private onSpeakingCallbacks = new Set<SpeakingUpdateCallback>();
  private onStatusCallbacks = new Set<StatusUpdateCallback>();
  private onErrorCallbacks = new Set<ErrorCallback>();

  constructor() {
    this.checkAvailableDevices();
  }

  public setMyUserId(id: string) {
    if (this.myUserId !== id) {
      this.myUserId = id;
    }
  }

  public setSendWs(sendWs: (msg: ClientMessage) => void) {
    this.sendWs = sendWs;
  }

  public setCharacterId(characterId?: string) {
    this.activeCharacterId = characterId;
    this.broadcastState();
    this.emitStatus();
  }

  public getStatus(): WebRTCStatus {
    return {
      micMuted: this.micMuted,
      videoOff: this.videoOff,
      isDeafened: this.isDeafened,
      hasCamera: this.hasCamera,
      hasMic: this.hasMic,
      activeCharacterId: this.activeCharacterId,
      isInitializing: this.isInitializing,
    };
  }

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }

  public getSpeakingMap(): Map<string, boolean> {
    return this.speakingMap;
  }

  public subscribeStreams(cb: StreamUpdateCallback): () => void {
    this.onStreamCallbacks.add(cb);
    cb(this.remoteStreams, this.localStream);
    return () => this.onStreamCallbacks.delete(cb);
  }

  public subscribeSpeaking(cb: SpeakingUpdateCallback): () => void {
    this.onSpeakingCallbacks.add(cb);
    cb(this.speakingMap);
    return () => this.onSpeakingCallbacks.delete(cb);
  }

  public subscribeStatus(cb: StatusUpdateCallback): () => void {
    this.onStatusCallbacks.add(cb);
    cb(this.getStatus());
    return () => this.onStatusCallbacks.delete(cb);
  }

  public subscribeErrors(cb: ErrorCallback): () => void {
    this.onErrorCallbacks.add(cb);
    return () => this.onErrorCallbacks.delete(cb);
  }

  private emitStreams() {
    for (const cb of this.onStreamCallbacks) {
      cb(this.remoteStreams, this.localStream);
    }
  }

  private emitSpeaking() {
    for (const cb of this.onSpeakingCallbacks) {
      cb(new Map(this.speakingMap));
    }
  }

  private emitStatus() {
    const status = this.getStatus();
    for (const cb of this.onStatusCallbacks) {
      cb(status);
    }
  }

  private emitError(err: string) {
    for (const cb of this.onErrorCallbacks) {
      cb(err);
    }
  }

  private async checkAvailableDevices() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.hasMic = devices.some((d) => d.kind === 'audioinput');
      this.hasCamera = devices.some((d) => d.kind === 'videoinput');
      this.emitStatus();
    } catch {
      // Ignorar caso permissões não permitam enumerate antes do getUserMedia
    }
  }

  /**
   * Inicia a captura de microfone e opcionalmente câmera
   */
  public async startMedia(withVideo = false): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this.emitError('Navegador não suporta acesso a microfone/câmera.');
      return false;
    }

    this.isInitializing = true;
    this.emitStatus();

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: withVideo
            ? {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { max: 24 },
              }
            : false,
        });
        this.videoOff = !withVideo;
      } catch (err) {
        // Se falhou ao pedir com vídeo (ex: não tem webcam conectada), tenta apenas áudio
        if (withVideo) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          this.videoOff = true;
        } else {
          throw err;
        }
      }

      this.localStream = stream;
      this.micMuted = false;
      this.setupVAD(stream);
      await this.checkAvailableDevices();

      // Adiciona as faixas em todas as conexões peer já existentes
      for (const pc of this.peerConnections.values()) {
        for (const track of stream.getTracks()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
          if (sender) {
            void sender.replaceTrack(track);
          } else {
            pc.addTrack(track, stream);
          }
        }
      }

      this.isInitializing = false;
      this.broadcastState();
      this.emitStreams();
      this.emitStatus();
      return true;
    } catch (err: any) {
      this.isInitializing = false;
      this.emitStatus();
      const message =
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Permissão negada para acessar o microfone ou câmera.'
          : err.name === 'NotFoundError'
          ? 'Nenhum microfone encontrado neste dispositivo.'
          : `Erro ao ativar voz/vídeo: ${err.message || 'desconhecido'}`;
      this.emitError(message);
      return false;
    }
  }

  /**
   * Configura analisador de volume de voz em tempo real
   */
  private setupVAD(stream: MediaStream) {
    if (this.vadInterval) {
      window.clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.audioCtx = new AudioCtx();
      const src = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;
      src.connect(this.analyser);

      const buffer = new Uint8Array(this.analyser.frequencyBinCount);
      this.vadInterval = window.setInterval(() => {
        if (!this.analyser || this.micMuted || !this.localStream) {
          if (this.lastSpeakingState) {
            this.setSpeaking(this.myUserId, false);
          }
          return;
        }

        this.analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const isSpeakingNow = avg > 14;

        if (isSpeakingNow) {
          this.silenceCounter = 0;
          if (!this.lastSpeakingState) {
            this.setSpeaking(this.myUserId, true);
          }
        } else {
          this.silenceCounter++;
          // Apenas desliga o speaking após ~3 ciclos (~240ms) de silêncio para manter suave
          if (this.silenceCounter >= 3 && this.lastSpeakingState) {
            this.setSpeaking(this.myUserId, false);
          }
        }
      }, 80);
    } catch {
      // Ignorar fallback de VAD se áudio API não iniciar
    }
  }

  private setSpeaking(userId: string, isSpeaking: boolean) {
    if (!userId) return;
    this.speakingMap.set(userId, isSpeaking);
    if (userId === this.myUserId) {
      this.lastSpeakingState = isSpeaking;
      this.broadcastState();
    }
    this.emitSpeaking();
  }

  public updateRemoteUserState(
    userId: string,
    state: {
      micMuted?: boolean;
      videoOff?: boolean;
      speaking?: boolean;
      characterId?: string;
    }
  ) {
    if (state.speaking !== undefined) {
      this.speakingMap.set(userId, !!state.speaking);
      this.emitSpeaking();
    }
  }

  /**
   * Liga/Desliga microfone (Mudo)
   */
  public toggleMic(forceMute?: boolean): boolean {
    if (!this.localStream) {
      void this.startMedia(false);
      return true;
    }

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) {
      void this.startMedia(false);
      return true;
    }

    const targetMute = forceMute !== undefined ? forceMute : !this.micMuted;
    audioTrack.enabled = !targetMute;
    this.micMuted = targetMute;

    if (this.micMuted) {
      this.setSpeaking(this.myUserId, false);
    }
    this.broadcastState();
    this.emitStatus();
    return !this.micMuted;
  }

  /**
   * Liga/Desliga Câmera (Webcam)
   */
  public async toggleCamera(forceOff?: boolean): Promise<boolean> {
    if (!this.localStream) {
      return this.startMedia(true);
    }

    const targetOff = forceOff !== undefined ? forceOff : !this.videoOff;

    if (targetOff) {
      // Desligar câmera
      const videoTracks = this.localStream.getVideoTracks();
      for (const track of videoTracks) {
        track.stop();
        this.localStream.removeTrack(track);
      }
      for (const pc of this.peerConnections.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          void sender.replaceTrack(null);
        }
      }
      this.videoOff = true;
    } else {
      // Ligar câmera
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { max: 24 },
          },
        });
        const videoTrack = camStream.getVideoTracks()[0];
        if (videoTrack) {
          this.localStream.addTrack(videoTrack);
          for (const pc of this.peerConnections.values()) {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) {
              void sender.replaceTrack(videoTrack);
            } else {
              pc.addTrack(videoTrack, this.localStream);
            }
          }
          this.videoOff = false;
        }
      } catch (err: any) {
        this.emitError(
          err.name === 'NotAllowedError'
            ? 'Permissão de câmera negada pelo navegador.'
            : 'Não foi possível ligar a câmera.'
        );
        this.videoOff = true;
      }
    }

    this.broadcastState();
    this.emitStreams();
    this.emitStatus();
    return !this.videoOff;
  }

  /**
   * Ensurdecer (muta o áudio que você escuta dos outros)
   */
  public toggleDeafen(forceDeafen?: boolean): boolean {
    this.isDeafened = forceDeafen !== undefined ? forceDeafen : !this.isDeafened;
    for (const audioEl of this.audioElements.values()) {
      audioEl.muted = this.isDeafened;
    }
    this.emitStatus();
    return this.isDeafened;
  }

  private broadcastState() {
    if (this.sendWs) {
      this.sendWs({
        type: 'webrtc:state',
        payload: {
          micMuted: this.micMuted,
          videoOff: this.videoOff,
          speaking: !!this.speakingMap.get(this.myUserId),
          characterId: this.activeCharacterId,
        },
      });
    }
  }

  /**
   * Sincroniza a lista de usuários da sala (cria/remove conexões P2P WebRTC)
   */
  public syncRoomUsers(users: RoomUser[]) {
    if (!this.myUserId) return;

    const currentOtherUserIds = new Set<string>();
    for (const u of users) {
      if (u.id !== this.myUserId) {
        currentOtherUserIds.add(u.id);
        if (!this.peerConnections.has(u.id)) {
          this.createPeerConnection(u.id);
        }
      }
    }

    // Fechar peers de quem saiu da mesa
    for (const [peerId, pc] of this.peerConnections.entries()) {
      if (!currentOtherUserIds.has(peerId)) {
        try {
          pc.close();
        } catch {
          // ignore
        }
        this.peerConnections.delete(peerId);
        this.remoteStreams.delete(peerId);
        this.speakingMap.delete(peerId);

        const audioEl = this.audioElements.get(peerId);
        if (audioEl) {
          audioEl.pause();
          audioEl.srcObject = null;
          audioEl.remove();
          this.audioElements.delete(peerId);
        }
      }
    }

    this.emitStreams();
    this.emitSpeaking();
  }

  private createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnections.set(remoteUserId, pc);

    // Adiciona faixas locais se já capturadas
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.sendWs) {
        this.sendWs({
          type: 'webrtc:signal',
          payload: {
            targetUserId: remoteUserId,
            signal: {
              type: 'candidate',
              candidate: event.candidate.toJSON(),
            },
          },
        });
      }
    };

    pc.ontrack = (event) => {
      let stream = this.remoteStreams.get(remoteUserId);
      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(remoteUserId, stream);
      }
      stream.addTrack(event.track);

      // Reprodução automática de áudio remoto
      if (event.track.kind === 'audio') {
        let audioEl = this.audioElements.get(remoteUserId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          audioEl.muted = this.isDeafened;
          this.audioElements.set(remoteUserId, audioEl);
        }
        audioEl.srcObject = stream;
        audioEl.play().catch(() => {});
      }

      this.emitStreams();
    };

    // Protocolo Perfect Negotiation do WebRTC W3C
    let makingOffer = false;
    const isPolite = this.myUserId.localeCompare(remoteUserId) > 0;

    pc.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        if (this.sendWs) {
          this.sendWs({
            type: 'webrtc:signal',
            payload: {
              targetUserId: remoteUserId,
              signal: {
                type: 'description',
                sdp: pc.localDescription?.toJSON(),
              },
            },
          });
        }
      } catch (err) {
        console.error(`Erro ao criar oferta WebRTC para ${remoteUserId}:`, err);
      } finally {
        makingOffer = false;
      }
    };

    (pc as any)._makingOffer = () => makingOffer;
    (pc as any)._isPolite = isPolite;

    return pc;
  }

  /**
   * Processa sinais WebRTC (SDP / ICE) recebidos pelo WebSocket
   */
  public async handleSignal(senderUserId: string, signal: any) {
    let pc = this.peerConnections.get(senderUserId);
    if (!pc) {
      pc = this.createPeerConnection(senderUserId);
    }

    try {
      if (signal.type === 'description' && signal.sdp) {
        const description = new RTCSessionDescription(signal.sdp);
        const isOffer = description.type === 'offer';
        const isPolite = (pc as any)._isPolite ?? (this.myUserId.localeCompare(senderUserId) > 0);
        const makingOffer = (pc as any)._makingOffer?.() || false;
        const offerCollision = isOffer && (makingOffer || pc.signalingState !== 'stable');

        if (offerCollision) {
          if (!isPolite) return;
        }

        await pc.setRemoteDescription(description);

        if (isOffer) {
          await pc.setLocalDescription();
          if (this.sendWs) {
            this.sendWs({
              type: 'webrtc:signal',
              payload: {
                targetUserId: senderUserId,
                signal: {
                  type: 'description',
                  sdp: pc.localDescription?.toJSON(),
                },
              },
            });
          }
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (err) {
          // Ignorar candidatos anteriores ao remote description
        }
      }
    } catch (err) {
      console.error(`Erro ao processar sinal WebRTC de ${senderUserId}:`, err);
    }
  }

  /**
   * Desconecta e libera todos os recursos de áudio e vídeo
   */
  public destroy() {
    if (this.vadInterval) {
      window.clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    for (const pc of this.peerConnections.values()) {
      try {
        pc.close();
      } catch {
        // ignore
      }
    }
    this.peerConnections.clear();
    for (const audioEl of this.audioElements.values()) {
      audioEl.pause();
      audioEl.srcObject = null;
      audioEl.remove();
    }
    this.audioElements.clear();
    this.remoteStreams.clear();
    this.speakingMap.clear();
  }
}

export const webrtc = new WebRTCManager();

import { signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  CharacterSheet,
  MapAnnotation,
  MapPresetId,
  MiniatureData,
  RoomState,
  Role,
} from '../types/vtt';

function sanitizeId(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return cleaned || fallback;
}

function sanitizeSheetForFirestore(sheet: CharacterSheet): CharacterSheet {
  return {
    isMonster: Boolean(sheet.isMonster),
    hiddenFromPlayers: Boolean(sheet.hiddenFromPlayers),
    raceOrType: String(sheet.raceOrType || '').slice(0, 48),
    classOrRole: String(sheet.classOrRole || '').slice(0, 48),
    levelOrCr: String(sheet.levelOrCr || '').slice(0, 24),
    ac: Math.max(1, Math.min(50, Math.round(Number(sheet.ac) || 12))),
    speed: String(sheet.speed || '30 ft').slice(0, 32),
    initiativeBonus: Math.max(-10, Math.min(30, Math.round(Number(sheet.initiativeBonus) || 0))),
    stats: {
      str: Math.max(1, Math.min(30, Math.round(Number(sheet.stats?.str) || 10))),
      dex: Math.max(1, Math.min(30, Math.round(Number(sheet.stats?.dex) || 10))),
      con: Math.max(1, Math.min(30, Math.round(Number(sheet.stats?.con) || 10))),
      int: Math.max(1, Math.min(30, Math.round(Number(sheet.stats?.int) || 10))),
      wis: Math.max(1, Math.min(30, Math.round(Number(sheet.stats?.wis) || 10))),
      cha: Math.max(1, Math.min(30, Math.round(Number(sheet.stats?.cha) || 10))),
    },
    attacks: Array.isArray(sheet.attacks)
      ? sheet.attacks.slice(0, 10).map((a) => ({
          name: String(a.name || '').slice(0, 48),
          bonus: String(a.bonus || '+0').slice(0, 12),
          damage: String(a.damage || '1d6').slice(0, 48),
        }))
      : [],
    abilities: String(sheet.abilities || '').slice(0, 1500),
    equipment: String(sheet.equipment || '').slice(0, 1500),
    notes: String(sheet.notes || '').slice(0, 1500),
  };
}

export async function signInWithGoogleAccount(): Promise<User> {
  let cred;
  try {
    cred = await signInWithPopup(auth, googleProvider);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/unauthorized-domain' && typeof window !== 'undefined') {
      const host = window.location.hostname;
      throw new Error(
        `Dominio "${host}" ainda nao esta autorizado no Firebase Auth. Adicione "${host}" em Firebase Console > Authentication > Settings > Authorized domains (projeto gen-lang-client-0687717722).`
      );
    }
    throw err;
  }
  const user = cred.user;
  const userPath = `users/${user.uid}`;
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        uid: user.uid,
        displayName: (user.displayName || user.email || 'Aventureiro').slice(0, 48),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
  return user;
}

export async function signOutGoogleAccount(): Promise<void> {
  await signOut(auth);
}

export async function saveRoomToFirestore(
  room: RoomState,
  role: Role,
  userName: string
): Promise<{ savedAt: number; isOwner: boolean }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    throw new Error('Conecte uma conta Google verificada para salvar na nuvem.');
  }

  const roomId = sanitizeId(room.roomId.toUpperCase(), 'MESA-01').slice(0, 24);
  const roomRef = doc(db, 'rooms', roomId);
  const roomPath = `rooms/${roomId}`;

  let existingSnap;
  try {
    existingSnap = await getDoc(roomRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, roomPath);
  }

  let roomOwnerUid = user.uid;
  const isOwner = !existingSnap.exists() || existingSnap.data()?.ownerUid === user.uid;

  if (!existingSnap.exists()) {
    if (role !== 'gm') {
      return { savedAt: Date.now(), isOwner: false };
    }
    try {
      await setDoc(roomRef, {
        roomId,
        ownerUid: user.uid,
        gmName: (userName || 'Mestre').slice(0, 32),
        presetName: room.presetName || 'blank',
        cols: Math.round(room.cols || 16),
        rows: Math.round(room.rows || 16),
        tiles: room.tiles || {},
        music: room.music || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, roomPath);
    }
  } else {
    roomOwnerUid = String(existingSnap.data()?.ownerUid || user.uid);
    if (isOwner && role === 'gm') {
      try {
        await updateDoc(roomRef, {
          presetName: room.presetName || 'blank',
          tiles: room.tiles || {},
          music: room.music || null,
          gmName: (userName || 'Mestre').slice(0, 32),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, roomPath);
      }
    }
  }

  // Sync miniatures
  const minisCol = collection(db, 'rooms', roomId, 'miniatures');
  const minisList = Object.values(room.miniatures || {});

  if (isOwner && role === 'gm') {
    let existingMiniIds = new Set<string>();
    try {
      const snap = await getDocs(minisCol);
      existingMiniIds = new Set(snap.docs.map((d) => d.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `${roomPath}/miniatures`);
    }

    const activeIds = new Set<string>();
    for (const mini of minisList) {
      const miniId = sanitizeId(mini.id, `mini_${Date.now()}`);
      activeIds.add(miniId);
      const miniDocPath = `${roomPath}/miniatures/${miniId}`;
      const payload: Record<string, unknown> = {
        id: miniId,
        roomId,
        roomOwnerUid,
        ownerUid: mini.ownerUid && /^[a-zA-Z0-9_-]+$/.test(mini.ownerUid) ? mini.ownerUid : user.uid,
        ownerName: String(mini.ownerName || '').slice(0, 32),
        name: String(mini.name || 'Miniatura').slice(0, 32),
        format: mini.format,
        x: Number(mini.x) || 0,
        z: Number(mini.z) || 0,
        rotationY: Number(mini.rotationY) || 0,
        footprint: Number(mini.footprint) || 1,
        scaleMultiplier: Number(mini.scaleMultiplier) || 1,
        fixZUp: Boolean(mini.fixZUp),
        showBase: Boolean(mini.showBase),
        color: String(mini.color || '#d97706').slice(0, 16),
        finish: String(mini.finish || 'original').slice(0, 16),
        hp: Math.max(0, Math.min(9999, Math.round(Number(mini.hp) || 0))),
        maxHp: Math.max(1, Math.min(9999, Math.round(Number(mini.maxHp) || 30))),
        isPropOnly: Boolean(mini.isPropOnly),
        sheet: mini.sheet ? sanitizeSheetForFirestore(mini.sheet) : null,
        updatedAt: serverTimestamp(),
      };
      if (mini.assetId) payload.assetId = String(mini.assetId).slice(0, 128);
      if (mini.assetName) payload.assetName = String(mini.assetName).slice(0, 128);
      if (mini.remoteUrl) payload.remoteUrl = String(mini.remoteUrl).slice(0, 512);
      if (mini.baseStyle) payload.baseStyle = String(mini.baseStyle).slice(0, 24);

      try {
        await setDoc(doc(db, 'rooms', roomId, 'miniatures', miniId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, miniDocPath);
      }
    }

    for (const oldId of existingMiniIds) {
      if (!activeIds.has(oldId)) {
        try {
          await deleteDoc(doc(db, 'rooms', roomId, 'miniatures', oldId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `${roomPath}/miniatures/${oldId}`);
        }
      }
    }

    // Sync annotations
    const annsCol = collection(db, 'rooms', roomId, 'annotations');
    let existingAnnIds = new Set<string>();
    try {
      const snap = await getDocs(annsCol);
      existingAnnIds = new Set(snap.docs.map((d) => d.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `${roomPath}/annotations`);
    }

    const activeAnnIds = new Set<string>();
    for (const ann of Object.values(room.annotations || {})) {
      const annId = sanitizeId(ann.id, `ann_${Date.now()}`);
      activeAnnIds.add(annId);
      try {
        await setDoc(doc(db, 'rooms', roomId, 'annotations', annId), {
          id: annId,
          roomId,
          ownerUid: user.uid,
          kind: ann.kind,
          x: Number(ann.x) || 0,
          z: Number(ann.z) || 0,
          radius: Number(ann.radius) || 1,
          rotationY: Number(ann.rotationY) || 0,
          color: String(ann.color || '#f59e0b').slice(0, 16),
          label: String(ann.label || '').slice(0, 48),
          gmOnly: Boolean(ann.gmOnly),
          createdBy: String(ann.createdBy || userName || 'Mestre').slice(0, 32),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${roomPath}/annotations/${annId}`);
      }
    }

    for (const oldAnnId of existingAnnIds) {
      if (!activeAnnIds.has(oldAnnId)) {
        try {
          await deleteDoc(doc(db, 'rooms', roomId, 'annotations', oldAnnId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `${roomPath}/annotations/${oldAnnId}`);
        }
      }
    }
  } else {
    // Player updates only their own character in Firestore
    const ownMinis = minisList.filter(
      (m) =>
        !m.isPropOnly &&
        !m.sheet?.isMonster &&
        m.ownerName &&
        m.ownerName.toLowerCase() === userName.toLowerCase()
    );
    for (const mini of ownMinis) {
      const miniId = sanitizeId(mini.id, `mini_${Date.now()}`);
      const miniRef = doc(db, 'rooms', roomId, 'miniatures', miniId);
      const miniDocPath = `${roomPath}/miniatures/${miniId}`;
      try {
        const snap = await getDoc(miniRef);
        const safeSheet = mini.sheet
          ? { ...sanitizeSheetForFirestore(mini.sheet), isMonster: false, hiddenFromPlayers: false }
          : null;
        if (!snap.exists()) {
          await setDoc(miniRef, {
            id: miniId,
            roomId,
            roomOwnerUid,
            ownerUid: user.uid,
            ownerName: String(mini.ownerName).slice(0, 32),
            name: String(mini.name || 'Personagem').slice(0, 32),
            format: mini.format,
            ...(mini.assetId ? { assetId: String(mini.assetId).slice(0, 128) } : {}),
            ...(mini.assetName ? { assetName: String(mini.assetName).slice(0, 128) } : {}),
            ...(mini.remoteUrl ? { remoteUrl: String(mini.remoteUrl).slice(0, 512) } : {}),
            ...(mini.baseStyle ? { baseStyle: String(mini.baseStyle).slice(0, 24) } : {}),
            x: Number(mini.x) || 0,
            z: Number(mini.z) || 0,
            rotationY: Number(mini.rotationY) || 0,
            footprint: Number(mini.footprint) || 1,
            scaleMultiplier: Number(mini.scaleMultiplier) || 1,
            fixZUp: Boolean(mini.fixZUp),
            showBase: Boolean(mini.showBase),
            color: String(mini.color || '#0ea5e9').slice(0, 16),
            finish: String(mini.finish || 'original').slice(0, 16),
            hp: Math.max(0, Math.min(9999, Math.round(Number(mini.hp) || 0))),
            maxHp: Math.max(1, Math.min(9999, Math.round(Number(mini.maxHp) || 30))),
            isPropOnly: false,
            sheet: safeSheet,
            updatedAt: serverTimestamp(),
          });
        } else if (snap.data()?.ownerUid === user.uid) {
          await updateDoc(miniRef, {
            name: String(mini.name || 'Personagem').slice(0, 32),
            x: Number(mini.x) || 0,
            z: Number(mini.z) || 0,
            rotationY: Number(mini.rotationY) || 0,
            hp: Math.max(0, Math.min(9999, Math.round(Number(mini.hp) || 0))),
            maxHp: Math.max(1, Math.min(9999, Math.round(Number(mini.maxHp) || 30))),
            sheet: safeSheet,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, miniDocPath);
      }
    }
  }

  return { savedAt: Date.now(), isOwner };
}

export async function loadRoomFromFirestore(roomIdRaw: string): Promise<{
  presetName: MapPresetId;
  tiles: RoomState['tiles'];
  miniatures: Record<string, MiniatureData>;
  annotations: Record<string, MapAnnotation>;
  music: RoomState['music'];
} | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  const roomId = sanitizeId(roomIdRaw.toUpperCase(), 'MESA-01').slice(0, 24);
  const roomPath = `rooms/${roomId}`;

  let roomSnap;
  try {
    roomSnap = await getDoc(doc(db, 'rooms', roomId));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, roomPath);
  }
  if (!roomSnap.exists()) return null;

  const roomData = roomSnap.data();
  const miniatures: Record<string, MiniatureData> = {};
  const annotations: Record<string, MapAnnotation> = {};

  try {
    const minisSnap = await getDocs(collection(db, 'rooms', roomId, 'miniatures'));
    minisSnap.forEach((d) => {
      const data = d.data();
      miniatures[d.id] = {
        id: d.id,
        name: String(data.name || 'Miniatura'),
        format: data.format,
        assetId: data.assetId,
        assetName: data.assetName,
        remoteUrl: data.remoteUrl,
        x: Number(data.x) || 0,
        z: Number(data.z) || 0,
        rotationY: Number(data.rotationY) || 0,
        footprint: data.footprint || 1,
        scaleMultiplier: Number(data.scaleMultiplier) || 1,
        fixZUp: Boolean(data.fixZUp),
        showBase: Boolean(data.showBase),
        baseStyle: data.baseStyle,
        color: String(data.color || '#d97706'),
        finish: data.finish || 'original',
        hp: Number(data.hp) || 0,
        maxHp: Number(data.maxHp) || 30,
        ownerName: String(data.ownerName || ''),
        ownerUid: data.ownerUid ? String(data.ownerUid) : undefined,
        isPropOnly: Boolean(data.isPropOnly),
        sheet: data.sheet || undefined,
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `${roomPath}/miniatures`);
  }

  try {
    const annsSnap = await getDocs(collection(db, 'rooms', roomId, 'annotations'));
    annsSnap.forEach((d) => {
      const data = d.data();
      annotations[d.id] = {
        id: d.id,
        kind: data.kind,
        x: Number(data.x) || 0,
        z: Number(data.z) || 0,
        radius: Number(data.radius) || 1,
        rotationY: Number(data.rotationY) || 0,
        color: String(data.color || '#f59e0b'),
        label: String(data.label || ''),
        gmOnly: Boolean(data.gmOnly),
        createdBy: String(data.createdBy || 'Mestre'),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `${roomPath}/annotations`);
  }

  return {
    presetName: (roomData.presetName as MapPresetId) || 'blank',
    tiles: roomData.tiles || {},
    miniatures,
    annotations,
    music: roomData.music || null,
  };
}

export async function listMyFirestoreRooms(): Promise<
  { roomId: string; presetName: string; gmName: string }[]
> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return [];
  try {
    const q = query(collection(db, 'rooms'), where('ownerUid', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      roomId: String(d.data().roomId || d.id),
      presetName: String(d.data().presetName || 'blank'),
      gmName: String(d.data().gmName || 'Mestre'),
    }));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'rooms');
  }
}

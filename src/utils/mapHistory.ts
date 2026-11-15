import { MapAnnotation, MapPresetId, MiniatureData, TileCell } from '../types/vtt';

export const MAX_MAP_HISTORY = 50;

export interface MapSnapshot {
  presetName: MapPresetId;
  tiles: Record<string, TileCell>;
  miniatures: Record<string, MiniatureData>;
  annotations: Record<string, MapAnnotation>;
}

export type MapHistoryEntry =
  | {
      kind: 'tiles';
      label: string;
      before: TileCell[];
      after: TileCell[];
    }
  | {
      kind: 'mini-create';
      label: string;
      mini: MiniatureData;
    }
  | {
      kind: 'mini-delete';
      label: string;
      mini: MiniatureData;
    }
  | {
      kind: 'mini-update';
      label: string;
      id: string;
      before: MiniatureData;
      after: MiniatureData;
      timestamp: number;
    }
  | {
      kind: 'annotation-create';
      label: string;
      annotation: MapAnnotation;
    }
  | {
      kind: 'annotation-delete';
      label: string;
      annotation: MapAnnotation;
    }
  | {
      kind: 'annotation-update';
      label: string;
      id: string;
      before: MapAnnotation;
      after: MapAnnotation;
      timestamp: number;
    }
  | {
      kind: 'preset';
      label: string;
      before: MapSnapshot;
      after: MapSnapshot;
    };

export function pushHistoryEntry(
  stack: MapHistoryEntry[],
  entry: MapHistoryEntry,
  maxEntries = MAX_MAP_HISTORY
): MapHistoryEntry[] {
  const prev = stack[stack.length - 1];

  // Coalesce rapid updates (e.g. scale/radius slider drag or typing) on the same entity within 600ms
  if (
    prev &&
    entry.kind === 'mini-update' &&
    prev.kind === 'mini-update' &&
    prev.id === entry.id &&
    entry.timestamp - prev.timestamp < 600
  ) {
    const merged: MapHistoryEntry = {
      ...prev,
      after: entry.after,
      timestamp: entry.timestamp,
      label: entry.label,
    };
    return [...stack.slice(0, -1), merged];
  }

  if (
    prev &&
    entry.kind === 'annotation-update' &&
    prev.kind === 'annotation-update' &&
    prev.id === entry.id &&
    entry.timestamp - prev.timestamp < 600
  ) {
    const merged: MapHistoryEntry = {
      ...prev,
      after: entry.after,
      timestamp: entry.timestamp,
      label: entry.label,
    };
    return [...stack.slice(0, -1), merged];
  }

  const next = [...stack, entry];
  return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
}

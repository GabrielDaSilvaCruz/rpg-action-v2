import React, { useEffect, useRef } from 'react';
import { Clipboard, Copy, RotateCw, ScrollText, SlidersHorizontal, Trash2 } from 'lucide-react';
import { MapAnnotation, MiniatureData } from '../types/vtt';
import { ViewportContextMenuTarget } from './TabletopViewport';

export type ClipboardBoardItem =
  | { kind: 'mini'; data: MiniatureData }
  | { kind: 'annotation'; data: MapAnnotation };

interface BoardContextMenuProps {
  target: ViewportContextMenuTarget;
  mini: MiniatureData | null;
  annotation: MapAnnotation | null;
  selectedMini: MiniatureData | null;
  clipboard: ClipboardBoardItem | null;
  onCopyMini: (mini: MiniatureData) => void;
  onCopyAnnotation: (annotation: MapAnnotation) => void;
  onPasteAt: (gridX: number, gridZ: number) => void;
  onRotateMini: (mini: MiniatureData) => void;
  onSelectMini: (id: string) => void;
  onOpenSheet?: (mini: MiniatureData) => void;
  onDeleteMini: (id: string) => void;
  onDeleteAnnotation: (id: string) => void;
  onClose: () => void;
}

export const BoardContextMenu: React.FC<BoardContextMenuProps> = ({
  target,
  mini,
  annotation,
  selectedMini,
  clipboard,
  onCopyMini,
  onCopyAnnotation,
  onPasteAt,
  onRotateMini,
  onSelectMini,
  onOpenSheet,
  onDeleteMini,
  onDeleteAnnotation,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const maxW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const maxH = typeof window !== 'undefined' ? window.innerHeight : 720;
  const left = Math.max(8, Math.min(target.screenX + 4, maxW - 252));
  const top = Math.max(8, Math.min(target.screenY + 4, maxH - 250));

  const clipboardLabel =
    clipboard?.kind === 'mini'
      ? clipboard.data.name
      : clipboard?.kind === 'annotation'
      ? clipboard.data.label || `Marcador (${clipboard.data.kind})`
      : null;

  const canPasteHere =
    clipboard !== null && target.gridX !== null && target.gridZ !== null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Menu de acoes do mapa"
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top }}
      className="fixed z-40 w-60 bg-[#12161e] border border-stone-700/80 rounded-xl shadow-2xl p-1.5 text-xs text-stone-200 select-none"
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-stone-800 mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold text-amber-300 truncate">
          {mini
            ? mini.name
            : annotation
            ? annotation.label || `Marcador (${annotation.kind})`
            : target.gridX !== null && target.gridZ !== null
            ? `Casa (${target.gridX}, ${target.gridZ})`
            : 'Tabuleiro 3D'}
        </span>
        <span className="text-[10px] font-mono-tabular text-stone-400 shrink-0">
          {mini
            ? mini.isPropOnly
              ? 'Cenario 3D'
              : 'Personagem'
            : annotation
            ? 'Marcador'
            : 'Terreno'}
        </span>
      </div>

      {/* Copy target */}
      {mini && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCopyMini(mini);
            onClose();
          }}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1e2636] text-left text-stone-100 cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <Copy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Copiar objeto / personagem</span>
          </span>
          <span className="text-[10px] font-mono-tabular text-stone-500">Ctrl+C</span>
        </button>
      )}

      {annotation && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCopyAnnotation(annotation);
            onClose();
          }}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1e2636] text-left text-stone-100 cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <Copy className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span className="truncate">Copiar marcador 3D</span>
          </span>
          <span className="text-[10px] font-mono-tabular text-stone-500">Ctrl+C</span>
        </button>
      )}

      {!mini && !annotation && selectedMini && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onCopyMini(selectedMini);
            onClose();
          }}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1e2636] text-left text-stone-200 cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <Copy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Copiar "{selectedMini.name}"</span>
          </span>
          <span className="text-[10px] font-mono-tabular text-stone-500">Ctrl+C</span>
        </button>
      )}

      {/* Paste copied object / scenery / character at clicked coordinates */}
      {canPasteHere && clipboardLabel && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onPasteAt(target.gridX!, target.gridZ!);
            onClose();
          }}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 mt-0.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/40 text-left text-emerald-200 cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <Clipboard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate font-medium">Colar "{clipboardLabel}" aqui</span>
          </span>
          <span className="text-[10px] font-mono-tabular text-emerald-400/80">Ctrl+V</span>
        </button>
      )}

      {/* Extra quick actions for right-clicked mini */}
      {mini && (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onRotateMini(mini);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 mt-0.5 rounded-lg hover:bg-[#1e2636] text-left text-stone-200 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Girar +45°</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onSelectMini(mini.id);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1e2636] text-left text-stone-200 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>Selecionar & Dimensionar</span>
          </button>
          {!mini.isPropOnly && onOpenSheet && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenSheet(mini);
                onClose();
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#1e2636] text-left text-amber-200 cursor-pointer"
            >
              <ScrollText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Abrir Ficha ({mini.sheet?.isMonster ? 'Monstro' : 'Personagem'})</span>
            </button>
          )}
        </>
      )}

      {(mini || annotation) && (
        <div className="mt-1 pt-1 border-t border-stone-800">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (mini) onDeleteMini(mini.id);
              else if (annotation) onDeleteAnnotation(annotation.id);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-950/60 text-left text-rose-300 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Remover do mapa</span>
          </button>
        </div>
      )}

      {!mini && !annotation && !canPasteHere && !selectedMini && (
        <p className="px-2.5 py-1.5 text-[11px] text-stone-400 leading-snug">
          Clique com o botao direito em um objeto 3D, cenario ou personagem para copiar e depois cole em qualquer casa.
        </p>
      )}
    </div>
  );
};

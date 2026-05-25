import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Tool } from "../tools/types";
import { viewportBottomCenter, useProximityDim } from "../utils/synchrony";

const COLOR_SWATCHES = [
  '#ef4444', // red
  '#f97316', // orange
  '#fde047', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#64748b', // slate
  '#fef9c3', // light yellow
  '#ffffff', // white
];

const STROKE_WIDTHS = [2, 4, 8, 14];

interface Props {
  activeTool: Tool;
  color: string;
  onColorChange: (color: string) => void;
  strokeWidth?: number;
  onStrokeWidthChange?: (width: number) => void;
}

export default function ContextualPanel({
  activeTool,
  color,
  onColorChange,
  strokeWidth,
  onStrokeWidthChange,
}: Props) {
  const posRef = useRef<HTMLDivElement>(null);
  const showColors = !!activeTool.takesColor;
  const showStrokeWidths = !!activeTool.takesStrokeWidth;

  // VIEWPORT-PINNED. No scroll listeners — `position: fixed` is the
  // contract. See src/utils/synchrony.ts for the why.
  useProximityDim(posRef, { nearPx: 80, farPx: 280, idleOpacity: 0.25 });

  return (
    <div
      ref={posRef}
      style={{
        ...viewportBottomCenter(80),
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
          className="flex items-center p-2 gap-3 bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl rounded-full text-slate-800"
          style={{ cursor: 'default' }}
        >
          {/* Color swatches */}
          {showColors && <div className="flex items-center gap-1.5 px-1">
            {COLOR_SWATCHES.map((swatch) => {
              const isSelected = color === swatch;
              return (
                <button
                  key={swatch}
                  onClick={() => onColorChange(swatch)}
                  className={`w-6 h-6 rounded-full transition-all duration-150 border ${
                    isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-1 scale-110'
                      : 'hover:scale-110'
                  }`}
                  style={{
                    backgroundColor: swatch,
                    borderColor: swatch === '#ffffff' ? '#d1d5db' : 'transparent',
                  }}
                  title={swatch}
                />
              );
            })}
          </div>}

          {/* Stroke width presets */}
          {showStrokeWidths && onStrokeWidthChange && (
            <>
              <div className="w-px h-6 bg-slate-200/50" />
              <div className="flex items-center gap-2 px-1">
                {STROKE_WIDTHS.map((w) => {
                  const isSelected = strokeWidth === w;
                  // Visual dot size: min 6px, max 18px
                  const dotSize = Math.max(6, Math.min(18, w + 4));
                  return (
                    <button
                      key={w}
                      onClick={() => onStrokeWidthChange(w)}
                      className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 ${
                        isSelected
                          ? 'ring-2 ring-blue-500 ring-offset-1'
                          : 'hover:bg-slate-100/50'
                      }`}
                      title={`${w}px`}
                    >
                      <div
                        className="rounded-full bg-slate-700"
                        style={{ width: dotSize, height: dotSize }}
                      />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

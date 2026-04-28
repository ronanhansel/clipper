import { Minus, Plus } from "lucide-react";

export function FrameZoomBar({ scale, onScaleChange }: { scale: number; onScaleChange: (scale: number) => void }) {
  const percent = Math.round(scale * 100);
  const zoomButtonClass = "grid h-8 w-8 place-items-center rounded-[6px] border border-[#2d313b] bg-[#171920] text-[#f7f7f8] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-[#3b4150] hover:bg-[#20232c]";

  return (
    <div className="absolute bottom-[44px] right-0 z-30 flex w-[266px] items-center gap-2.5 rounded-[9px] border border-[#2d313b] bg-[#12141a] p-2.5 shadow-[0_18px_58px_rgba(0,0,0,0.45)]">
      <strong className="w-[42px] text-[14px] tabular-nums text-[#f7f7f8]">{percent}%</strong>
      <input aria-label="Frame preview zoom" className="h-1.5 min-w-0 flex-1 accent-[#9b9da7] [appearance:none] rounded-full bg-[#2d313b] [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#2d313b] [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#5a606e] [&::-webkit-slider-thumb]:bg-[#a2a7b3] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#2d313b] [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#5a606e] [&::-moz-range-thumb]:bg-[#a2a7b3]" type="range" min={0.25} max={1} step={0.05} value={scale} onChange={(event) => onScaleChange(Number(event.target.value))} />
      <button aria-label="Zoom preview out" className={zoomButtonClass} onClick={() => onScaleChange(scale - 0.05)}><Minus size={18} /></button>
      <button aria-label="Zoom preview in" className={zoomButtonClass} onClick={() => onScaleChange(scale + 0.05)}><Plus size={18} /></button>
    </div>
  );
}

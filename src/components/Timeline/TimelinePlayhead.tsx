interface TimelinePlayheadProps {
  positionPx: number;
}

/** Pionowa linia bieżącej pozycji playhead */
export function TimelinePlayhead({ positionPx }: TimelinePlayheadProps) {
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
      style={{ left: `${positionPx}px` }}
    >
      {/* Trójkąt na górze */}
      <div
        className="absolute -top-1 -translate-x-1/2 w-0 h-0"
        style={{
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '6px solid #ef4444',
        }}
      />
    </div>
  );
}

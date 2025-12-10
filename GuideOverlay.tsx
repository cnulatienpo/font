type Props = {
  baseline: number;
  capHeight: number;
  xHeight: number;
  ascender: number;
  descender: number;
  meanline: number;
  centerline: number;
  emTop: number;
  emBottom: number;
};

function Guide({ position, color }: { position: number; color: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: position,
        left: 0,
        right: 0,
        height: 1,
        background: color,
        pointerEvents: "none",
        opacity: 0.8,
      }}
    />
  );
}

export default function GuideOverlay({
  baseline,
  capHeight,
  xHeight,
  ascender,
  descender,
  meanline,
  centerline,
  emTop,
  emBottom,
}: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <Guide position={emTop} color="white" />
      <Guide position={ascender} color="cyan" />
      <Guide position={capHeight} color="blue" />
      <Guide position={xHeight} color="purple" />
      <Guide position={meanline} color="orange" />
      <Guide position={centerline} color="gray" />
      <Guide position={baseline} color="red" />
      <Guide position={descender} color="green" />
      <Guide position={emBottom} color="white" />
    </div>
  );
}

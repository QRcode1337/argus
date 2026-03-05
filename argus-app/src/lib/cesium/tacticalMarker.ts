type TacticalMarkerPalette = {
  fill: string;
  glow: string;
  stroke: string;
};

const iconCache = new Map<string, string>();

const sanitize = (value: string): string => value.replace(/"/g, "");

export function createTacticalMarkerSvg(palette: TacticalMarkerPalette): string {
  const key = `${palette.fill}|${palette.glow}|${palette.stroke}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const fill = sanitize(palette.fill);
  const glow = sanitize(palette.glow);
  const stroke = sanitize(palette.stroke);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <defs>
      <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="1.35" result="blur"/>
      </filter>
    </defs>
    <circle cx="14" cy="14" r="10.2" fill="none" stroke="${stroke}" stroke-opacity="0.55" stroke-width="1.2"/>
    <circle cx="14" cy="14" r="7.2" fill="${fill}" fill-opacity="0.18"/>
    <circle cx="14" cy="14" r="5.1" fill="${glow}" fill-opacity="0.68" filter="url(#g)"/>
    <path d="M14 5.3L16.3 11.7L22.7 14L16.3 16.3L14 22.7L11.7 16.3L5.3 14L11.7 11.7Z"
      fill="${fill}" stroke="${stroke}" stroke-width="0.8"/>
    <circle cx="14" cy="14" r="1.7" fill="${stroke}" />
  </svg>`;

  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  iconCache.set(key, encoded);
  return encoded;
}

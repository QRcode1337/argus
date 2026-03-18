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

export function createAirplaneSvg(palette: TacticalMarkerPalette): string {
  const key = `plane:${palette.fill}|${palette.glow}|${palette.stroke}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const fill = sanitize(palette.fill);
  const glow = sanitize(palette.glow);
  const stroke = sanitize(palette.stroke);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
    <defs>
      <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.9" result="blur"/>
      </filter>
    </defs>
    <path d="M12 2.8c.7 0 1.2.5 1.2 1.2v4.5l4.8 2.2c.5.2.8.7.8 1.2 0 .8-.7 1.4-1.5 1.2l-4.1-.8v3.6l2.1 1.5c.4.3.6.7.6 1.2 0 .9-.9 1.5-1.7 1.2L12 18.8l-2.2 1.2c-.8.3-1.7-.3-1.7-1.2 0-.5.2-.9.6-1.2l2.1-1.5v-3.6l-4.1.8c-.8.2-1.5-.4-1.5-1.2 0-.5.3-1 .8-1.2l4.8-2.2V4c0-.7.5-1.2 1.2-1.2Z"
      fill="${fill}" fill-opacity="0.22" stroke="${stroke}" stroke-width="0.7" />
    <path d="M12 3.7c.3 0 .6.2.6.5v4.8l5.1 2.3c.3.1.5.4.5.7 0 .4-.4.7-.8.6l-4.8-1v4.1l2.4 1.8c.2.2.3.4.3.7 0 .5-.5.8-.9.6L12 17.9l-2.4 1.3c-.4.2-.9-.1-.9-.6 0-.3.1-.5.3-.7l2.4-1.8v-4.1l-4.8 1c-.4.1-.8-.2-.8-.6 0-.3.2-.6.5-.7l5.1-2.3V4.2c0-.3.3-.5.6-.5Z"
      fill="${fill}" />
    <path d="M12 4.4v13.7" stroke="${stroke}" stroke-width="0.75" stroke-linecap="round" opacity="0.65" />
    <path d="M8.7 17.8 12 16.1l3.3 1.7" fill="none" stroke="${stroke}" stroke-width="0.75" stroke-linecap="round" stroke-linejoin="round" opacity="0.65" />
    <circle cx="12" cy="12" r="1.1" fill="${glow}" filter="url(#g)" />
  </svg>`;

  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  iconCache.set(key, encoded);
  return encoded;
}

export function createIssMarkerSvg(palette: TacticalMarkerPalette): string {
  const key = `iss:${palette.fill}|${palette.glow}|${palette.stroke}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const fill = sanitize(palette.fill);
  const glow = sanitize(palette.glow);
  const stroke = sanitize(palette.stroke);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <defs>
      <filter id="g" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="blur"/>
      </filter>
    </defs>
    <circle cx="24" cy="24" r="22" fill="none" stroke="${fill}" stroke-width="0.8" stroke-opacity="0.35" stroke-dasharray="3 3"/>
    <circle cx="24" cy="24" r="10" fill="${glow}" fill-opacity="0.25" filter="url(#g)"/>
    <!-- Solar panel left -->
    <rect x="3" y="18" width="14" height="12" rx="1.5" fill="${fill}" fill-opacity="0.55" stroke="${stroke}" stroke-width="0.8"/>
    <line x1="10" y1="18" x2="10" y2="30" stroke="${stroke}" stroke-width="0.5" opacity="0.6"/>
    <line x1="3" y1="24" x2="17" y2="24" stroke="${stroke}" stroke-width="0.5" opacity="0.6"/>
    <!-- Solar panel right -->
    <rect x="31" y="18" width="14" height="12" rx="1.5" fill="${fill}" fill-opacity="0.55" stroke="${stroke}" stroke-width="0.8"/>
    <line x1="38" y1="18" x2="38" y2="30" stroke="${stroke}" stroke-width="0.5" opacity="0.6"/>
    <line x1="31" y1="24" x2="45" y2="24" stroke="${stroke}" stroke-width="0.5" opacity="0.6"/>
    <!-- Truss -->
    <rect x="17" y="22.5" width="14" height="3" rx="1" fill="${fill}" fill-opacity="0.7" stroke="${stroke}" stroke-width="0.7"/>
    <!-- Modules -->
    <rect x="20" y="16" width="8" height="16" rx="2.5" fill="${fill}" fill-opacity="0.8" stroke="${stroke}" stroke-width="0.8"/>
    <rect x="22" y="13" width="4" height="22" rx="1.5" fill="${glow}" fill-opacity="0.45" stroke="${stroke}" stroke-width="0.6"/>
    <!-- Center glow -->
    <circle cx="24" cy="24" r="3" fill="${glow}" fill-opacity="0.9" filter="url(#g)"/>
    <circle cx="24" cy="24" r="1.5" fill="white" fill-opacity="0.85"/>
  </svg>`;

  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  iconCache.set(key, encoded);
  return encoded;
}

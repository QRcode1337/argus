# Camera System Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace fake scenic cameras with real public webcams, add a hybrid camera player (YouTube embed / HLS.js / snapshot auto-refresh), and deliver quick wins (CCTV default on, fly-to-camera, feed error dots).

**Architecture:** Extend the CctvCamera type with `feedType` and `streamUrl`. Create a new `CameraPlayer` component that renders the right player based on feed type. Replace hardcoded Unsplash scenic cameras with verified YouTube Live embed IDs. Wire fly-to-camera behavior into entity click handler.

**Tech Stack:** Next.js 16, React 19, CesiumJS, Zustand, hls.js, TypeScript, Tailwind CSS v4

---

### Task 1: Extend CctvCamera Type

**Files:**
- Modify: `argus-app/src/types/intel.ts:123-129`

**Step 1: Add feedType and streamUrl to CctvCamera**

In `argus-app/src/types/intel.ts`, replace the existing `CctvCamera` interface:

```typescript
export type CameraFeedType = "embed" | "hls" | "snapshot";

export interface CctvCamera {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  imageUrl: string;
  feedType: CameraFeedType;
  streamUrl?: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in cctv.ts and cctvLayer.ts (they don't set feedType yet). That's expected — we fix them next.

**Step 3: Commit**

```bash
git add argus-app/src/types/intel.ts
git commit -m "feat(types): add feedType and streamUrl to CctvCamera"
```

---

### Task 2: Replace Fake Scenic Cameras with Real Public Webcams

**Files:**
- Modify: `argus-app/src/lib/ingest/cctv.ts`

**Step 1: Replace SCENIC_CAMERAS array and add feedType to TFL parser**

Replace the entire contents of `argus-app/src/lib/ingest/cctv.ts`:

```typescript
import type { CctvCamera } from "@/types/intel";

const SCENIC_CAMERAS: CctvCamera[] = [
  {
    id: "scenic-shibuya",
    name: "Shibuya Crossing (Live)",
    longitude: 139.7005,
    latitude: 35.6595,
    imageUrl: "https://img.youtube.com/vi/dfVK7ld38Ys/hqdefault.jpg",
    feedType: "embed",
    streamUrl: "https://www.youtube.com/embed/dfVK7ld38Ys?autoplay=1&mute=1&rel=0",
  },
  {
    id: "scenic-times-square",
    name: "Times Square (Live)",
    longitude: -73.9851,
    latitude: 40.758,
    imageUrl: "https://img.youtube.com/vi/rnXIjl_Rzy4/hqdefault.jpg",
    feedType: "embed",
    streamUrl: "https://www.youtube.com/embed/rnXIjl_Rzy4?autoplay=1&mute=1&rel=0",
  },
  {
    id: "scenic-venice",
    name: "Venice Grand Canal (Live)",
    longitude: 12.3155,
    latitude: 45.4408,
    imageUrl: "https://img.youtube.com/vi/P6JA_YjHMZs/hqdefault.jpg",
    feedType: "embed",
    streamUrl: "https://www.youtube.com/embed/P6JA_YjHMZs?autoplay=1&mute=1&rel=0",
  },
  {
    id: "scenic-fuji",
    name: "Mount Fuji (Live)",
    longitude: 138.7274,
    latitude: 35.3606,
    imageUrl: "https://img.youtube.com/vi/Sv9hcJ3k5h4/hqdefault.jpg",
    feedType: "embed",
    streamUrl: "https://www.youtube.com/embed/Sv9hcJ3k5h4?autoplay=1&mute=1&rel=0",
  },
  {
    id: "scenic-jackson-hole",
    name: "Jackson Hole Town Square (Live)",
    longitude: -110.7624,
    latitude: 43.4799,
    imageUrl: "https://img.youtube.com/vi/1EiC9bvVGnk/hqdefault.jpg",
    feedType: "embed",
    streamUrl: "https://www.youtube.com/embed/1EiC9bvVGnk?autoplay=1&mute=1&rel=0",
  },
  {
    id: "scenic-abbey-road",
    name: "Abbey Road Crossing (Live)",
    longitude: -0.1782,
    latitude: 51.5320,
    imageUrl: "https://img.youtube.com/vi/dEkUq4jDHn8/hqdefault.jpg",
    feedType: "embed",
    streamUrl: "https://www.abbeyroad.com/crossing",
  },
  {
    id: "scenic-banff",
    name: "Banff Bow Valley",
    longitude: -115.5564,
    latitude: 51.4968,
    imageUrl: "https://www.banffjaspercollection.com/assets/Webcams/bow-valley.jpg",
    feedType: "snapshot",
  },
  {
    id: "scenic-yellowstone",
    name: "Yellowstone Old Faithful",
    longitude: -110.8281,
    latitude: 44.4605,
    imageUrl: "https://www.nps.gov/webcams-yell/oldfaithful.jpg",
    feedType: "snapshot",
  },
];

type TflAdditionalProperty = {
  key?: string;
  value?: string;
};

type TflCamera = {
  id: string;
  commonName: string;
  lat?: number;
  lon?: number;
  additionalProperties?: TflAdditionalProperty[];
};

type TflResponse = {
  places?: TflCamera[];
};

const findImageUrl = (camera: TflCamera): string | null => {
  const pairs = camera.additionalProperties ?? [];
  for (const pair of pairs) {
    if (pair.key?.toLowerCase() === "imageurl" && pair.value) {
      return pair.value;
    }
  }
  return null;
};

export async function fetchCctvCameras(endpoint: string): Promise<CctvCamera[]> {
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`CCTV HTTP ${response.status}`);
  }

  const data = (await response.json()) as TflResponse;
  const places = data.places ?? [];

  const tflCameras: CctvCamera[] = places
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lon))
    .map((item) => ({
      id: item.id,
      name: item.commonName,
      longitude: item.lon as number,
      latitude: item.lat as number,
      imageUrl: findImageUrl(item) ?? "/camera-placeholder.svg",
      feedType: "snapshot" as const,
    }));

  return [...SCENIC_CAMERAS, ...tflCameras];
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -20`
Expected: Errors only in cctvLayer.ts (needs feedType in entity properties). cctv.ts should be clean.

**Step 3: Commit**

```bash
git add argus-app/src/lib/ingest/cctv.ts
git commit -m "feat(cctv): replace fake scenic cameras with verified live webcam sources"
```

---

### Task 3: Pass feedType/streamUrl Through CctvLayer Entity Properties

**Files:**
- Modify: `argus-app/src/lib/cesium/layers/cctvLayer.ts:54-85`

**Step 1: Add feedType and streamUrl to entity properties bag**

In the `upsertCameras` method, update the entity creation block. Find the `this.viewer.entities.add({` call and update the `properties` object:

```typescript
properties: {
  kind: "cctv",
  imageUrl: camera.imageUrl,
  name: camera.name,
  feedType: camera.feedType,
  streamUrl: camera.streamUrl ?? null,
},
```

**Step 2: Verify TypeScript compiles cleanly**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -10`
Expected: Clean compilation (0 errors).

**Step 3: Commit**

```bash
git add argus-app/src/lib/cesium/layers/cctvLayer.ts
git commit -m "feat(cctvLayer): pass feedType and streamUrl to entity properties"
```

---

### Task 4: Install hls.js Dependency

**Files:**
- Modify: `argus-app/package.json`

**Step 1: Install hls.js**

Run: `cd argus-app && npm install hls.js`

**Step 2: Verify install succeeded**

Run: `cd argus-app && node -e "require('hls.js'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add argus-app/package.json argus-app/package-lock.json
git commit -m "deps: add hls.js for live camera stream playback"
```

---

### Task 5: Create CameraPlayer Component

**Files:**
- Create: `argus-app/src/components/CameraPlayer.tsx`

**Step 1: Create the smart camera player**

Create `argus-app/src/components/CameraPlayer.tsx`:

```typescript
"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

type CameraPlayerProps = {
  feedType: "embed" | "hls" | "snapshot";
  imageUrl: string;
  streamUrl?: string;
  name: string;
};

function EmbedPlayer({ streamUrl, name }: { streamUrl: string; name: string }) {
  return (
    <iframe
      src={streamUrl}
      title={name}
      className="h-48 w-full rounded border border-[#284f63]"
      allow="autoplay; encrypted-media"
      allowFullScreen
    />
  );
}

function HlsPlayer({ streamUrl, name }: { streamUrl: string; name: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {});
      });
      hlsRef.current = hls;
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      void video.play().catch(() => {});
    }
  }, [streamUrl]);

  return (
    <video
      ref={videoRef}
      className="h-48 w-full rounded border border-[#284f63] bg-black object-cover"
      muted
      playsInline
      aria-label={name}
    />
  );
}

function SnapshotPlayer({ imageUrl, name }: { imageUrl: string; name: string }) {
  const [src, setSrc] = useState(imageUrl);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const separator = imageUrl.includes("?") ? "&" : "?";
      const next = `${imageUrl}${separator}_t=${Date.now()}`;
      setFade(true);
      const timeout = setTimeout(() => {
        setSrc(next);
        setFade(false);
      }, 300);
      return () => clearTimeout(timeout);
    }, 5000);
    return () => clearInterval(interval);
  }, [imageUrl]);

  return (
    <img
      src={src}
      alt={name}
      className={`h-48 w-full rounded border border-[#284f63] object-cover transition-opacity duration-300 ${fade ? "opacity-60" : "opacity-100"}`}
    />
  );
}

export function CameraPlayer({ feedType, imageUrl, streamUrl, name }: CameraPlayerProps) {
  if (feedType === "embed" && streamUrl) {
    return <EmbedPlayer streamUrl={streamUrl} name={name} />;
  }

  if (feedType === "hls" && streamUrl) {
    return <HlsPlayer streamUrl={streamUrl} name={name} />;
  }

  return <SnapshotPlayer imageUrl={imageUrl} name={name} />;
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -10`
Expected: Clean.

**Step 3: Commit**

```bash
git add argus-app/src/components/CameraPlayer.tsx
git commit -m "feat: add CameraPlayer component with embed/hls/snapshot support"
```

---

### Task 6: Integrate CameraPlayer into Intel Panel + Fly-To on CCTV Click

**Files:**
- Modify: `argus-app/src/types/intel.ts:138-146` (SelectedIntel)
- Modify: `argus-app/src/components/CesiumGlobe.tsx` (buildSelectedIntel + click handler)
- Modify: `argus-app/src/components/HudOverlay.tsx` (intel panel render)

**Step 1: Add feedType/streamUrl to SelectedIntel**

In `argus-app/src/types/intel.ts`, update SelectedIntel:

```typescript
export interface SelectedIntel {
  id: string;
  name: string;
  kind: string;
  importance: IntelImportance;
  quickFacts: IntelDatum[];
  fullFacts: IntelDatum[];
  imageUrl?: string;
  feedType?: CameraFeedType;
  streamUrl?: string;
}
```

**Step 2: Update buildSelectedIntel in CesiumGlobe.tsx**

In `argus-app/src/components/CesiumGlobe.tsx`, in the `buildSelectedIntel` function, update the return object (around line 217-226) to include:

```typescript
return {
  id: entity.id,
  name,
  kind,
  importance: classifyImportance(kind, props),
  quickFacts,
  fullFacts,
  imageUrl: typeof props.imageUrl === "string" ? props.imageUrl : undefined,
  feedType:
    typeof props.feedType === "string" &&
    (props.feedType === "embed" || props.feedType === "hls" || props.feedType === "snapshot")
      ? props.feedType
      : undefined,
  streamUrl: typeof props.streamUrl === "string" ? props.streamUrl : undefined,
};
```

**Step 3: Add fly-to-camera on CCTV entity click**

In `CesiumGlobe.tsx`, in the LEFT_CLICK handler (around line 383-392), after `setSelectedIntel(intel)`, add fly-to logic:

```typescript
setSelectedIntel(intel);
setShowFullIntel(intel.importance === "important");

if (intel.kind === "cctv" && position) {
  const carto = Cartographic.fromCartesian(position);
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      CesiumMath.toDegrees(carto.longitude),
      CesiumMath.toDegrees(carto.latitude),
      1500,
    ),
    duration: 1.0,
  });
}
```

Note: `position` is `picked.id.position?.getValue(at)` — you need to capture it before the handler. The entity is `picked.id`. Add this inside the handler:

```typescript
const clickedEntity = picked.id;
const intel = buildSelectedIntel(clickedEntity);
if (!intel) {
  setSelectedIntel(null);
  setShowFullIntel(false);
  return;
}

setSelectedIntel(intel);
setShowFullIntel(intel.importance === "important");

if (intel.kind === "cctv") {
  const at = JulianDate.now();
  const position = clickedEntity.position?.getValue(at);
  if (position) {
    const carto = Cartographic.fromCartesian(position);
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        CesiumMath.toDegrees(carto.longitude),
        CesiumMath.toDegrees(carto.latitude),
        1500,
      ),
      duration: 1.0,
    });
  }
}
```

**Step 4: Replace static image with CameraPlayer in HudOverlay**

In `argus-app/src/components/HudOverlay.tsx`:

Add import at top:
```typescript
import { CameraPlayer } from "./CameraPlayer";
```

Replace the `selectedIntel.imageUrl && (...)` block (around lines 248-257) with:

```typescript
{selectedIntel.feedType ? (
  <div className="mt-2">
    <CameraPlayer
      feedType={selectedIntel.feedType}
      imageUrl={selectedIntel.imageUrl ?? ""}
      streamUrl={selectedIntel.streamUrl}
      name={selectedIntel.name}
    />
  </div>
) : selectedIntel.imageUrl ? (
  <img
    src={selectedIntel.imageUrl}
    alt={selectedIntel.name}
    className="mt-2 h-32 w-full rounded border border-[#284f63] object-cover"
  />
) : null}
```

**Step 5: Verify TypeScript compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -10`
Expected: Clean.

**Step 6: Commit**

```bash
git add argus-app/src/types/intel.ts argus-app/src/components/CesiumGlobe.tsx argus-app/src/components/HudOverlay.tsx
git commit -m "feat: integrate CameraPlayer into intel panel with fly-to on CCTV click"
```

---

### Task 7: Quick Wins — CCTV Default On + Feed Error Dots

**Files:**
- Modify: `argus-app/src/store/useArgusStore.ts:69` (cctv default)
- Modify: `argus-app/src/components/HudOverlay.tsx` (error dots)

**Step 1: Set CCTV layer default to true**

In `argus-app/src/store/useArgusStore.ts`, change line 69:

```typescript
cctv: true,
```

**Step 2: Add feed error dots to layer toggles in HudOverlay**

In `argus-app/src/components/HudOverlay.tsx`, create a feed key mapping and error dot. Inside the layer toggle button render (the `layerDefs.map` block), add an error indicator.

First, add a feed-key lookup near the top of the HudOverlay function body (after the destructuring):

```typescript
const feedKeyForLayer: Record<string, FeedKey> = {
  flights: "opensky",
  military: "adsb",
  satellites: "celestrak",
  seismic: "usgs",
  cctv: "tfl",
};
```

Add the import of `FeedKey` to the existing import from `@/types/intel`.

Then, inside the layer button, after the feed label `<div>`, add the error dot:

```typescript
<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#6c8ea2]">
  {layer.feed}
  {feedHealth[feedKeyForLayer[layer.key]]?.status === "error" && (
    <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-red-500" title="Feed error" />
  )}
</div>
```

**Step 3: Verify TypeScript compiles**

Run: `cd argus-app && npx tsc --noEmit 2>&1 | head -10`
Expected: Clean.

**Step 4: Commit**

```bash
git add argus-app/src/store/useArgusStore.ts argus-app/src/components/HudOverlay.tsx
git commit -m "feat: CCTV default on + feed error dot indicators on layer toggles"
```

---

### Task 8: Build Verification

**Step 1: Run full production build**

Run: `cd argus-app && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

**Step 2: If build fails, fix any issues and re-run**

Common issues:
- ESLint `no-img-element` warning on existing code — already has eslint-disable comment
- hls.js SSR issue — CameraPlayer is `"use client"` so should be fine
- Unused imports — clean up

**Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build issues from camera system overhaul"
```

import { UrlTemplateImageryProvider, type Viewer, type ImageryLayer } from "cesium";

interface RainViewerResponse {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: { time: number; path: string }[];
    nowcast: { time: number; path: string }[];
  };
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export class WeatherLayer {
  private viewer: Viewer;
  private layer: ImageryLayer | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  async init(): Promise<void> {
    await this.loadLatestRadar();

    this.refreshInterval = setInterval(() => {
      void this.refresh();
    }, REFRESH_INTERVAL_MS);
  }

  private async loadLatestRadar(): Promise<void> {
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!res.ok) return;

      const data = (await res.json()) as RainViewerResponse;
      const past = data.radar.past;
      if (!past || past.length === 0) return;

      const latest = past[past.length - 1];
      const timestamp = latest.time;

      // Remove old layer if present
      if (this.layer) {
        this.viewer.imageryLayers.remove(this.layer, true);
        this.layer = null;
      }

      const provider = new UrlTemplateImageryProvider({
        url: `https://tilecache.rainviewer.com/v2/radar/${timestamp}/{z}/{x}/{y}/2/1_1.png`,
        credit: "RainViewer",
        maximumLevel: 10,
      });

      this.layer = this.viewer.imageryLayers.addImageryProvider(provider);
      this.layer.alpha = 0.6;
    } catch {
      // Silently fail — weather overlay is non-critical
    }
  }

  setVisible(visible: boolean): void {
    if (this.layer) {
      this.layer.show = visible;
    }
  }

  async refresh(): Promise<void> {
    await this.loadLatestRadar();
  }

  destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.layer) {
      this.viewer.imageryLayers.remove(this.layer, true);
      this.layer = null;
    }
  }
}

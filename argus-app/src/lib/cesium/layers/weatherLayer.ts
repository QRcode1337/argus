import { type Viewer } from "cesium";

/**
 * RainViewer radar is intentionally DISABLED.
 *
 * RainViewer's tile server returns a placeholder PNG with "ZOOM LEVEL NOT SUPPORTED"
 * baked into the image (served as HTTP 200) for any out-of-range tile. Cesium paints
 * that image onto the globe like any normal tile, so a single placeholder tile covers
 * the entire view. Because the text is image pixels — not a DOM node or a Cesium error
 * panel — it cannot be suppressed client-side. The only reliable way to guarantee the
 * overlay never appears is to never request RainViewer tiles.
 *
 * This is a no-op shell that preserves the original interface
 * (init / setVisible / refresh / destroy) so existing call sites and refs keep working.
 */
export class WeatherLayer {
  constructor(_viewer: Viewer) {
    void _viewer;
  }

  async init(): Promise<void> {
    /* no-op — radar disabled */
  }

  setVisible(_visible: boolean): void {
    void _visible; // no-op — radar disabled
  }

  async refresh(): Promise<void> {
    /* no-op — radar disabled */
  }

  destroy(): void {
    /* no-op — nothing to tear down */
  }
}

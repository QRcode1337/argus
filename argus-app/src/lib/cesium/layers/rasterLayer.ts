import {
  ImageryLayer,
  UrlTemplateImageryProvider,
  Viewer,
} from "cesium";

/**
 * Manages a single Cesium ImageryLayer backed by a TiTiler COG tile URL.
 * Used in Analytics mode to overlay NOAA GFS weather raster data on the globe.
 */
export class RasterLayer {
  private viewer: Viewer;
  private layer: ImageryLayer | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /**
   * Load a tile URL as a Cesium ImageryLayer.
   * Replaces any previously loaded layer.
   * @param tileUrl - UrlTemplate string with {z}/{x}/{y} placeholders
   */
  load(tileUrl: string, options?: { maximumLevel?: number }): void {
    this.unload();
    const provider = new UrlTemplateImageryProvider({
      url: tileUrl,
      maximumLevel: options?.maximumLevel,
    });
    this.layer = this.viewer.imageryLayers.addImageryProvider(provider);
    this.layer.alpha = 0.8;
  }

  /** Remove the imagery layer from the viewer. */
  unload(): void {
    if (this.layer) {
      this.viewer.imageryLayers.remove(this.layer, true);
      this.layer = null;
    }
  }

  setVisible(visible: boolean): void {
    if (this.layer) {
      this.layer.show = visible;
    }
  }

  setAlpha(alpha: number): void {
    if (this.layer) {
      this.layer.alpha = alpha;
    }
  }

  get isLoaded(): boolean {
    return this.layer !== null;
  }
}

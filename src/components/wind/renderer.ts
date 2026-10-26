import { MercatorCoordinate, type CanvasSource, type Map as MapLibreMap } from "maplibre-gl";
import { advectWind, sampleWind, windColor, type WindField, type WindPosition } from "@/lib/wind";
import type { WindQuality } from "@/lib/use-wind";

export type WindRenderOptions = {
  paused: boolean;
  shading: boolean;
  opacity: number;
  quality: WindQuality;
};
const SOURCE = "jerebu-wind";
const LAYER = "jerebu-wind-flow";
export const WIND_EXAGGERATION = 6000;
const colors = Array.from({ length: 241 }, (_, i) => windColor(i / 4));
type Particle = WindPosition & { age: number; life: number };

/** CanvasSource keeps the texture geographically registered beneath the region outlines. */
export class WindRenderer {
  readonly canvas = document.createElement("canvas");
  private trails = document.createElement("canvas");
  private shade = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private trailCtx: CanvasRenderingContext2D;
  private field: WindField | null = null;
  private particles: Particle[] = [];
  private frame = 0;
  private lastTime = 0;
  private moving = false;
  private visible = true;
  private lost = false;
  private disposed = false;
  private viewport = { left: 0, right: 1, top: 0, bottom: 1 };
  private frames = 0;
  private segments = 0;
  private mapFrames = 0;
  private motion = { x: 0, y: 0, count: 0, slow: 0, slowCount: 0, fast: 0, fastCount: 0 };
  private measuredAt = 0;
  private randomState = 7241;
  private observer: IntersectionObserver;
  private opts: WindRenderOptions;

  constructor(
    private map: MapLibreMap,
    options: WindRenderOptions,
  ) {
    this.opts = options;
    const ctx = this.canvas.getContext("2d"),
      trails = this.trails.getContext("2d");
    if (!ctx || !trails)
      throw new Error("Wind canvas is unsupported; use Inspect wind for numeric values.");
    this.ctx = ctx;
    this.trailCtx = trails;
    this.canvas.className = "wind-source-canvas";
    this.canvas.hidden = true;
    this.canvas.setAttribute("aria-hidden", "true");
    map.getContainer().append(this.canvas);
    map.on("movestart", this.moveStart);
    map.on("moveend", this.moveEnd);
    map.on("resize", this.resizeEnd);
    map.on("style.load", this.restore);
    map.on("styledata", this.order);
    map.on("render", this.measure);
    map.on("webglcontextlost", this.contextLost);
    map.on("webglcontextrestored", this.contextRestored);
    document.addEventListener("visibilitychange", this.visibility);
    this.observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (!entry) return;
      this.visible = entry.isIntersecting;
      this.resume();
    });
    this.observer.observe(map.getContainer());
    try {
      this.resize();
      if (map.isStyleLoaded()) this.install();
      else map.on("idle", this.initialReady);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }
  private source() {
    return this.map.getSource(SOURCE) as CanvasSource | undefined;
  }
  private hasDimensions() {
    const container = this.map.getContainer();
    return container.clientWidth > 0 && container.clientHeight > 0;
  }
  private random() {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  private geo(x: number, y: number): WindPosition {
    const v = this.viewport;
    const m = new MercatorCoordinate(
      v.left + x * (v.right - v.left),
      v.top + y * (v.bottom - v.top),
    );
    const p = m.toLngLat();
    return { lng: p.lng, lat: p.lat };
  }
  private pixel(p: WindPosition) {
    const m = MercatorCoordinate.fromLngLat([p.lng, p.lat]);
    const v = this.viewport;
    return {
      x: ((m.x - v.left) / (v.right - v.left)) * this.canvas.width,
      y: ((m.y - v.top) / (v.bottom - v.top)) * this.canvas.height,
    };
  }
  private coordinates(): [[number, number], [number, number], [number, number], [number, number]] {
    const nw = this.geo(0, 0),
      se = this.geo(1, 1);
    return [
      [nw.lng, nw.lat],
      [se.lng, nw.lat],
      [se.lng, se.lat],
      [nw.lng, se.lat],
    ];
  }
  private install() {
    if (this.disposed || this.lost || !this.hasDimensions()) return;
    if (!this.map.getSource(SOURCE))
      this.map.addSource(SOURCE, {
        type: "canvas",
        canvas: this.canvas,
        coordinates: this.coordinates(),
        animate: false,
      });
    if (!this.map.getLayer(LAYER))
      this.map.addLayer(
        {
          id: LAYER,
          type: "raster",
          source: SOURCE,
          paint: { "raster-opacity": this.opts.opacity, "raster-fade-duration": 0 },
        },
        this.map.getLayer("geojson-line-regions") ? "geojson-line-regions" : undefined,
      );
    this.order();
  }
  private order = () => {
    const layers = this.map.getStyle()?.layers ?? [];
    const wind = layers.findIndex((l) => l.id === LAYER),
      line = layers.findIndex((l) => l.id === "geojson-line-regions");
    if (wind >= 0 && line >= 0 && wind > line) this.map.moveLayer(LAYER, "geojson-line-regions");
  };
  private resize() {
    if (!this.hasDimensions()) return;
    const container = this.map.getContainer();
    const cap = this.opts.quality === "low" ? 640 : this.opts.quality === "high" ? 1280 : 1024;
    const ratio = Math.min(
      1,
      cap / Math.max(1, container.clientWidth),
      768 / Math.max(1, container.clientHeight),
    );
    this.canvas.width = this.trails.width = Math.max(1, Math.round(container.clientWidth * ratio));
    this.canvas.height = this.trails.height = Math.max(
      1,
      Math.round(container.clientHeight * ratio),
    );
    const nw = MercatorCoordinate.fromLngLat(this.map.unproject([0, 0]));
    const se = MercatorCoordinate.fromLngLat(
      this.map.unproject([container.clientWidth, container.clientHeight]),
    );
    this.viewport = { left: nw.x, right: se.x, top: nw.y, bottom: se.y };
    this.source()?.setCoordinates(this.coordinates());
    this.buildShade();
    this.seed();
  }
  setField(field: WindField | null) {
    this.field = field;
    this.motion = { x: 0, y: 0, count: 0, slow: 0, slowCount: 0, fast: 0, fastCount: 0 };
    this.canvas.dataset.validAt = field?.validAt ?? "";
    this.canvas.dataset.fieldId = field?.id ?? "";
    this.segments = 0;
    this.resizeEnd();
  }
  configure(options: WindRenderOptions) {
    const resize = this.opts.quality !== options.quality;
    const shading = this.opts.shading !== options.shading;
    this.opts = options;
    if (this.map.getLayer(LAYER))
      this.map.setPaintProperty(LAYER, "raster-opacity", options.opacity);
    if (resize) this.resize();
    else if (shading) this.buildShade();
    this.resume();
  }
  private seed() {
    this.trailCtx.clearRect(0, 0, this.trails.width, this.trails.height);
    const count = this.opts.quality === "low" ? 240 : this.opts.quality === "high" ? 1400 : 700;
    this.particles = Array.from({ length: count }, () => this.spawn());
  }
  private spawn(): Particle {
    let p = this.geo(this.random(), this.random());
    for (let tries = 0; tries < 24 && this.field && !sampleWind(this.field, p.lng, p.lat); tries++)
      p = this.geo(this.random(), this.random());
    return { ...p, age: 0, life: 3 + this.random() * 3 };
  }
  private buildShade() {
    this.shade.width = 160;
    this.shade.height = 100;
    const ctx = this.shade.getContext("2d")!;
    if (!this.field || !this.opts.shading) return;
    const image = ctx.createImageData(this.shade.width, this.shade.height);
    for (let y = 0; y < this.shade.height; y++)
      for (let x = 0; x < this.shade.width; x++) {
        const p = this.geo((x + 0.5) / this.shade.width, (y + 0.5) / this.shade.height);
        const v = sampleWind(this.field, p.lng, p.lat);
        if (!v) continue;
        const color = colors[Math.min(240, Math.round(Math.hypot(v.u, v.v) * 3.6 * 4))];
        const i = (y * this.shade.width + x) * 4;
        image.data[i] = parseInt(color.slice(1, 3), 16);
        image.data[i + 1] = parseInt(color.slice(3, 5), 16);
        image.data[i + 2] = parseInt(color.slice(5, 7), 16);
        image.data[i + 3] = 35;
      }
    ctx.putImageData(image, 0, 0);
  }
  private compose() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.opts.shading)
      this.ctx.drawImage(this.shade, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.trails, 0, 0);
  }
  private arrows() {
    this.trailCtx.clearRect(0, 0, this.trails.width, this.trails.height);
    if (this.field)
      for (let y = 35; y < this.canvas.height; y += 65)
        for (let x = 35; x < this.canvas.width; x += 65) {
          const p = this.geo(x / this.canvas.width, y / this.canvas.height);
          const v = sampleWind(this.field, p.lng, p.lat);
          if (!v) continue;
          const speed = Math.hypot(v.u, v.v);
          if (speed === 0) continue;
          const dx = (v.u / speed) * 10,
            dy = (-v.v / speed) * 10;
          const ctx = this.trailCtx;
          ctx.strokeStyle = windColor(speed * 3.6);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.lineTo(x + dx - dx * 0.45 + dy * 0.45, y + dy - dy * 0.45 - dx * 0.45);
          ctx.moveTo(x + dx, y + dy);
          ctx.lineTo(x + dx - dx * 0.45 - dy * 0.45, y + dy - dy * 0.45 + dx * 0.45);
          ctx.stroke();
        }
    this.compose();
    this.snapshot();
  }
  private snapshot() {
    if (this.lost || this.disposed || !this.hasDimensions()) return;
    this.source()?.play();
    this.source()?.pause();
    this.map.triggerRepaint();
  }
  private tick = (now: number) => {
    this.frame = 0;
    if (!this.field || this.disposed) return;
    const dt = this.lastTime ? Math.min(0.1, (now - this.lastTime) / 1000) : 0;
    this.lastTime = now;
    const ctx = this.trailCtx;
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = `rgba(0,0,0,${1 - Math.exp(-dt / 0.65)})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i],
        vector = sampleWind(this.field, p.lng, p.lat);
      const next = vector && advectWind(this.field, p, dt, WIND_EXAGGERATION);
      if (!vector || !next || p.age > p.life) {
        this.particles[i] = this.spawn();
        continue;
      }
      const a = this.pixel(p),
        b = this.pixel(next);
      if (b.x < 0 || b.x > this.canvas.width || b.y < 0 || b.y > this.canvas.height) {
        this.particles[i] = this.spawn();
        continue;
      }
      if (Math.hypot(vector.u, vector.v) > 0 && dt > 0) {
        ctx.strokeStyle =
          colors[Math.min(240, Math.round(Math.hypot(vector.u, vector.v) * 3.6 * 4))];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        this.segments++;
        this.motion.x += b.x - a.x;
        this.motion.y += b.y - a.y;
        this.motion.count++;
        const speedKmh = Math.hypot(vector.u, vector.v) * 3.6,
          distance = Math.hypot(b.x - a.x, b.y - a.y);
        if (speedKmh < 30) {
          this.motion.slow += distance;
          this.motion.slowCount++;
        }
        if (speedKmh > 45) {
          this.motion.fast += distance;
          this.motion.fastCount++;
        }
      }
      p.lng = next.lng;
      p.lat = next.lat;
      p.age += dt;
    }
    this.compose();
    this.frames++;
    if (now - this.measuredAt > 1500) {
      const fps = this.measuredAt ? (this.mapFrames * 1000) / (now - this.measuredAt) : 0;
      Object.assign(this.canvas.dataset, {
        frames: String(this.frames),
        segments: String(this.segments),
        fps: fps.toFixed(1),
        particles: String(this.particles.length),
        running: "true",
        motionX: (this.motion.x / Math.max(1, this.motion.count)).toFixed(4),
        motionY: (this.motion.y / Math.max(1, this.motion.count)).toFixed(4),
        slowStep: (this.motion.slow / Math.max(1, this.motion.slowCount)).toFixed(4),
        fastStep: (this.motion.fast / Math.max(1, this.motion.fastCount)).toFixed(4),
      });
      this.motion = { x: 0, y: 0, count: 0, slow: 0, slowCount: 0, fast: 0, fastCount: 0 };
      if (fps > 0 && fps < 26 && this.particles.length > 180)
        this.particles.length = Math.max(180, Math.floor(this.particles.length * 0.75));
      this.measuredAt = now;
      this.mapFrames = 0;
    }
    this.map.triggerRepaint();
    this.frame = requestAnimationFrame(this.tick);
  };
  private resume() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = 0;
    this.canvas.dataset.running = "false";
    this.canvas.dataset.suspended = !this.field
      ? "no-field"
      : this.moving
        ? "camera"
        : !this.visible || !this.hasDimensions()
          ? "offscreen"
          : document.hidden
            ? "hidden"
            : this.opts.paused
              ? "paused"
              : "";
    if (this.disposed || this.lost || !this.source()) return;
    if (!this.field || this.moving || !this.visible || !this.hasDimensions() || document.hidden) {
      this.source()?.pause();
      return;
    }
    if (this.opts.paused) {
      this.arrows();
      return;
    }
    this.source()?.play();
    this.measuredAt = performance.now();
    this.mapFrames = 0;
    this.frame = requestAnimationFrame(this.tick);
  }
  private moveStart = () => {
    this.moving = true;
    this.resume();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.snapshot();
  };
  private moveEnd = () => {
    this.moving = false;
    this.resetView();
  };
  private resizeEnd = () => {
    this.moving = this.map.isMoving();
    this.resetView();
  };
  private resetView() {
    if (this.disposed || this.lost) return;
    if (!this.hasDimensions()) {
      this.resume();
      return;
    }
    this.resize();
    if (!this.source()) {
      if (this.map.isStyleLoaded()) this.install();
      else this.map.on("idle", this.initialReady);
    }
    this.compose();
    this.snapshot();
    this.resume();
  }
  private measure = () => {
    this.mapFrames++;
  };
  private visibility = () => this.resume();
  private initialReady = () => {
    if (!this.disposed && !this.lost && this.map.isStyleLoaded()) this.restore();
  };
  private restore = () => {
    this.map.off("idle", this.initialReady);
    this.install();
    this.resizeEnd();
  };
  private contextLost = () => {
    this.lost = true;
    cancelAnimationFrame(this.frame);
    this.canvas.dataset.running = "false";
  };
  private contextRestored = () => {
    this.lost = false;
    if (this.map.isStyleLoaded()) this.restore();
  };
  private clearDeferredCleanup = () => {
    this.map.off("style.load", this.removeRestoredSource);
    this.map.off("remove", this.clearDeferredCleanup);
  };
  private removeRestoredSource = () => {
    this.clearDeferredCleanup();
    if (this.source()?.getCanvas() !== this.canvas) return;
    if (this.map.getLayer(LAYER)) this.map.removeLayer(LAYER);
    this.map.removeSource(SOURCE);
  };
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.map.off("movestart", this.moveStart);
    this.map.off("moveend", this.moveEnd);
    this.map.off("resize", this.resizeEnd);
    this.map.off("style.load", this.restore);
    this.map.off("idle", this.initialReady);
    this.map.off("styledata", this.order);
    this.map.off("render", this.measure);
    this.map.off("webglcontextlost", this.contextLost);
    this.map.off("webglcontextrestored", this.contextRestored);
    // MapLibre can restore the saved canvas source after disposal during context loss.
    if (this.lost || (!this.source() && !this.map.isStyleLoaded())) {
      this.map.on("style.load", this.removeRestoredSource);
      this.map.on("remove", this.clearDeferredCleanup);
    }
    if (this.map.getLayer(LAYER)) this.map.removeLayer(LAYER);
    if (this.map.getSource(SOURCE)) this.map.removeSource(SOURCE);
    this.canvas.remove();
    this.canvas.width = this.trails.width = this.shade.width = 1;
    this.particles = [];
  }
}

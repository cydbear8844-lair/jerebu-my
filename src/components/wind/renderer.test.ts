// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { DEMO_CLOCK } from "@/lib/demo-time";
import { createDemoWindField } from "@/lib/wind";
import { WindRenderer, WIND_EXAGGERATION, type WindRenderOptions } from "./renderer";

const SOURCE = "jerebu-wind";
const LAYER = "jerebu-wind-flow";
const options: WindRenderOptions = {
  paused: false,
  shading: false,
  opacity: 0.8,
  quality: "low",
};

class TestMap {
  ready = true;
  listeners = new Map<string, Set<() => void>>();
  sources = new Map<string, ReturnType<TestMap["makeSource"]>>();
  layers = new Map<string, { id: string }>();
  container = document.createElement("div");
  additions = { sources: 0, layers: 0 };
  savedCanvas: HTMLCanvasElement | undefined;

  constructor() {
    Object.defineProperties(this.container, {
      clientWidth: { value: 800, configurable: true },
      clientHeight: { value: 500, configurable: true },
    });
    document.body.append(this.container);
  }
  makeSource(canvas?: HTMLCanvasElement) {
    return { getCanvas: () => canvas, setCoordinates: vi.fn(), play: vi.fn(), pause: vi.fn() };
  }
  on(name: string, listener: () => void) {
    const handlers = this.listeners.get(name) ?? new Set();
    handlers.add(listener);
    this.listeners.set(name, handlers);
  }
  off(name: string, listener: () => void) {
    this.listeners.get(name)?.delete(listener);
  }
  fire(name: string) {
    for (const listener of [...(this.listeners.get(name) ?? [])]) listener();
  }
  loseContext() {
    this.savedCanvas = this.getSource(SOURCE)?.getCanvas();
    this.ready = false;
    this.sources.clear();
    this.layers.clear();
    this.fire("webglcontextlost");
  }
  loadStyle(restoreSavedWind = false) {
    this.ready = true;
    if (restoreSavedWind) {
      this.sources.set(SOURCE, this.makeSource(this.savedCanvas));
      this.layers.set(LAYER, { id: LAYER });
    }
    this.fire("style.load");
  }
  isStyleLoaded = () => this.ready;
  getContainer = () => this.container;
  getSource = (id: string) => this.sources.get(id);
  getLayer = (id: string) => this.layers.get(id);
  getStyle = () => ({ layers: [...this.layers.values()] });
  isMoving = () => false;
  unproject = ([x, y]: [number, number]) => ({ lng: 100 + x / 100, lat: 7 - y / 100 });
  addSource(id: string, spec: { canvas: HTMLCanvasElement }) {
    if (!this.ready) throw new Error("Style is not done loading.");
    if (this.sources.has(id)) throw new Error("Duplicate source");
    this.additions.sources++;
    this.sources.set(id, this.makeSource(spec.canvas));
  }
  addLayer(layer: { id: string }) {
    if (!this.ready) throw new Error("Style is not done loading.");
    if (this.layers.has(layer.id)) throw new Error("Duplicate layer");
    this.additions.layers++;
    this.layers.set(layer.id, layer);
  }
  moveLayer = vi.fn();
  triggerRepaint = vi.fn();
  setPaintProperty = vi.fn();
  removeLayer = (id: string) => this.layers.delete(id);
  removeSource = (id: string) => this.sources.delete(id);
}

let renderer: WindRenderer;
let map: TestMap;
let frameId: number;
let frames: Map<number, FrameRequestCallback>;
let stroke: ReturnType<typeof vi.fn>;
let disconnect: ReturnType<typeof vi.fn>;
let intersect: (entries: { isIntersecting: boolean }[]) => void;

function start(paused = false) {
  renderer = new WindRenderer(map as unknown as MapLibreMap, { ...options, paused });
  renderer.setField(createDemoWindField(DEMO_CLOCK, "southwest"));
  return renderer;
}

beforeEach(() => {
  frameId = 0;
  frames = new Map();
  stroke = vi.fn();
  disconnect = vi.fn();
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke,
    fillRect: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof intersect) {
        intersect = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  map = new TestMap();
});

afterEach(() => {
  renderer?.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("wind context recovery", () => {
  it("uses the latest visibility entry when resize queues multiple observations", () => {
    start();
    intersect([{ isIntersecting: false }, { isIntersecting: true }]);
    expect(frames.size).toBe(1);
    intersect([{ isIntersecting: true }, { isIntersecting: false }]);
    expect(frames.size).toBe(0);
  });
  it("defers hidden-map installation and starts when its dimensions become usable", () => {
    Object.defineProperty(map.container, "clientWidth", { value: 0 });
    Object.defineProperty(map.container, "clientHeight", { value: 0 });
    start();
    expect(map.sources.size).toBe(0);
    expect(frames.size).toBe(0);
    Object.defineProperty(map.container, "clientWidth", { value: 800 });
    Object.defineProperty(map.container, "clientHeight", { value: 500 });
    map.fire("resize");
    expect(map.getSource(SOURCE)?.getCanvas()).toBe(renderer.canvas);
    expect(frames.size).toBe(1);
  });

  it("never updates canvas coordinates from a zero-size hidden map", () => {
    start();
    const source = map.getSource(SOURCE)!;
    source.setCoordinates.mockClear();
    Object.defineProperty(map.container, "clientWidth", { value: 0 });
    Object.defineProperty(map.container, "clientHeight", { value: 0 });
    map.fire("resize");
    expect(source.setCoordinates).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(source.pause).toHaveBeenCalled();
  });

  it.each([30, 60, 120])(
    "integrates a variable field against an analytic solution at %sHz",
    (hz) => {
      start();
      const field = createDemoWindField(DEMO_CLOCK)!;
      Object.assign(field, {
        width: 2,
        height: 2,
        bounds: { west: 100, east: 108, south: 2, north: 7 },
        u: [0, 16, 0, 16],
        v: [0, 0, 0, 0],
        valid: [true, true, true, true],
      });
      renderer.setField(field);
      const tracked = renderer as unknown as {
        particles: { lng: number; lat: number; age: number; life: number }[];
      };
      tracked.particles = [{ lng: 105, lat: 4, age: 0, life: 10 }];
      const runFrame = (at: number) => {
        expect(frames.size).toBe(1);
        const callback = [...frames.values()][0];
        frames.clear();
        callback(at);
      };
      runFrame(1000);
      for (let step = 1; step <= hz; step++) runFrame(1000 + (step * 1000) / hz);
      const metresPerDegree = 111_320 * Math.cos((4 * Math.PI) / 180);
      const expectedLng = 100 + 5 * Math.exp((2 * WIND_EXAGGERATION) / metresPerDegree);
      const errorMetres = Math.abs(tracked.particles[0].lng - expectedLng) * metresPerDegree;
      expect(errorMetres).toBeLessThan(220);
      expect(tracked.particles[0].lat).toBeCloseTo(4, 10);
      expect(tracked.particles[0].age).toBeCloseTo(1, 10);
      expect(stroke).toHaveBeenCalled();
    },
  );

  it("starts after existing sources finish even when no new style.load occurs", () => {
    map.ready = false;
    start();
    expect(map.sources.size).toBe(0);
    map.ready = true;
    map.fire("idle");
    expect(map.getSource(SOURCE)?.getCanvas()).toBe(renderer.canvas);
    expect(frames.size).toBe(1);
    expect(map.listeners.get("idle")?.size ?? 0).toBe(0);
  });

  it.each([false, true])(
    "can enable wind before restored style readiness (paused=%s)",
    (paused) => {
      start();
      map.loseContext();
      renderer.destroy();
      expect(() => start(paused)).not.toThrow();
      expect(map.sources.size).toBe(0);
      expect(frames.size).toBe(0);
      map.fire("webglcontextrestored");
      map.loadStyle(true);
      expect(map.getSource(SOURCE)?.getCanvas()).toBe(renderer.canvas);
      expect(map.layers.size).toBe(1);
      expect(frames.size).toBe(paused ? 0 : 1);
      expect(renderer.canvas.dataset.validAt).toBe(DEMO_CLOCK);
      expect(map.container.querySelectorAll(".wind-source-canvas")).toHaveLength(1);
    },
  );

  it("can dispose a renderer enabled before style readiness without resurrecting it", () => {
    map.ready = false;
    expect(() => start()).not.toThrow();
    renderer.destroy();
    map.loadStyle();
    expect(map.sources.size).toBe(0);
    expect(map.layers.size).toBe(0);
    expect(frames.size).toBe(0);
    for (const listeners of map.listeners.values()) expect(listeners.size).toBe(0);
  });

  it("waits for style.load after context restoration before reinstalling and resuming", () => {
    start();
    const metadata = { ...renderer.canvas.dataset };
    expect(frames.size).toBe(1);
    map.loseContext();
    expect(frames.size).toBe(0);

    expect(() => map.fire("webglcontextrestored")).not.toThrow();
    expect(map.additions).toEqual({ sources: 1, layers: 1 });
    expect(frames.size).toBe(0);
    map.loadStyle();

    expect(map.additions).toEqual({ sources: 2, layers: 2 });
    expect(frames.size).toBe(1);
    expect(renderer.canvas.dataset.fieldId).toBe(metadata.fieldId);
    expect(renderer.canvas.dataset.validAt).toBe(metadata.validAt);
    expect(map.getSource(SOURCE)?.play).toHaveBeenCalled();
    expect(map.container.querySelectorAll(".wind-source-canvas")).toHaveLength(1);
  });

  it("recovers immediately when the replacement style is already ready", () => {
    start();
    map.loseContext();
    map.ready = true;
    map.fire("webglcontextrestored");
    expect(map.additions).toEqual({ sources: 2, layers: 2 });
    expect(frames.size).toBe(1);
    map.fire("style.load");
    expect(map.additions).toEqual({ sources: 2, layers: 2 });
    expect(frames.size).toBe(1);
  });

  it("retains static arrows and the paused flag through delayed restoration", () => {
    start(true);
    expect(stroke).toHaveBeenCalled();
    map.loseContext();
    stroke.mockClear();
    expect(() => map.fire("webglcontextrestored")).not.toThrow();
    expect(stroke).not.toHaveBeenCalled();
    map.loadStyle();
    expect(stroke).toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(renderer.canvas.dataset.running).toBe("false");
    expect(renderer.canvas.dataset.suspended).toBe("paused");
    expect(map.getSource(SOURCE)?.pause).toHaveBeenCalled();
  });

  it("reuses restored sources and layers across three cycles without duplicate listeners or frames", () => {
    start();
    for (let cycle = 0; cycle < 3; cycle++) {
      map.loseContext();
      expect(() => map.fire("webglcontextrestored")).not.toThrow();
      map.loadStyle(true);
      expect(map.additions).toEqual({ sources: 1, layers: 1 });
      expect(map.sources.size).toBe(1);
      expect(map.layers.size).toBe(1);
      expect(frames.size).toBe(1);
      for (const listeners of map.listeners.values()) expect(listeners.size).toBe(1);
    }
  });

  it.each(["lost", "loading"])("detaches the renderer when disposed while %s", (phase) => {
    start();
    map.loseContext();
    if (phase === "loading") expect(() => map.fire("webglcontextrestored")).not.toThrow();
    renderer.destroy();
    expect(() => map.fire("webglcontextrestored")).not.toThrow();
    map.loadStyle();
    expect(map.additions).toEqual({ sources: 1, layers: 1 });
    expect(map.sources.size).toBe(0);
    expect(map.layers.size).toBe(0);
    expect(frames.size).toBe(0);
    expect(map.container.querySelectorAll(".wind-source-canvas")).toHaveLength(0);
    for (const listeners of map.listeners.values()) expect(listeners.size).toBe(0);
    expect(disconnect).toHaveBeenCalled();
  });

  it.each(["lost", "loading"])(
    "removes saved wind resources restored after disposal while %s",
    (phase) => {
      start();
      map.loseContext();
      if (phase === "loading") map.fire("webglcontextrestored");
      renderer.destroy();
      map.loadStyle(true);
      expect(map.sources.size).toBe(0);
      expect(map.layers.size).toBe(0);
      expect(frames.size).toBe(0);
      for (const listeners of map.listeners.values()) expect(listeners.size).toBe(0);
    },
  );

  it("releases pending disposal cleanup if the map is removed before style.load", () => {
    start();
    map.loseContext();
    renderer.destroy();
    map.fire("remove");
    for (const listeners of map.listeners.values()) expect(listeners.size).toBe(0);
    expect(frames.size).toBe(0);
  });

  it("does not remove a replacement renderer's source when deferred cleanup runs", () => {
    start();
    map.loseContext();
    renderer.destroy();
    map.ready = true;
    start();
    const replacement = map.getSource(SOURCE);
    map.fire("style.load");
    expect(map.getSource(SOURCE)).toBe(replacement);
    expect(map.getLayer(LAYER)).toBeDefined();
    expect(frames.size).toBe(1);
  });
});

// TwinDesk / DuoDesk — Renderer-side GPU (WebGPU / WebGL2) & NPU (WebNN) acceleration engine.
// Copyright (C) 2026 inukaasith / DuoDesk. GPL-3.0, see LICENSE.
// Probes WebNN (NPU -> GPU -> CPU), WebGPU, and WebGL2 at runtime and provides a lightweight
// NPU/GPU motion activity estimator so FrameGen and video viewers can adaptively sleep on static
// frames (saving power on ARM64 laptops and tablets) and wake immediately when motion resumes.
'use strict';

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DuoDeskAccel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  let cachedCaps = null;

  async function probeWebNN() {
    if (typeof navigator === 'undefined' || !navigator.ml || typeof navigator.ml.createContext !== 'function') {
      return { available: false, device: 'none' };
    }
    for (const deviceType of ['npu', 'gpu', 'cpu']) {
      try {
        const ctx = await navigator.ml.createContext({ deviceType, powerPreference: 'low-power' });
        if (ctx) return { available: true, device: deviceType };
      } catch (_) {}
    }
    return { available: false, device: 'none' };
  }

  async function probeWebGPU(powerPreference = 'low-power') {
    if (typeof navigator === 'undefined' || !navigator.gpu || typeof navigator.gpu.requestAdapter !== 'function') {
      return { available: false, adapter: '' };
    }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference });
      if (!adapter) return { available: false, adapter: '' };
      const info = adapter.info || (typeof adapter.requestAdapterInfo === 'function' ? await adapter.requestAdapterInfo() : null);
      const desc = info ? [info.vendor, info.architecture, info.description].filter(Boolean).join(' ') : 'WebGPU';
      return { available: true, adapter: desc || 'WebGPU' };
    } catch (_) {
      return { available: false, adapter: '' };
    }
  }

  function probeWebGL2() {
    if (typeof document === 'undefined') return { available: false, renderer: '' };
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2', { powerPreference: 'low-power' });
      if (!gl) return { available: false, renderer: '' };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : 'WebGL2';
      return { available: true, renderer };
    } catch (_) {
      return { available: false, renderer: '' };
    }
  }

  async function probeCapabilities(force = false) {
    if (cachedCaps && !force) return cachedCaps;
    const [webnn, webgpu] = await Promise.all([probeWebNN(), probeWebGPU()]);
    const webgl2 = probeWebGL2();
    cachedCaps = {
      webnn,
      webgpu,
      webgl2,
      tier: webnn.available && webnn.device === 'npu' ? 'npu'
        : webgpu.available ? 'webgpu'
          : webgl2.available ? 'webgl2' : 'cpu',
    };
    return cachedCaps;
  }

  // Lightweight motion activity estimator:
  // Uses WebNN (NPU/GPU graph: sub -> abs -> reduceMean) when available, otherwise fast 64x36 canvas SAD.
  // Returns a normalized motion score in [0, 1].
  class MotionActivityEstimator {
    constructor(width = 64, height = 36) {
      this.w = width;
      this.h = height;
      this.n = width * height;
      this.prev = null;
      this.cur = new Float32Array(this.n);
      this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
      if (this.canvas) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      }
      this.backend = 'cpu';
      this._mlReady = false;
      this._mlInitStarted = false;
    }

    async initNpu(preferredDevice = 'npu') {
      if (this._mlInitStarted) return this.backend;
      this._mlInitStarted = true;
      if (typeof navigator === 'undefined' || !navigator.ml || typeof MLGraphBuilder === 'undefined') return this.backend;
      const order = preferredDevice === 'gpu' ? ['gpu', 'npu'] : ['npu', 'gpu'];
      for (const dev of order) {
        try {
          const context = await navigator.ml.createContext({ deviceType: dev, powerPreference: 'low-power' });
          const builder = new MLGraphBuilder(context);
          const desc = { dataType: 'float32', shape: [this.n] };
          const a = builder.input('a', desc);
          const b = builder.input('b', desc);
          const diff = builder.abs(builder.sub(a, b));
          const mean = builder.reduceMean(diff, { axes: [0], keepDimensions: false });
          const graph = await builder.build({ score: mean });
          this._mlCtx = context;
          this._mlGraph = graph;
          this._mlOut = new Float32Array(1);
          this.backend = 'webnn-' + dev;
          this._mlReady = true;
          return this.backend;
        } catch (_) {}
      }
      return this.backend;
    }

    // Extract downscaled luma from an HTMLVideoElement or HTMLCanvasElement
    _sampleVideo(source) {
      if (!this.ctx || !source) return false;
      try {
        this.ctx.drawImage(source, 0, 0, this.w, this.h);
        const rgba = this.ctx.getImageData(0, 0, this.w, this.h).data;
        const out = this.cur;
        for (let i = 0, p = 0; i < this.n; i++, p += 4) {
          out[i] = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114) / 255;
        }
        return true;
      } catch (_) {
        return false;
      }
    }

    // Synchronous CPU fallback (used in tight rAF loops or when WebNN is not active)
    estimateSync(source) {
      if (!this._sampleVideo(source)) return 1;
      if (!this.prev) {
        this.prev = new Float32Array(this.cur);
        return 1;
      }
      let sum = 0;
      const a = this.prev;
      const b = this.cur;
      for (let i = 0; i < this.n; i++) {
        sum += Math.abs(b[i] - a[i]);
        a[i] = b[i];
      }
      return sum / this.n;
    }

    // Asynchronous NPU/GPU WebNN estimator
    async estimateAsync(source) {
      if (!this._mlReady || !this._mlCtx || !this._mlGraph) return this.estimateSync(source);
      if (!this._sampleVideo(source)) return 1;
      if (!this.prev) {
        this.prev = new Float32Array(this.cur);
        return 1;
      }
      try {
        const res = await this._mlCtx.compute(
          this._mlGraph,
          { a: this.prev, b: this.cur },
          { score: this._mlOut }
        );
        this.prev.set(this.cur);
        const arr = res && res.outputs && res.outputs.score ? res.outputs.score : this._mlOut;
        return Number(arr[0]) || 0;
      } catch (_) {
        this._mlReady = false;
        this.backend = 'cpu';
        return this.estimateSync(source);
      }
    }
  }

  return {
    probeCapabilities,
    MotionActivityEstimator,
  };
});

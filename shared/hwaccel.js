// TwinDesk / DuoDesk — Cross-platform ARM64 & GPU/NPU hardware acceleration module.
// Copyright (C) 2026 inukaasith / DuoDesk. GPL-3.0, see LICENSE.
// Main-process helper: detects CPU architecture (ARM64/x64), platform GPU/NPU capabilities,
// and applies optimal Chromium/Electron switches for hardware video decode/encode, WebGPU,
// and WebNN (DirectML NPU/GPU on Windows, CoreML/Neural Engine on macOS, Vulkan/VA-API on Linux).
'use strict';

const os = require('os');

const MODES = ['auto', 'gpu', 'power-save', 'off'];

function normalizeMode(v) {
  return MODES.includes(v) ? v : 'auto';
}

function detectHardware(env = {}) {
  const arch = env.arch || process.arch;
  const platform = env.platform || process.platform;
  const cpus = env.cpus || os.cpus() || [];
  const cpuModel = (cpus[0] && cpus[0].model ? String(cpus[0].model) : '').trim();
  const cores = cpus.length || 1;
  const isArm64 = arch === 'arm64' || arch === 'aarch64';

  // Identify known NPU-equipped SoCs / platforms
  const isSnapdragonX = /snapdragon|qualcomm|oryon/i.test(cpuModel);
  const isAppleSilicon = platform === 'darwin' && isArm64;
  const isCopilotOrNpuX64 = /core\s+ultra|ryzen\s+ai/i.test(cpuModel);

  let npuHint = 'WebNN (DirectML / OS)';
  let gpuBackend = 'WebGPU / WebGL2';
  let videoHw = 'Hardware Video Codec';

  if (platform === 'win32') {
    gpuBackend = isArm64 ? 'D3D12 / Adreno·ARM GPU (WebGPU)' : 'D3D11/D3D12 (WebGPU)';
    npuHint = isSnapdragonX ? 'Qualcomm Hexagon NPU (WebNN / DirectML)'
      : isCopilotOrNpuX64 ? 'Windows NPU (WebNN / DirectML)'
        : 'DirectML NPU/GPU (WebNN)';
    videoHw = 'MediaFoundation / D3D11 HW Decode';
  } else if (platform === 'darwin') {
    gpuBackend = isAppleSilicon ? 'Apple Silicon Metal (WebGPU)' : 'Metal (WebGPU)';
    npuHint = isAppleSilicon ? 'Apple Neural Engine (WebNN / CoreML)' : 'CoreML / GPU (WebNN)';
    videoHw = 'VideoToolbox HW Decode/Encode';
  } else if (platform === 'linux') {
    gpuBackend = isArm64 ? 'Vulkan / Panfrost·Adreno·Mali (WebGPU)' : 'Vulkan / OpenGL (WebGPU)';
    npuHint = 'WebNN / ONNX-EP (NPU/GPU fallback)';
    videoHw = isArm64 ? 'V4L2 M2M / VA-API HW Decode' : 'VA-API / Vulkan Video';
  }

  return {
    arch,
    platform,
    isArm64,
    cpuModel,
    cores,
    npuLikely: isSnapdragonX || isAppleSilicon || isCopilotOrNpuX64,
    gpuBackend,
    npuHint,
    videoHw,
  };
}

// Compute Chromium command-line switches for a given hardware profile and acceleration mode.
function computeSwitches(mode = 'auto', env = {}) {
  const m = normalizeMode(mode);
  const hw = detectHardware(env);
  const switches = [];

  if (m === 'off') {
    return { mode: m, hw, switches };
  }

  const features = ['WebMachineLearningNeuralNetwork']; // WebNN (NPU / GPU inference)

  if (hw.platform === 'win32') {
    features.push('D3D11VideoDecoder', 'MediaFoundationClearPlayback');
    switches.push(['enable-gpu-rasterization']);
    switches.push(['enable-zero-copy']);
    if (hw.isArm64) {
      // Ensure ARM64 GPUs (e.g. Qualcomm Adreno) are not silently downgraded by blocklist
      switches.push(['ignore-gpu-blocklist']);
    }
  } else if (hw.platform === 'darwin') {
    switches.push(['enable-gpu-rasterization']);
    switches.push(['enable-zero-copy']);
  } else if (hw.platform === 'linux') {
    features.push('VaapiVideoDecodeLinuxGL', 'VaapiVideoEncoder', 'CanvasOopRasterization');
    switches.push(['enable-gpu-rasterization']);
    switches.push(['enable-zero-copy']);
    switches.push(['ignore-gpu-blocklist']);
  }

  if (m === 'power-save') {
    // Prefer low-power integrated / ARM GPU where applicable
    switches.push(['force_low_power_gpu']);
  } else if (m === 'gpu') {
    switches.push(['force_high_performance_gpu']);
  }

  if (features.length) {
    switches.push(['enable-features', features.join(',')]);
  }

  return { mode: m, hw, switches };
}

// Safely append switches to Electron's app.commandLine without clobbering existing enable-features.
function applyElectronSwitches(app, mode = 'auto', env = {}) {
  const plan = computeSwitches(mode, env);
  if (!app || !app.commandLine) return plan;

  for (const entry of plan.switches) {
    const [flag, value] = entry;
    if (flag === 'enable-features' && value) {
      const existing = app.commandLine.getSwitchValue('enable-features');
      const merged = existing
        ? Array.from(new Set([...existing.split(','), ...value.split(',')].filter(Boolean))).join(',')
        : value;
      app.commandLine.appendSwitch('enable-features', merged);
    } else if (value !== undefined) {
      app.commandLine.appendSwitch(flag, value);
    } else {
      app.commandLine.appendSwitch(flag);
    }
  }
  return plan;
}

function getSummary(mode = 'auto', env = {}) {
  const m = normalizeMode(mode);
  const hw = detectHardware(env);
  return {
    mode: m,
    arch: hw.arch,
    isArm64: hw.isArm64,
    platform: hw.platform,
    cpuModel: hw.cpuModel,
    cores: hw.cores,
    gpuBackend: hw.gpuBackend,
    npuHint: hw.npuHint,
    videoHw: hw.videoHw,
    npuLikely: hw.npuLikely,
  };
}

module.exports = {
  MODES,
  normalizeMode,
  detectHardware,
  computeSwitches,
  applyElectronSwitches,
  getSummary,
};

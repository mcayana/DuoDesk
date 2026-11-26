// Unit tests for shared/hwaccel.js (ARM64 + GPU/NPU hardware acceleration).
'use strict';

const assert = require('assert');
const hwaccel = require('../hwaccel.js');

// Normalize modes
assert.strictEqual(hwaccel.normalizeMode('auto'), 'auto');
assert.strictEqual(hwaccel.normalizeMode('gpu'), 'gpu');
assert.strictEqual(hwaccel.normalizeMode('power-save'), 'power-save');
assert.strictEqual(hwaccel.normalizeMode('off'), 'off');
assert.strictEqual(hwaccel.normalizeMode('invalid'), 'auto');

// Windows ARM64 (Snapdragon X) detection & switches
const winArm = hwaccel.computeSwitches('auto', {
  arch: 'arm64',
  platform: 'win32',
  cpus: [{ model: 'Snapdragon(R) X Elite - X1E80100 - Qualcomm(R) Oryon(TM) CPU' }],
});
assert.strictEqual(winArm.hw.isArm64, true);
assert.strictEqual(winArm.hw.npuLikely, true);
assert.ok(winArm.hw.npuHint.includes('Hexagon'));
assert.ok(winArm.switches.some(([k]) => k === 'ignore-gpu-blocklist'));
assert.ok(winArm.switches.some(([k, v]) => k === 'enable-features' && v.includes('WebMachineLearningNeuralNetwork')));
assert.ok(winArm.switches.some(([k, v]) => k === 'enable-features' && v.includes('D3D11VideoDecoder')));

// Linux ARM64 detection & switches
const linuxArm = hwaccel.computeSwitches('power-save', {
  arch: 'arm64',
  platform: 'linux',
  cpus: [{ model: 'ARMv8 Processor' }],
});
assert.strictEqual(linuxArm.hw.isArm64, true);
assert.ok(linuxArm.switches.some(([k]) => k === 'force_low_power_gpu'));
assert.ok(linuxArm.switches.some(([k, v]) => k === 'enable-features' && v.includes('VaapiVideoDecodeLinuxGL')));

// macOS Apple Silicon detection
const macArm = hwaccel.detectHardware({
  arch: 'arm64',
  platform: 'darwin',
  cpus: [{ model: 'Apple M4' }],
});
assert.strictEqual(macArm.isArm64, true);
assert.strictEqual(macArm.npuLikely, true);
assert.ok(macArm.npuHint.includes('Apple Neural Engine'));

// Off mode produces no switches
const offPlan = hwaccel.computeSwitches('off', { arch: 'arm64', platform: 'win32' });
assert.strictEqual(offPlan.switches.length, 0);

// applyElectronSwitches merges existing enable-features safely
const store = new Map([['enable-features', 'WebRTCPipeWireCapturer']]);
const mockApp = {
  commandLine: {
    getSwitchValue: (k) => store.get(k) || '',
    appendSwitch: (k, v) => store.set(k, v === undefined ? true : v),
  },
};
hwaccel.applyElectronSwitches(mockApp, 'auto', { arch: 'arm64', platform: 'linux' });
const merged = store.get('enable-features');
assert.ok(merged.includes('WebRTCPipeWireCapturer'));
assert.ok(merged.includes('WebMachineLearningNeuralNetwork'));

console.log('hwaccel: all passed');

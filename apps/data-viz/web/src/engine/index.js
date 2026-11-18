// The tested runtime engine, shared verbatim with the build-time Rust engine.
// Import order matters: the shim must define `window` before the IIFEs run.
import './shim.js';
import './01-core.js';
import './05-compute.js';
import './06-text.js';

export const DV = globalThis.window.DV;

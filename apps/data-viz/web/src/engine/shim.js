// Node tests import the same engine the browser uses; in the browser `window`
// already exists, in Node we alias it to the global object before the IIFEs run.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

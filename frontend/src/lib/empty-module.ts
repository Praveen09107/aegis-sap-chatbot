// Turbopack alias target for the optional "canvas" dependency that
// @react-pdf/renderer's browser bundle probes for but never actually uses
// (PNG/JPEG image embedding only — unused by SessionDocument). Webpack
// builds skip this entirely via next.config.ts's resolve.alias.canvas = false;
// Turbopack has no equivalent "exclude" primitive, so it needs a real module
// to redirect to instead.
const emptyModule = {};
export default emptyModule;

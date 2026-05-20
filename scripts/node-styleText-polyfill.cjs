/**
 * Polyfill for Node < 20.12 where util.styleText is unavailable.
 * Required by Convex CLI's bundled @inquirer dependency.
 */
const util = require("node:util");

if (typeof util.styleText !== "function") {
  util.styleText = (_style, text) => String(text);
}

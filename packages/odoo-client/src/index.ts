/** @novi/odoo-client: transports, typed errors and helpers for talking to an unmodified Odoo 20. */
export * from "./errors.js";
export { CookieJar, Http } from "./http.js";
export { type Json2Options, Json2Transport } from "./json2.js";
export { JsonRpcTransport, type SessionInfo } from "./jsonrpc.js";
export * from "./orm.js";
export * from "./types.js";
export { assertSupported, capabilitiesFor, getVersion } from "./version.js";

/** Odoo version detection via the unauthenticated `GET /web/version` route. */
import { NetworkError } from "./errors.js";
import { Http, readJson } from "./http.js";
import type { Capabilities, TransportOptions, VersionInfo } from "./types.js";

export async function getVersion(
  opts: Pick<TransportOptions, "baseUrl" | "fetch" | "timeoutMs">,
  signal?: AbortSignal,
): Promise<VersionInfo> {
  const http = new Http({ ...opts, retry: { retries: 1 } });
  const res = await http.send({ url: "/web/version", method: "GET", signal, retry: true });
  const json = (await readJson(res, "/web/version")) as VersionInfo | null;
  if (!res.ok || !json || !Array.isArray(json.version_info)) {
    throw new NetworkError(`Cannot read Odoo version from ${opts.baseUrl} (HTTP ${res.status})`, {
      status: res.status,
    });
  }
  return json;
}

export function capabilitiesFor(version: VersionInfo): Capabilities {
  const major = Number(version.version_info[0]);
  return { major, json2: major >= 19, legacyRpc: major < 22 };
}

/** NOVI targets Odoo 20; 19 is expected to work, other versions are refused. */
export function assertSupported(version: VersionInfo): void {
  const major = Number(version.version_info[0]);
  if (major < 19 || major > 20) {
    throw new Error(`Unsupported Odoo version ${version.version} (NOVI supports 19–20)`);
  }
}

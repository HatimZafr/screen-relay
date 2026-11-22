import type { McpServer } from "@modelcontextprotocol/server";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { ORIGIN } from "./config.ts";
import { directViewer } from "./direct-viewer.ts";

export const RESOURCE_URI = "ui://relay/desktop-direct.html";

const ui = {
  csp: { connectDomains: [ORIGIN, ORIGIN.replace(/^http/, "ws")] },
  permissions: { clipboardWrite: {} },
  prefersBorder: false,
};

/** Registers the HTML resource that renders the desktop inside the host. */
export function registerViewer(server: McpServer): void {
  registerAppResource(
    server,
    "screen-relay desktop viewer",
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE, _meta: { ui } },
    async () => ({
      contents: [{
        uri: RESOURCE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: await directViewer(ORIGIN),
        _meta: { ui },
      }],
    }),
  );
}

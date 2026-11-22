import { defineConfig } from "@vercel/geistdocs/config";
import {
  agent,
  basePath,
  github,
  Logo,
  nav,
  navbarBrand,
  prompt,
  siteId,
  suggestions,
  title,
  translations,
} from "@/geistdocs";
import { isSiteUrlConfigured, siteUrl } from "./site-url";

export const config = defineConfig({
  title,
  agent,
  defaultLanguage: "en",
  logo: <Logo />,
  github,
  nav,
  navbarBrand,
  basePath,
  siteId,
  siteUrl: isSiteUrlConfigured ? siteUrl.toString() : undefined,
  translations,
  webmcp: { enabled: true },
  content: [{ id: "docs", label: "Docs", dir: "content/docs", route: "/docs" }],
  ai: {
    prompt,
    suggestions,
  },
});

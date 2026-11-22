import { createGeistdocs } from "@vercel/geistdocs/next";
import type { NextConfig } from "next";

const withGeistdocs = createGeistdocs();

const favicons = {
  development: "/favicon.development.ico",
  preview: "/favicon.preview.ico",
} as const;

const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
const favicon = favicons[environment as keyof typeof favicons];

const config: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  redirects() {
    return Promise.resolve(
      ["x11", "wayland"].flatMap((page) => [
        { source: `/docs/${page}`, destination: "/docs/linux", permanent: true },
        { source: `/:lang/docs/${page}`, destination: "/:lang/docs/linux", permanent: true },
      ])
    );
  },

  rewrites() {
    if (!favicon) {
      return Promise.resolve([]);
    }

    return Promise.resolve({
      beforeFiles: [{ source: "/favicon.ico", destination: favicon }],
      afterFiles: [],
      fallback: [],
    });
  },
};

export default withGeistdocs(config);

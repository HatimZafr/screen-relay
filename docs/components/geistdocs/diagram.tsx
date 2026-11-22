"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type DiagramProps = {
  name: string;
  title: string;
  aspectRatio?: string;
};

/** Embeds `/diagrams/<name>/index.html` in a lazy iframe and passes the site theme as `?theme=`. */
export const Diagram = ({
  name,
  title,
  aspectRatio = "720 / 448",
}: DiagramProps) => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const query = mounted && resolvedTheme ? `?theme=${resolvedTheme}` : "";

  return (
    <iframe
      className="my-6 block w-full rounded-lg border-0"
      loading="lazy"
      src={`/diagrams/${name}/index.html${query}`}
      style={{ aspectRatio }}
      title={title}
    />
  );
};

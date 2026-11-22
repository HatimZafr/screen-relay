"use client";

import { Toggle } from "@vercel/geistdocs/components/toggle";
import { useState } from "react";

export function ToggleDemo() {
  const [enabled, setEnabled] = useState(false);

  return (
    <Toggle checked={enabled} onChange={setEnabled}>
      Enable previews
    </Toggle>
  );
}

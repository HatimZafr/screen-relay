"use client";

import { Button } from "@vercel/geistdocs/components/button";
import { useToasts } from "@vercel/geistdocs/components/toasts";

export function ToastDemo() {
  const toast = useToasts();

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Button
        onClick={() => toast.success({ text: "Changes saved" })}
        variant="secondary"
      >
        Success
      </Button>
      <Button
        onClick={() =>
          toast.warning({ text: "Review these changes before continuing" })
        }
        variant="secondary"
      >
        Warning
      </Button>
      <Button
        onClick={() => toast.error({ text: "Something went wrong" })}
        variant="secondary"
      >
        Error
      </Button>
    </div>
  );
}

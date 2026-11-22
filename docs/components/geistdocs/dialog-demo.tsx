"use client";

import { Button } from "@vercel/geistdocs/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vercel/geistdocs/components/dialog";
import { useState } from "react";

export function DialogDemo() {
  const [active, setActive] = useState(false);

  return (
    <>
      <Button onClick={() => setActive(true)} variant="secondary">
        Open dialog
      </Button>
      <Dialog
        active={active}
        drawer={false}
        onClickOutside={() => setActive(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search documentation</DialogTitle>
            <DialogDescription>
              Dialogs work for search, chat, forms, and focused decisions.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
        <DialogFooter>
          <DialogClose onClick={() => setActive(false)} variant="secondary">
            Done
          </DialogClose>
        </DialogFooter>
      </Dialog>
    </>
  );
}

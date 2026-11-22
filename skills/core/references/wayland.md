# Wayland

`screen-relay up -d --backend wayland` runs a headless sway desktop. `--display` attaches to a compositor you already run.

## Compositors

- Tested: sway and labwc.
- Untested: Hyprland (including Omarchy), river, wayfire and niri. They offer the same protocols, so they should work.
- Not supported: GNOME and KDE. They do not offer `wlr-screencopy`.

A compositor must provide `wlr-screencopy` version 3 with XRGB8888 or ARGB8888 shared-memory frames, the virtual keyboard protocol, and virtual pointer version 2.

## Start a headless desktop

Set up the Wayland backend first, then start the session as a normal user:

```sh
screen-relay install --backend wayland --yes
screen-relay up -d --backend wayland
```

The session runs sway with XWayland and foot, without a GPU. Add `--desktop none` to run without foot.

## Attach to a compositor

Run these steps from a terminal inside the compositor session:

1. Find the output to capture:
   - sway: `swaymsg -t get_outputs`
   - Hyprland: `hyprctl monitors`
2. Start screen-relay with the Wayland socket from your environment:

   ```sh
   screen-relay up -d --backend wayland --display "$WAYLAND_DISPLAY" --output OUTPUT
   ```

   Replace `OUTPUT` with the output name from step 1. Omit `--output` to capture the first output. `--output` needs the Wayland backend. On x11, `up` fails.

- Attach mode needs `XDG_RUNTIME_DIR`, which a terminal in a Wayland session normally sets. If screen-relay reports that it is missing, export the compositor's runtime directory, usually `/run/user/$(id -u)`.
- Attach mode does not set `DISPLAY`. X11 apps need it, so export `DISPLAY` in the shell that runs `screen-relay up` when your compositor provides XWayland.

## Limits

- Output width must be 320 to 16384 pixels, and height 240 to 16384 pixels, both even. For a larger screen, create a headless output of a supported size on your compositor, then attach to it.
- Selecting an output with `--output` needs `wl_output` version 4.
- The output size cannot change during a session. Run `screen-relay down` and start again to use another size.
- The cursor image is not streamed. The viewer shows its own arrow.

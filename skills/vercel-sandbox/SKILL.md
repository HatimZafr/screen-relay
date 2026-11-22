---
name: vercel-sandbox
description: Run and control screen-relay inside a Vercel Sandbox.
allowed-tools: Bash(screen-relay:*)
---

# screen-relay in Vercel Sandbox

Run these steps in order. The port must be published before the first `up`, so that `--public` can match the sandbox URL.

1. Create the sandbox with port 8080 published:

   ```sh
   sandbox create --name <name> --publish-port 8080
   ```

   To publish the port on a sandbox that already exists, run `sandbox config ports <name> -p 8080`. Either command prints an HTTPS URL such as `https://<id>.vercel.run`. Note it.

2. In the sandbox, install the CLI:

   ```sh
   npm install -g screen-relay
   ```

3. Install the system packages and build the engine:

   ```sh
   screen-relay install --yes
   ```

   On a fresh sandbox this can take several minutes. Run it with a long command timeout or in the background, and wait for it to exit. It is safe to repeat.

4. Start the session behind the public URL:

   ```sh
   screen-relay up -d --bind 0.0.0.0 --public https://<id>.vercel.run
   ```

   `--bind 0.0.0.0` lets the Sandbox HTTPS proxy reach the engine. `--public` creates a token and sets the host the proxy must send. Piped, `up -d` prints the viewer URL with its `#token=` fragment. Treat the whole URL as a secret, and share it only through the user's secret channel.

5. Check the session:

   ```sh
   screen-relay status --json
   ```

Run the commands in the sandbox itself. `sandbox ssh <name>` opens a shell in it.

Extend the sandbox lifetime when needed:

```sh
sandbox extend <name> 1h
```

## Control it

The default desktop is X11 with XFCE. Start a terminal with `screen-relay run -- xfce4-terminal`, then run the control loop from `screen-relay skills get core`.

## Errors

- `unreachable` with `Connection refused.`: the engine is not listening. Run `screen-relay up -d`.
- `unreachable` with `The host name did not resolve.` or `The TLS certificate was rejected.`: check the edge URL and certificate, then run `screen-relay status --url https://<id>.vercel.run --token-file <FILE>`.
- `unauthorized`: pass the session's token with `--token-file FILE` or `SCREEN_RELAY_TOKEN_FILE`.
- `forbidden`: `--public` does not match the URL you reached, or a proxy rewrote `Host` or `Origin`.
- `busy`: another controller holds input. See One controller in `screen-relay skills get core`.
- `component_failed` or `timeout` from `up`: read `data.component`, then run `screen-relay logs <component>` and `screen-relay doctor`.

Stop the desktop with `screen-relay down` before you stop the sandbox with `sandbox stop <name>`. The full workflow is in `screen-relay skills get core`.

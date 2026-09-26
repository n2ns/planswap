# Development Notes

Date: 2026-09-26

Problems met while developing this extension that are caused by the editor or the environment, not by the extension code. For build, test and verification rules see `AGENTS.md`.

## 1. F5 does not load the extension in VS Code 1.139 (js-debug attach regression)

### Symptoms

In a VS Code 1.139.x WSL window, pressing F5 ("Run Extension") opens the Extension Development Host, but the extension is never activated. The debugger never attaches and the debug session ends after about 10 seconds with:

```
Error processing attach: Error: Could not connect to debug target at http://localhost:<port>:
Socket closed before the connection was established
```

The remote extension host log (`~/.vscode-server/data/logs/<session>/exthost*/remoteexthost.log`) is flooded with:

- `RequestError: connect ECONNREFUSED ::1:<port>`
- ``Error: The `onCancel` handler was attached after the promise settled.``

The Windows-side `renderer.log` shows "An unknown error occurred. Please consult the log for more details." about once per second while attaching.

Ctrl+F5 (Run Without Debugging) loads the extension normally, and F5 works in Antigravity (VS Code 1.107 core). The extension code is not involved.

### Cause

- For `extensionHost` launches the development extension host is started with `--inspect-brk=<port>`. It stops at the first line until a debugger attaches, and its inspector listens on `127.0.0.1` only.
- The bundled js-debug 1.117.0 looks up the target at `http://localhost:<port>` and probes `127.0.0.1` and `[::1]` in parallel.
- The race helper rejects as soon as one probe fails. The `[::1]` probe fails, the in-flight `127.0.0.1` probe is cancelled, and the lookup is retried every 200 ms until the 10 s timeout.
- So the debugger never attaches, and the extension host never runs past its first line.

Upstream reports: microsoft/vscode-js-debug#2416 and #2420, microsoft/vscode#337488 and #337774; the fix is milestoned for VS Code 1.140.

Checked and ruled out:

- **Proxy resolution.** VS Code's extension-host proxy support always treats `localhost` / `127.0.0.1` as DIRECT.
- **System certificates V2.** `http.experimental.systemCertificatesV2` defaults to `false`, and V1 only affects HTTPS.
- **WSL mirrored networking.** `curl` to the inspector URL from WSL answers instantly.
- **Port forwarding.** No debug port was forwarded or bound on the Windows side.

### Workaround

Patch the js-debug that VS Code runs on the WSL side so it asks for IPv4 directly.

In `~/.vscode-server/bin/<commit>/extensions/ms-vscode.js-debug/src/extension.js`, in `launchProgram` of the extension host attach, replace:

```
$l(`http://localhost:${t.params.port}`
```

with:

```
$l(`http://127.0.0.1:${t.params.port}`
```

Steps:

1. Back up the file first.
2. Check that the string occurs exactly once. The minified names (`$l`, `t.params.port`) can differ between builds.
3. Check the result with `node --check`.
4. Run "Developer: Reload Window" and press F5 again.
5. If something goes wrong, restore the backup.

Only this occurrence is used by F5. The similar `` Wv(`http://localhost:${t.connection}` `` belongs to the plain Node attach path and does not help.

Notes:

- This edits the editor installation, not the repository. A VS Code update replaces the server directory and drops the patch. Re-check after each update, and drop the workaround once the upstream fix has shipped.
- Alternatives that change nothing:
  - Use Ctrl+F5 in VS Code and debug with breakpoints in Antigravity.
  - Stay on VS Code 1.138 until the fix is released.
- An extension host left over from a failed attempt stays paused at `--inspect-brk`. Close its window, or reload the WSL window, to reclaim it.

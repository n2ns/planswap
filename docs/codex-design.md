# Codex Account Switching: Design

Date: 2026-09-26
Status: implemented (v7, 2026-09-26: the WSL server restart works per editor kind detected from a whitelist of server data directories: Antigravity and VSCodium restart automatically, VS Code and unrecognized editors only get manual instructions (section 5); v6, 2026-09-26: English docs + i18n: the Codex page, commands and messages are localized in English / Simplified Chinese following `aiSwitcher.language`, while the rc marker block stays byte-identical; v5: single view with tabs + account display names + read-only `auth.json` for email and plan; on 2026-09-25 the constraint "do not decode tokens, do not show emails" was lifted at the user's request; since 2026-09-26 every registered account can be renamed, and `AGENTS.md` is shared through symlinks. Contract in codex-interfaces.md)

## 1. Goals and scope

- Goal: add OpenAI Codex account switching to the same sidebar extension. After a switch, the official Codex editor extension, the codex processes it starts, and the codex CLI in integrated terminals all use the selected account, without signing in again.
- Claude account switching is a separate feature; the two do not affect each other.
- Runtime environment: WSL / Linux only, the editor is Antigravity IDE (VS Code 1.107 core); VSCodium and VS Code are also recognized (section 5). WSL remote window. The login shell is bash.
- Cost accepted by the user: switching the Codex account requires restarting the editor's server inside WSL (automatic only for Antigravity and VSCodium, see section 5). All WSL windows disconnect and each shows "Cannot reconnect. Please reload the window." once; the user clicks "Reload Window" once in each window. Integrated terminals close.
- Non-goals:
  - `auth.json` is read-only, and only the JWT payload of its `tokens.id_token` is decoded (signature not verified) to display email and plan; no token is ever copied, swapped, cached or output (the raw `access_token`/`refresh_token`/`id_token` never reach logs, state, messages or the UI). `auth.json` is never written.
  - Never modify the contents of `~/.codex`, with one exception: when `AGENTS.md` is missing, an empty file is created as the target of the other account directories' symlinks.
  - No usage display, no calls to any non-public interface, no automatic switching when the quota runs out.
  - Do not use `chatgpt.cliExecutable`; do not depend on extension activation order.

## 2. Background facts (verified)

Sources: `openai/codex` source code (main as of 2026-09-25), the local `openai.chatgpt-26.908.40401` extension source code, `microsoft/vscode` 1.107.0 source code, the local Antigravity server (`server-main.js`) and startup scripts, the Windows-side `antigravity-remote-wsl` extension, local logs and the process tree.

1. All local Codex state lives in `CODEX_HOME` (default `~/.codex`). When the variable is set, the directory must already exist, and the path is resolved through symlinks. The credentials in `auth.json` are isolated per directory; in keyring mode the keys are also distinguished by a hash of the directory path.
2. The app-server reads `CODEX_HOME` once at startup and then caches the credentials in memory; it does not watch the file, and there is no interface to reload authentication or change the directory. Changing accounts requires restarting the process.
3. Signing in to a new account in the same `CODEX_HOME` revokes the authorization of the account previously in that directory. One directory per account naturally avoids this.
4. Refresh tokens are single-use and rotated; `auth.json` is not written atomically. Therefore this design never copies or swaps the file; reading tolerates half-written JSON (a parse failure means email/plan unknown). Structure of `auth.json`: `auth_mode` (`chatgpt` / `apikey`), `OPENAI_API_KEY`, `tokens.{id_token,access_token,refresh_token,account_id}`; the `id_token` payload contains `email` and `https://api.openai.com/auth`.`chatgpt_plan_type` (`free`/`go`/`plus`/`pro`/`prolite`/`team`/`business`/`enterprise`, etc.).
5. The Codex sidebar view of a WSL window is provided by the extension instance in the **WSL-side extension host** (local logs: the WSL-side instance shows all activity: UI mounting, account queries, session restore; the Windows-side instance was only activated once when the window opened and showed no activity afterwards). The environment of the codex processes started by that instance is the extension host's `process.env` plus a few fixed entries; `CODEX_HOME` comes only from the extension host environment. With remote type `wsl`, the extension does not probe the shell environment itself. The extension's own access to directories such as `ipc/`, `skills/`, `prompts/` also follows the same variable. The extension has no setting to inject environment variables, and it does not restart the codex process automatically after it exits.
6. The environment of the WSL remote extension host is resolved by the server process through a login shell (`bash -i -l -c`), and the result is cached for the lifetime of the server process; restarting the extension host or reloading a window does not resolve it again. `bash -i -l` reads `/etc/profile` and the first existing one of `~/.bash_profile`, `~/.bash_login`, `~/.profile`; it does not read `~/.bashrc` directly. This machine has neither of the first two, and `~/.profile` sources `~/.bashrc`; the interactive guard at the top of `~/.bashrc` does not trigger under `-i`. It was verified on this machine that variables exported in `~/.bashrc` reach the extension host.
7. The base environment of integrated terminal processes also comes from the server's cached environment; but the terminal shell is interactive bash and sources `~/.bashrc` again, so newly opened terminals re-run the logic in the rc files.
8. Antigravity's WSL server: the startup script is re-run by the Windows-side extension on every window connection; the script uses the pid file plus the process name to decide whether the server is running, reuses it if so, and otherwise starts a new one with the login shell environment and overwrites the pid file. The pid file records the pid of the wrapper script `sh bin/antigravity-ide-server`; its child `node out/server-main.js` is the server, and the extension host's parent process is that node process. The server runs with `--enable-remote-auto-shutdown` and exits 300 seconds after the last window disconnects. There is exactly one server per distribution, user and version, shared by all WSL windows.
9. The server's node process has no SIGTERM handler and exits on receipt. The extension host has a parent-process guard and exits by itself within about 1 second, and its children end with it. The pty host has no parent-process guard and lingers after the server dies, keeping integrated terminals and their processes alive, so it must be terminated as well.
10. After the server dies, the startup script starts a new server when the client reconnects, but the new server does not accept the old reconnection token, and the client shows the dialog "Cannot reconnect. Please reload the window."; after clicking "Reload Window" it connects to the new server normally and the extension host environment is resolved again. Antigravity has no "restart server" command.
11. Server layouts: Antigravity `~/.antigravity-ide-server/bin/<ideVersion>-<commit>/`, VSCodium `~/.vscodium-server/bin/<commit>/`, VS Code `~/.vscode-server/bin/<commit>/`. The server root (= `vscode.env.appRoot`) contains `product.json` with a top-level `commit`.
12. VSCodium's server works like Antigravity's: the pid file `<dataDir>/.<commit>.pid` holds the pid of the wrapper `sh <root>/bin/<serverApplicationName>`, which is the parent of `node <root>/out/server-main.js --start-server ...`, which is the extension host's parent (`process.ppid`). Both auto-shut down 300 seconds after the last window disconnects (`--enable-remote-auto-shutdown`).
13. VS Code (Microsoft's remote-wsl) has no pid file and no `--start-server`; its Windows-side wslDaemon caches the resolved port, so after the server is killed a reloaded window can receive a stale port while other windows keep the daemon alive. Closing all VS Code windows connected to the distro makes the daemon exit (3 s) and stop the server; reopening starts a new one. Therefore VS Code's server is never restarted automatically. (Read from the remote-wsl 0.104.3 source `dist/node/wslDaemon.js` and `scripts/wslServer.sh`; not verified at runtime.)

## 3. Overall design

```
~/.profile and ~/.bashrc each have a marker block: read CODEX_HOME from the state file and export / unset
User clicks "Switch" on the Codex page
  → the extension writes the target directory to the state file ~/.config/ai-switcher/codex-home (atomic write + fsync)
  → the extension terminates the WSL-side server and its leftover children (section 5)
  → every WSL window shows "Cannot reconnect"; the user clicks "Reload Window"
  → the new server resolves the environment through a login shell; CODEX_HOME points to the new directory
  → the Codex extension in the new extension host and its codex processes use the new directory
```

An account is a directory:

| Account | Directory | Notes |
|---|---|---|
| default | `~/.codex` | Always exists, cannot be removed; effective when the state file is empty |
| `<name>` | `~/.codex-<name>` | Created with "Add account", or registered automatically by scanning `~/.codex-*` on activation |

## 4. Login shell configuration

- State file: `~/.config/ai-switcher/codex-home`, content is the absolute path of the target directory, or empty (default account). Mode 0600, directory 0700, atomic write (temporary file + rename + directory fsync).
- Content of the marker block, written in two places, `~/.profile` and `~/.bashrc` (login shells use the former, non-login interactive terminals the latter; when `~/.profile` sources `~/.bashrc` the block runs twice, which is idempotent and harmless). The block is never localized; it is byte-identical whatever the UI language:

```bash
# >>> ai-switcher codex >>>
if [ -r "$HOME/.config/ai-switcher/codex-home" ]; then
  _ai_switcher_codex_home="$(cat "$HOME/.config/ai-switcher/codex-home" 2>/dev/null)"
  if [ -n "$_ai_switcher_codex_home" ] && [ -d "$_ai_switcher_codex_home" ]; then
    export CODEX_HOME="$_ai_switcher_codex_home"
  else
    unset CODEX_HOME
  fi
  unset _ai_switcher_codex_home
fi
# <<< ai-switcher codex <<<
```

- When the state file is empty or the directory does not exist, the block runs `unset` instead of doing nothing: after switching back to the default account, newly opened terminals do not inherit the old value cached by the server. Once enabled, this extension owns the variable exclusively.
- In `~/.bashrc` the block is inserted before the interactive guard (`case $- in *i*) ;; *) return;; esac`); if no guard is found it is appended to the end of the file. This way non-interactive login shells such as `bash -lc` also see it.
- Pre-checks before writing (`aiSwitcher.codex.enable`):
  1. The extension host's `process.env.SHELL` is bash. For zsh only a snippet is shown for the user to add to `~/.zprofile` and `~/.zshrc`; fish is not supported.
  2. `~/.bash_profile` and `~/.bash_login` do not exist, or they source `~/.bashrc`; otherwise the reason is shown and nothing is written.
  3. `~/.profile` and `~/.bashrc` contain no `export CODEX_HOME` of the user's own; if they do, the conflict is shown and nothing is written.
  4. A modal confirmation shows the content to be written; an existing marker block is not written again.
  5. If the marker block of either file is damaged (start marker `# >>> ai-switcher codex >>>` without end marker `# <<< ai-switcher codex <<<`, `broken` in `rcStatus`), an error asks for a manual fix before retrying.
- Self-check after writing: write a temporary state file pointing to a temporary empty directory, run `bash -i -l -c 'printf %s "$CODEX_HOME"'` and check the output, then restore the state file and delete the temporary directory. When the self-check fails, roll back **per file**: only the marker blocks newly written in this run are removed; files that already had a block before enabling are left alone; then report.
- The rc files and the state file are written atomically (temporary file in the same directory + rename), so a half-written rc file can never be left behind.
- `aiSwitcher.codex.disable`: remove both blocks by their markers and delete the state file. If either file lacks the end marker, an error is thrown, that file is not changed, and the user is asked to fix it manually.
- Pre-check reasons, the modal texts and the self-check result are localized; the block written to the files is not.

## 5. Restarting the WSL-side server

- Editor kind (whitelist, not generic parsing): the server root is the path before `/out/server-main.js` in the argv of `/proc/<ppid>/cmdline` (split on `\0`), its parent directory must be named `bin`, the data directory is the parent of that `bin`, and it must be exactly one of these directories directly under `$HOME` (symlinks in the parent path and in `$HOME` are resolved before comparing):

| Data directory | Kind | Restart |
|---|---|---|
| `~/.antigravity-ide-server`, `~/.antigravity-server` (older releases) | `antigravity` | automatic (pid file) |
| `~/.vscodium-server` | `vscodium` | automatic (pid file) |
| `~/.vscode-server` | `vscode` | manual guidance only (reason: section 2 item 13) |
| anything else, or detection failure | `unknown` | generic manual guidance only |

- Manual kinds (`vscode`, `unknown`) are never signaled; the switch still writes the state file, and the user restarts the server by hand.
- Locating (automatic kinds): server = the extension host's parent process `process.ppid`. Only act when all checks pass, in this order; otherwise refuse and show the manual method:
  - `process.ppid > 1`;
  - `/proc/<ppid>/cmdline` contains `out/server-main.js` and `--start-server`, the server root can be parsed, and the kind of its data directory can auto restart;
  - the top-level `commit` of `<root>/product.json` is 40 lowercase hex characters;
  - the basename of the root equals the commit or ends with `-<commit>`;
  - the value of the pid file `<dataDir>/.<commit>.pid` equals the parent pid in `/proc/<ppid>/stat` (i.e. the wrapper script).
- Order:
  1. Finish writing the state file first (including fsync).
  2. Enumerate `/proc/*/stat` and collect every child whose parent is the server (extension hosts, pty host, file watcher, etc.), excluding this extension host itself.
  3. Send `SIGTERM` to the server, then to the children collected in step 2. Use `process.kill`, never shell commands. This extension host exits by itself through its parent-process guard.
- Afterwards: every WSL window shows "Cannot reconnect. Please reload the window.", and the user clicks "Reload Window".
- Manual method, by kind (`{editor}` is "Antigravity" or "VSCodium", not localized):
  - `antigravity` / `vscodium`: "Manual alternative: close all {editor} windows connected to this distro, wait at least 5 minutes, then reopen." (the server auto-shutdown delay is 300 seconds)
  - `vscode`: "Close all VS Code windows connected to this distro, wait a few seconds, then reopen them."
  - `unknown`: "Close all editor windows connected to this distro, wait at least 5 minutes, then reopen them. If the account has still not changed, run "wsl --shutdown" in Windows (this stops all WSL distros) and reopen."
- Modal confirmation before switching:
  - automatic kinds: "Switching the Codex account restarts {editor}'s WSL server: all WSL windows disconnect and prompt to reload, all extensions restart, and integrated terminals close. Continue?"
  - manual kinds: "The new Codex account takes effect only after the WSL server restarts, which this editor cannot do automatically. {hint} Continue?" (`{hint}` is the manual method above); after confirming, the state file is written and no further warning is shown.
- "Restart WSL Server": automatic kinds show the modal "Restart {editor}'s WSL server: all WSL windows disconnect and prompt to reload, all extensions restart, and integrated terminals close. Continue?"; manual kinds show the warning "This editor's WSL server cannot be restarted automatically. {hint}" directly, without a modal.

## 6. Data model

- `globalState`:
  - `codex.accounts`: `Array<{ name, dir }>`, the list of non-default accounts.
  - `codex.ignoredDirs`: directories of accounts removed while keeping the directory; automatic scanning skips them.
  - `codex.labels`: per-account display names (aliases), `Record<string /*name*/, string /*label*/>`, keyed by account name; no entry means not set (the name is shown). The legacy single-value key `codex.defaultLabel` is migrated to `{ default: <old value> }` on first read and deleted. Stored and validated by the `LabelStore` in `labels.ts` with the same rules as on the Claude side (see design.md section 4): every registered account (including default) can have an alias, the external-directory row cannot; must not equal the name or label of another Codex account; display-only, the directory does not change; when adding an account the name must not equal the name or label of any Codex account; removing an account clears its alias. Independent of `claude.labels`; the same name is allowed on both sides.
- The selected account is whatever the state file says (shared across windows, the last writer wins).
- The directory actually effective in this window = the extension host's own `process.env.CODEX_HOME`, or `~/.codex` when empty. With remote type `wsl` the Codex extension does not rewrite it. The panel marks it as "current"; when it differs from the state file, "X selected; takes effect after restarting the server" is shown (X is the display name; an unregistered directory shows its path).
- Signed-in state: whether `<dir>/auth.json` exists.
- Email and plan (`readCodexAccountInfo`): when `auth.json` exists it is parsed as JSON; `auth_mode === 'apikey'` (when `auth_mode` is missing: `OPENAI_API_KEY` non-empty and no `tokens`) → plan `API key`, no email; otherwise only the second part of `tokens.id_token` is base64url-decoded (`decodeJwtPayload`, no signature check), taking `email` and `https://api.openai.com/auth`.`chatgpt_plan_type`; the plan is capitalized by `formatCodexPlan` (`prolite` → `Pro Lite`). A parse failure means unknown but still signed in. The function never returns or logs any raw token.

## 7. User interface

- The activity bar container "AI Account Switcher" ("AI 账号切换器") holds a single Webview view `aiSwitcher.accounts`, also named "AI Account Switcher"; the tab bar at the top of the panel switches between the Claude and Codex pages. The Codex page is a page rendered by the same `AccountsPanel` instance from the data provided by `codexPanelSource` (the current tab is stored in the memento `panel.activeTab`, see design.md 5.1). The frontend uses page-specific texts, all from the Webview i18n tables in the current UI language (see design.md 5.5).
- While not enabled, the Codex page only shows an explanation, the "Enable Codex switching" button and the "Tools" row.
- Once enabled the layout matches the Claude page: account list (current account pinned to the first row), "Tools" row, add input at the bottom; every non-external row also has a pencil icon for renaming (aliases stored per account in `codex.labels`).
- Differences:
  - Switch button → modal confirmation → write the state file → restart the server. There is no reload banner; when the state file and the effective directory differ, the top shows "X selected; takes effect after restarting the server" and a "Restart server" button.
  - Current and other rows: email and plan when there is an email (`Plus`, `Pro`, `Team`, `API key`, etc.); "Logged in" when signed in without email; "Not logged in" when signed out.
  - The "Log in" button of signed-out accounts runs `env CODEX_HOME='<dir>' codex login` in a terminal; alternatively switch and sign in directly in the Codex panel (the directory is empty, so no account is revoked).
  - The terminal icon of signed-in accounts runs `env CODEX_HOME='<dir>' codex`.
  - The current account cannot be removed.
  - The "Tools" row has `AGENTS.md` (opens `<effectiveDir()>/AGENTS.md`), the Codex extension settings (`chatgpt.`) and "Sync rules" (links `AGENTS.md` of the default account into the other Codex accounts).

## 8. Commands and flows

Command titles below are the English entries of `package.nls.json`; the category is "Codex Account" ("Codex 账号").

| Command id | Title | Behavior |
|---|---|---|
| `aiSwitcher.codex.enable` | Enable Codex Account Switching | Section 4 |
| `aiSwitcher.codex.disable` | Disable Codex Account Switching | Section 4 |
| `aiSwitcher.codex.switchAccount` | Switch Codex Account | QuickPick → 8.1 |
| `aiSwitcher.codex.addAccount` | Add Codex Account | `panel.focusAdd('codex')`: opens the panel, switches to the Codex tab and focuses the add input |
| `aiSwitcher.codex.removeAccount` | Delete Codex Account | QuickPick (without the current account) → 8.3 |
| `aiSwitcher.codex.openTerminal` | Run codex in Terminal with Codex Account | QuickPick → 8.4 |
| `aiSwitcher.codex.restartServer` | Restart WSL Server | Section 5, for when the state file has been changed but the server not yet restarted |

### 8.1 Switch

1. Return immediately when the target equals both the directory effective in this window and the content of the state file.
2. Report an error and return when the target directory does not exist.
3. Modal confirmation (text from section 5, depending on the editor kind).
4. Write the state file atomically (empty for the default account).
5. Automatic kinds: restart the server as in section 5; when the checks fail, show the manual method. Manual kinds: nothing more (the confirmation already showed the manual method).

### 8.2 Add

1. Name validation as on the Claude side: `^[A-Za-z0-9_-]+$`, not equal to `default`, not equal to the name or label of any Codex account, `~/.codex-<name>` not equal to `~/.codex` (compared after resolving symlinks).
2. Create `~/.codex-<name>` (0700).
3. Copy `config.toml` from `~/.codex` as a starting point (`copyCodexSeed`; an existing target is never overwritten, mode 0600). `AGENTS.md` is not copied; instead `linkGlobalRules(dir)` symlinks it to the default account's file (see "Shared global rules" in interfaces.md). If `config.toml` contains any of the following top-level keys it is not copied and the reason is explained: `forced_login_method`, `forced_chatgpt_workspace_id`, `sqlite_home`, `log_dir`, `model_provider`; a `[model_providers.` section also prevents copying. Nothing else is copied (including `packages/`; the CLI binary stays under `~/.codex/packages` and keeps working).
4. Register the account, refresh the view.

### 8.3 Remove

- The default account, the account effective in this window and the account the state file currently points to cannot be removed.
- Remove it from the list and record it in `codex.ignoredDirs`, clear its alias with `labels.remove(name)`; then confirm with a modal whether to delete the directory.
- Checks before deleting the directory: a direct child of the home directory; the basename matches `^\.codex-[A-Za-z0-9_-]+$`; not equal to `~/.codex` after resolving symlinks; not a symlink; no live daemon. Daemon check: read `daemon.pid`, `app-server.pid`, `daemon-updater.pid`, `app-server-updater.pid` under `<dir>/app-server-daemon/` (whichever exist); the content is JSON; take `pid` and `processStartTime`/`processIdentity.startTicks` and compare with the start time in `/proc/<pid>/stat`; a match means alive and deletion is refused; a missing file or parse failure counts as not alive. When the checks pass, delete with `fs.rm`.
- **Note: the daemon check depends on the JSON format of codex's pid files (field names `pid`, `processIdentity.startTicks` / `processStartTime`); re-verify after codex upgrades.**

### 8.4 Terminal

- `createTerminal({ name: "Codex (<display name>)" })`, sends `env CODEX_HOME='<dir>' codex` or the sign-in command. The default account sends `env -u CODEX_HOME codex`, which overrides both sources: an rc file export and inheritance from the server's cached environment. Terminal names are not localized.
- The view is refreshed when the terminal closes.

### 8.5 Rename an account

Panel `rename` message (with `dir` and `label`) → `panel.resolve('codex', dir)` finds the row (ignored when not found or when `kind === 'external'`; the external-directory row cannot be renamed) → `labels.validate(label, account.name, store.all().map(a => ({ name: a.name, label: labelFor(a.name, labels) })))`; on error `post({ type: 'renameResult', mode: 'codex', dir, error })`; when valid `labels.set(account.name, <trimmed value>)` (cleared when it equals the account's own name) → `panel.refresh()` → `post({ type: 'renameResult', mode: 'codex', dir })`. The directory does not change; validation only looks at Codex accounts, and the same name as on the Claude side is allowed.

## 9. Refresh triggers

- Creation, change or deletion of `auth.json` in each account directory (a change updates email and plan).
- State file changes (so the "takes effect after restart" banner shows up when another window switches).
- After adding or removing an account; after a terminal closes; when the refresh button is clicked.
- When `aiSwitcher.language` changes (the whole panel re-renders in the new language).

## 10. Code structure

```
src/codex/
  codexPaths.ts      default dir, account dirs, scan, read-only auth.json (email, plan),
                     seed config.toml copy, AGENTS.md link, delete checks (incl. daemon)
  codexState.ts      atomic state file I/O, rc marker block detect/write/remove,
                     pre-check, self-check
  codexServer.ts     detect the editor kind, locate, verify and restart the WSL-side server
  codexStore.ts      codex.accounts / codex.ignoredDirs
  codexCommands.ts   codexPanelSource; enable / disable / switch / add / remove / terminal /
                     restart / rename; handles Codex page messages
labels.ts            LabelStore (codex.labels, legacy codex.defaultLabel migrated) and labelFor,
                     shared with Claude
accountsPanel.ts     single instance, receives the { claude, codex } PanelSources; dispatches
                     messages by mode
i18n.ts              host i18n tables and t(), shared with Claude (used by the codex modules)
webview/main.ts      top tab bar; the Codex page renders state.codex with its own texts,
                     buttons and the disabled page
webview/i18n.ts      Webview i18n tables and t()
```

Logic shared with Claude (path safety checks, shQuote, avatars, global rules links, etc.) is extracted into shared functions without changing Claude's behavior.

## 11. Implementation order and verification

1. Implement and test sections 4 and 5 first:
   - the self-check passes after enabling;
   - switch using a temporary empty directory, terminate the server and confirm: the pty host and integrated terminals have exited, no server is left behind, Antigravity shows "Cannot reconnect", and after reloading the new extension host's `process.env.CODEX_HOME` equals the state file content and the environ of new codex processes contains that value;
   - after switching back to default, `CODEX_HOME` is empty in new terminals.
2. Then implement the UI and the commands.

## 12. Known limitations

1. Every Codex account switch restarts the WSL-side server: all WSL windows disconnect and each needs one "Reload Window" click; integrated terminals close. The restart is automatic only in Antigravity and VSCodium; in VS Code and unrecognized editors the user closes and reopens the windows.
2. The state file is global and the last writer wins; other windows switch as well after the server restarts.
3. Local data of each account (sessions, skills, prompts, memories, approval rules, etc.) is independent.
4. Relies on two behaviors: Antigravity resolves the extension host environment through a login shell, and the server is started again automatically after it dies. Both come from the upstream VS Code implementation and must be re-verified after upgrades.
5. `~/.profile` and `~/.bashrc` contain an extra marker block maintained by this extension; the disable command removes it.
6. Only bash is supported as the login shell; zsh must be configured manually; fish is not supported.
7. A leftover Codex instance on the Windows side is unrelated to this design and is not affected.
8. When an rc marker block has been damaged by hand (start marker, no end marker), both the enable and the disable command refuse and ask for a manual fix, without changing the files.

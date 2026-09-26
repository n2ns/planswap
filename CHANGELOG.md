# Change Log

## [Unreleased]

## [0.1.2] - 2026-09-26

### Fixed

- Double-clicking a button inside an account row no longer switches to that account; a double click on the switch button sends a single switch.
- Codex: a switch request is ignored while another switch is still waiting for confirmation.
- Codex: disabling no longer changes `~/.bashrc` when `~/.profile` has a broken marker block (and vice versa); neither file is changed.
- Codex: rolling back a failed enable keeps a symlinked `~/.bashrc` / `~/.profile` a symlink; enable followed by disable restores files without a trailing newline or with CRLF line endings exactly.
- Codex: blocked keys in `config.toml` are also detected as dotted keys, quoted keys, inline tables, `[model_providers]` and spaced table headers, and lines inside multi-line values are no longer mistaken for keys or headers.
- Account names such as `constructor` or `__proto__` no longer show a garbled display name, and their alias can be saved.
- Auto-discovery skips a directory whose name equals another account's display name.
- A directory deleted together with its account is discovered again if it is recreated later.
- The delete-directory prompt shows the account's display name instead of its internal name.
- Opening `CLAUDE.md` / `AGENTS.md` when it is a dangling symlink creates the link target instead of failing.
- Email and plan are read from `~/.claude/.claude.json` when the setting explicitly points `CLAUDE_CONFIG_DIR` at `~/.claude`.
- The "sign-in did not complete" warning after closing a terminal is only shown when the account is still signed out.
- An add error reported by the extension is no longer cleared by the next panel refresh.
- The version card follows a language change while it is open.
- Pressing Enter to confirm an IME candidate no longer submits the rename or add input.
- Smaller package: the icon is 256 × 256 and the README banner is compressed and no longer bundled.

## [0.1.1] - 2026-09-26

### Fixed

- **Codex server restart across editors**: the editor is detected from the WSL server's data directory under `~` (whitelist). Antigravity (`~/.antigravity-ide-server`) and VSCodium (`~/.vscodium-server`) keep the automatic restart. VS Code (`~/.vscode-server`) and unrecognized editors are never restarted automatically; switching and **Restart WSL Server** show manual instructions instead (close all windows connected to the distro, then reopen).
- The server commit is now read from the server's `product.json` instead of the command line.
- Confirmation and restart messages name the detected editor instead of always saying "Antigravity".
- Older Antigravity releases (`~/.antigravity-server`) are recognized as Antigravity.
- Editor detection no longer falls back to manual instructions when `$HOME` is reached through a symlink.

## [0.1.0] - 2026-09-26

Initial release. WSL/Linux only.

### Added

- **Claude Code account switching**: one configuration directory per account (`~/.claude` for `default`, `~/.claude-<name>` for others), switched by writing `CLAUDE_CONFIG_DIR` into `claudeCode.environmentVariables`. A banner offers **Reload Window** so open panels move to the new account.
- **Codex account switching**: one `CODEX_HOME` per account (`~/.codex` for `default`, `~/.codex-<name>` for others), selected through a state file and marker blocks in `~/.profile` and `~/.bashrc`. Enabling requires confirmation; a switch restarts the WSL server after a modal confirmation.
- **Sidebar panel**: Claude and Codex tabs with the current account pinned and highlighted, email and plan for signed-in accounts, inline add, rename, remove (with a separate confirmation before deleting a directory) and a terminal button that runs `claude` / `codex` with the account.
- **Display names**: per-account aliases that only change what is shown, never the directory.
- **Shared global rules**: new accounts link `CLAUDE.md` / `AGENTS.md` to the default account; **Sync rules** links the remaining accounts.
- **Tools**: open the global rules file or extension settings, show CLI and extension versions, reload the window, restart the extension host or the WSL server.
- **Auto-discovery** of existing `~/.claude-*` and `~/.codex-*` directories, and an "External directory" row when `CLAUDE_CONFIG_DIR` points to an unregistered directory.
- **Status bar** item showing the current Claude account.
- **English and Simplified Chinese UI** (`aiSwitcher.language`), switchable without reloading.

# Change Log

## [0.1.4] - 2026-09-27

### Added

- **Unlink** on linked account rows (Claude and Codex): after a confirmation and the busy check, the links are removed and the account gets its own copy of the default configuration (settings, rules, skills; Claude also the MCP servers). History and sessions stay in the default account; the account starts without any. The login stays.

### Fixed

- Upgrading from 0.1.0 - 0.1.3 (named ai-switcher) kept Codex switching working in the shell but showed it as disabled, and enabling again was refused because of the old block. The old `ai-switcher` marker blocks in `~/.bashrc` / `~/.profile` are now replaced in place on activation and the selected account moves from `~/.config/ai-switcher/codex-home` to `~/.config/planswap/codex-home`; no server restart is needed.
- A language chosen under the old setting `aiSwitcher.language` is carried over to `planswap.language` once.

### Changed

- Account lists, ignore lists and display names are now stored in `~/.config/planswap/state.json` inside the WSL distribution instead of VS Code's `globalState`, which lives on the Windows side and was shared by every distro (accounts of one distro showed up in, and were pruned by, another; aliases were mixed). Existing data is imported once on the first activation; the file is per distro and shared by every editor on it.
- Copying folders (creating an independent account, unlinking, moving files across file systems) no longer uses `fs.cpSync`, which terminated the extension host when a folder in the default directory could not be read; such a folder now produces an ordinary error message.
- Terminology: what the UI called a "shared account" is now a **linked account** (链接账号); independent accounts are unchanged. The add checkbox reads **Link to the default account's settings and history**, the row button **Link to the default account: …**, the badge "Linked to the default account's settings, rules, skills, history and sessions", the Tools row button **Re-link** (重新链接) and the Command Palette command **Re-link Accounts to the Default Account** (`planswap.tools.sync`). Confirmations, warnings and summaries use the same wording (e.g. "Re-linked N linked Claude account(s) to the default account.", "not linked for safety").
- The rename pencil moved from the row's button group to right after the account name. It appears when the row is hovered or focused and stays on the last line of a wrapped name.
- Renaming: a check-mark save button follows the input, and losing focus now saves instead of cancelling (Esc still cancels; an invalid name stays in edit mode with its reason). The card no longer shrinks while renaming.
- Switching the Claude account from the panel (switch button, double-click, Enter) now asks for confirmation first. The Command Palette switch is unchanged.

## [0.1.3] - 2026-09-27

### Added

- **Update CLI** in both tabs' Tools rows: runs `claude update` or `env -u CODEX_HOME codex update` in a visible terminal. The Codex command supports updating a default-home standalone installation after switching accounts.
- **User guide** and **Star** footer buttons that open the GitHub README and repository.
- A separate small version line below the footer buttons, populated from the extension manifest at build time.
- **Shared and independent accounts** (Claude and Codex): the add section has a **Share settings and history with the default account** checkbox, checked by default. A shared account symlinks everything except its sign-in to the default account's directory, including settings, rules, skills, history and sessions. You can switch when one account runs out of quota and keep working in the same sessions. Claude MCP servers and project trust settings are mirrored from the default account's `.claude.json`. Codex memories stay per account. An independent account gets a one-time copy of the default configuration and its MCP servers. Shared rows show a link badge.
- **Share with the default account** on independent account rows: after a confirmation and a check that no Claude Code / Codex process still uses the account, its history and settings are moved into the default account and replaced by links. Existing default files are never overwritten; files that differ are kept for manual merging.
- Shared accounts are re-linked (and, for Claude, their `.claude.json` mirrored) before switching to them. Problems only produce a warning.

### Changed

- The Tools row's **Sync rules** button and the Command Palette command **Sync Global Rules to Other Accounts** are replaced by **Sync shared** and **Sync Shared Accounts with the Default Account** (`planswap.tools.sync`). They re-link every shared account of the vendor and leave independent accounts untouched.
- New accounts no longer link only `CLAUDE.md` / `AGENTS.md`. A shared account links all shared entries, and an independent account gets a copy of them.
- Missing shared entries are created empty in `~/.claude` / `~/.codex` as link targets, and sharing an account moves its files there. Existing files of the default account are never overwritten.
- The `default` account can no longer be renamed on either tab; it is always shown as `default`, and an alias set earlier is ignored.

### Fixed

- An account whose directory was deleted or renamed outside the extension no longer stays in the list as a "Not logged in" row: it is removed, together with its alias, at startup and on refresh (Claude and Codex).
- Account names and aliases are checked for duplicates case-insensitively: `Work` can no longer be added or used as an alias next to `work`, and auto-discovery no longer registers `~/.claude-work` / `~/.codex-work` as a second account when `Work` exists.
- Claude: switching to an account whose directory does not exist is refused with an error, as it already was for Codex.
- Claude: sharing an independent account no longer aborts halfway when `~/.claude` has a dangling link such as `CLAUDE.md` or `settings.json`; the account's file is kept as `<file>.independent-backup`.
- Sharing an independent account leaves sockets and FIFOs inside shared folders in place instead of trying to move them into the default directory.
- The share confirmation now says where differing files end up: `.from-<name>` next to the default file inside shared folders, `<file>.independent-backup` in the account directory for top-level files (and, for Codex, the thread databases).

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
- **English and Simplified Chinese UI** (`planswap.language`), switchable without reloading.

# PlanSwap: Claude Code & Codex Account Switcher (WSL)

Switch Claude Code and Codex accounts from a sidebar in a VS Code WSL remote window. The Claude part rewrites the configuration directory used by the official Claude Code extension; the Codex part sets `CODEX_HOME` through the login shell so that the official Codex extension, the codex processes it starts, and the codex CLI in integrated terminals all use the selected account directory. The two parts are independent of each other.

The extension appears in the marketplace / extensions list as **PlanSwap: Claude Code & Codex Account Switcher** (identifier `planswap`). PlanSwap switches between the AI subscription plans you own (Claude Pro / Max, ChatGPT Plus / Pro…), each tied to its own account; the sidebar is titled **AI Account Switcher** ("AI 账号切换器" in the Chinese UI). The UI is available in English and Simplified Chinese (see "Language").

## Requirements

- VS Code on Windows, used through a WSL window opened with Remote - WSL. Only WSL/Linux is supported; native Windows and macOS are not.
- The official Claude Code extension is installed **on the WSL side** (not only locally on Windows).
- Only tested with claude.ai subscription sign-in (OAuth); API key sign-in has not been tested.
- VS Code or a VS Code-based editor with core version ≥ 1.107.0 (the main target editor is Antigravity IDE, whose core is 1.107.0).

## How it works

Every account has its own configuration directory: the default account is `~/.claude`, other accounts are `~/.claude-<name>`. When you switch accounts, this extension rewrites the `CLAUDE_CONFIG_DIR` entry in the official extension's setting `claudeCode.environmentVariables` (the entry is removed when switching back to the default account). The official extension reads this setting every time it starts a claude process, so after a switch **new sessions** use the sign-in credentials, settings and session history of the new directory. This extension never reads or writes any credential file and does not modify the contents of `~/.claude`.

## Build and install

```bash
npm install
npm run package      # type check + bundle, produces ai-switcher-<version>.vsix
```

Then, in a **WSL window**, open the Command Palette, run `Extensions: Install from VSIX...` and pick the generated `.vsix` file.

## Language

- The setting `aiSwitcher.language` chooses the UI language: `auto` (default, follows the VS Code display language: Chinese if it starts with `zh`, otherwise English), `en` (English) or `zh-cn` (简体中文).
- Changing the setting takes effect immediately for everything the extension renders at runtime: the sidebar panel re-renders, and the status bar, notifications, dialogs and QuickPick lists use the new language. No reload is needed.
- Command titles, command categories, the sidebar/view name and the setting descriptions are static strings in `package.json`, resolved by VS Code from `package.nls.json` / `package.nls.zh-cn.json` according to **VS Code's own display language**, not according to `aiSwitcher.language`. This is a platform limitation: to change them, change VS Code's display language (`Configure Display Language`).
- Shell commands, file names, setting ids, command ids, terminal names (`Claude (<label>)` / `Codex (<label>)`) and the rc marker block written to `~/.profile` / `~/.bashrc` are never translated.

## User interface

The "AI Account Switcher" icon in the activity bar opens the sidebar, which contains a single panel with the same name. A tab bar at the top of the panel switches between the **Claude** and **Codex** pages; the last selected tab is remembered. Each page contains, from top to bottom: a banner (only when needed), the "All accounts" list (the current account is pinned to the first row and highlighted), the "Tools" row (three buttons) and the add-account input; the `default` row always exists. A row of tool buttons shared by both pages is pinned to the very bottom of the panel (see "Tool buttons").

- Every row shows the account's display name, email and plan (such as `Max 20x`, `Pro`, `Plus`, `API key`); "Logged in" is shown when signed in but no email can be read, and a "Not logged in" tag is shown when not signed in. The current account's row shows an extra line with the directory path and a raised check-mark badge to the right of its name; the `default` row has a home badge at the bottom right of its avatar so it can still be recognized after renaming. The plan tag and the row outline are colored by plan tier (Pro / Plus blue, Max 5x / Pro Lite champagne gold, Max 20x / ChatGPT Pro gold gradient, Team teal, Enterprise slate, API key orange).
- In a narrow panel each row uses three lines (avatar and name / email / plan tags and buttons); when the panel is wide enough (≥ 340px) they merge into two lines with the button group on the right. Long names, emails and directories wrap automatically.
- Every registered account (including `default`) can be renamed, except the external-directory row: click the row's pencil icon, the name turns into an input, type and press Enter to submit (Esc cancels). The alias only affects display (sidebar, status bar, Command Palette pick lists, messages and terminal names); the directory and account name do not change. An alias must not be empty, must be at most 32 characters, must not contain line breaks, must not equal the external-directory name ("External directory" / "外部目录"), and must not equal the account name or display name of another account on the same page; entering the account's own name restores the default display. Later, when adding accounts, the new name also must not equal the account name or display name of any account on the same page. Aliases on the Claude and Codex pages are independent; the same alias may be used on both pages.

## Quick start (Claude)

1. Open the sidebar and switch to the Claude tab. The first row of the "All accounts" list is the current account (highlighted, with display name, email, plan and directory); the list always contains a `default` row (i.e. `~/.claude`). Email and plan come from `oauthAccount` in the account directory's `.claude.json` (`~/.claude.json` for the default account); they are read-only and never copied.
2. Type a name into the panel's "Add account" input (letters, digits, `_` and `-` only) and press Enter or click "Add". The extension creates `~/.claude-<name>`, copies the default account's settings, and symlinks `CLAUDE.md` to `~/.claude/CLAUDE.md`, so only one copy of the global rules exists (editing the rules under any account edits the same file). Existing accounts can get the link via the "Sync rules" button in the Claude page's "Tools" row. Invalid names are explained immediately below the input. You can also run "Claude Account: Add Account (Focus Sidebar Input)" from the Command Palette to jump to this input.
3. Sign in to the new account in either of two ways:
   - after switching to the account, the official Claude Code panel shows its sign-in screen automatically;
   - or click the row's "Log in" button and sign in by running `claude` in a terminal.
   Under WSL the browser callback often fails; pasting the code as prompted is normal.
4. Switch accounts: click the switch icon on the target row, or double-click the row (or select it with Tab and press Enter). A single click on the row does not switch.
5. After a switch a banner appears at the top of the panel: sessions that are already open still use the old account; click "Reload Window" to restart all panels with the new account, or close the banner with the button at its top right and decide later. If the sidebar is not open when you switch, a notification is shown instead.
6. Remove an account: click the row's trash icon and confirm inline; the extension then asks in a dialog whether to delete the account directory as well (it contains that account's credentials and session history). The `default` account cannot be removed.
7. The refresh button in the panel's title bar re-reads the sign-in state of every account and registers manually created `~/.claude-*` directories.

## Known limitations (Claude)

1. Sessions that are already open do not follow a switch. After a reload the panels start over with the new account; the old session history stays in the old account's directory and can be resumed after switching back.
2. A switch writes a machine-level setting shared by all WSL windows: switching in one window also changes the account for new sessions in other windows.
3. Right after a switch, the official panel header already shows the new account, while processes of open sessions still use the old account until a reload.
4. A new account directory's `settings.json` is copied from `~/.claude/settings.json` once, at creation time; afterwards they are independent and not synced.
5. Every account directory has its own workspace trust records and first-run onboarding.
6. If `CLAUDE_CONFIG_DIR` is exported in `~/.bashrc` or similar, the "default account" points to that directory instead of `~/.claude`.
7. Signing in from a terminal requires a `claude` command on PATH; signing in from the official panel does not.
8. When `claude` is run in a terminal for a non-default account, the `/ide` integration with VS Code is expected not to work; the official panel is not affected.
9. The extension depends on the official extension's current behavior for `claudeCode.environmentVariables`. If that behavior changes, switching stops working, but no credentials are damaged.

## Uninstall and rollback (Claude)

- Uninstalling the extension does not change any settings. To go back to the default account, open the WSL remote settings (the Remote [WSL] `settings.json`) and delete the entry whose `name` is `CLAUDE_CONFIG_DIR` from `claudeCode.environmentVariables`.
- Account directories `~/.claude-<name>` are never deleted automatically; delete the ones you no longer need manually (they contain that account's credentials and session history).

## Tool buttons

A row of icon buttons shared by both pages is pinned to the bottom of the panel (left to right): Show CLI and extension versions, Reload Window, Restart Extension Host, Restart WSL Server. "Show CLI and extension versions" expands a card above the toolbar that lists four versions: Claude Code CLI, Claude Code extension, Codex CLI and Codex extension (label on one line, value on the next); click the button again or click close to collapse it. Items that are not installed show "Not found".

Each tab page also has a "Tools" row with three labeled buttons: open the global `CLAUDE.md` (`AGENTS.md` on the Codex page; ruler icon; if the file does not exist you are asked whether to create it), open the corresponding extension's settings, and Sync rules (symlinks the default account's global rules file into the other account directories of this page; accounts that are already links are skipped, and accounts that keep their own file are listed in the message).

All of these are also available in the Command Palette under the category "AI Account Switcher" (Open settings and Sync rules first ask you to pick Claude Code / Codex; in the Command Palette the version information is shown as a read-only list). Even if the Codex part fails to initialize, the toolbar and the "Tools" rows keep working; only "Restart WSL Server" reports that Codex is not initialized.

## Codex account switching

This is the **Codex** tab of the "AI Account Switcher" sidebar panel. Every account has its own `CODEX_HOME` directory: the default account is `~/.codex`, other accounts are `~/.codex-<name>`.

Email and plan: this extension only reads each account directory's `auth.json` and only decodes the JWT payload of its `tokens.id_token` (signature not verified) to get the email and `chatgpt_plan_type`, shown as `Plus`, `Pro`, `Team` and so on; directories signed in with an API key show "API key". It never copies, swaps, caches or outputs any token, and does not modify the contents of `~/.codex`.

### Prerequisites

- The login shell is **bash** (the extension host's `SHELL` is bash). zsh is not configured automatically; fish is not supported.
- If `~/.bash_profile` or `~/.bash_login` exists, it must source `~/.bashrc`; otherwise the login shell does not read `~/.profile` and enabling is refused.
- `~/.profile` and `~/.bashrc` contain no `export CODEX_HOME=` of your own; if they do, it is treated as a conflict and enabling is refused.
- The editor is a **WSL remote window** of Antigravity IDE (this relies on two behaviors: Antigravity resolves the extension host environment through a login shell, and the WSL server is started again automatically after it exits).
- The official Codex extension is installed on the WSL side.

### Enabling

1. Switch to the Codex tab. While switching is not enabled, the account list and the add section are replaced by an explanation and an "Enable Codex switching" button (the "Tools" row is still shown); you can also run "Codex Account: Enable Codex Account Switching" from the Command Palette.
2. The extension first runs the pre-checks (the prerequisites above); if any fails, it shows the reason and stops.
3. If they pass, a modal confirmation shows what will be written: a marker block enclosed by `# >>> ai-switcher codex >>>` / `# <<< ai-switcher codex <<<` is written to both `~/.profile` and `~/.bashrc`. The block reads the selected directory from the state file `~/.config/ai-switcher/codex-home` and runs `export CODEX_HOME`; when the state file is empty or the directory does not exist it runs `unset CODEX_HOME`. In `~/.bashrc` the block is inserted before the interactive guard; in `~/.profile` it is appended to the end. The rc files and the state file are written atomically. The marker block is always written verbatim in English, regardless of the UI language.
4. After writing, a self-check runs automatically: it runs `bash -i -l` once with a temporary directory and a temporary state file and verifies `CODEX_HOME`. If the self-check fails, the marker blocks written in this run are rolled back and the reason is shown.
5. Once enabled, the Codex page switches to the same layout as the Claude page: account list, "Tools" row, add input; every account row (except the external-directory row) can be renamed as well.

When you add an account, the extension creates `~/.codex-<name>`, copies `config.toml` from `~/.codex` as a starting point, and symlinks `AGENTS.md` to the default account's file, so only one copy of the global rules exists (`auth.json`, `packages/` and everything else are not copied). `config.toml` is not copied if it contains one of the top-level keys `forced_login_method`, `forced_chatgpt_workspace_id`, `sqlite_home`, `log_dir`, `model_provider`, or a `[model_providers.` section; in that case a message explains why. Otherwise no message is shown after a successful add.

Signing in to a new account: click the row's "Log in" button to run `env CODEX_HOME='<dir>' codex login` in a terminal; or switch to the account and sign in directly in the Codex panel (the directory is empty, so no existing account's authorization is revoked).

### Switching and its cost

A Codex account switch only takes effect by restarting Antigravity's server inside WSL (the codex process reads `CODEX_HOME` once at startup, and the extension host environment is cached for the lifetime of the server; reloading a window does not resolve it again).

1. Click the switch icon on the target row (or double-click the row, or select it with Tab and press Enter). A modal confirmation appears: "Switching the Codex account restarts Antigravity's WSL server: all WSL windows disconnect and prompt to reload, all extensions restart, and integrated terminals close. Continue?"
2. After confirmation the extension writes the target directory to the state file, then terminates the WSL server and its leftover child processes (pty host, etc.).
3. **Every** WSL window shows "Cannot reconnect. Please reload the window."; click "Reload Window" once in each window. The new server resolves the environment again through a login shell, and `CODEX_HOME` points to the new directory.
4. Cost: all WSL windows disconnect, all extensions restart, and all integrated terminals close (programs running in terminals end as well, including Claude Code sessions).

If the extension cannot locate or verify the server process, it tells you to use the manual method. When the state file has been changed but the server has not been restarted yet, the top of the Codex page shows "X selected; takes effect after restarting the server" and a "Restart server" button; you can also run "Codex Account: Restart WSL Server" from the Command Palette.

### Manual method

Close all Antigravity windows connected to that WSL distribution, wait at least 5 minutes (the server exits 300 seconds after the last window disconnects), then open them again.

### Disabling and rollback

- Run "Codex Account: Disable Codex Account Switching" from the Command Palette: after a modal confirmation it removes the marker blocks from `~/.profile` and `~/.bashrc` and deletes the state file. `CODEX_HOME` in already open windows does not change until the next server restart.
- If a marker block has been damaged by hand (start marker without end marker), the disable command refuses, asks you to fix it manually, and does not change the files.
- Manual rollback: delete everything from `# >>> ai-switcher codex >>>` to `# <<< ai-switcher codex <<<` (including the marker lines) in both places and delete `~/.config/ai-switcher/codex-home`.
- Account directories `~/.codex-<name>` are never deleted automatically; delete the ones you no longer need by choosing "Delete Directory" when removing the account in the panel, or manually (they contain that account's credentials and session data).
- Uninstalling the extension does not change the rc files or the state file.

### Known limitations

1. Every Codex account switch restarts the server on the WSL side: all WSL windows disconnect and each needs one "Reload Window" click; integrated terminals close.
2. The state file is global and the last writer wins; other windows switch as well once the server restarts.
3. Local data of each account (sessions, skills, prompts, memories, approval rules, etc.) is independent.
4. Relies on two behaviors: Antigravity resolves the extension host environment through a login shell, and the server is started again automatically after it exits. Both come from the upstream VS Code implementation and must be re-verified after upgrades.
5. `~/.profile` and `~/.bashrc` contain an extra marker block maintained by this extension; the disable command removes it.
6. Only bash is supported as the login shell; zsh must be configured manually; fish is not supported.
7. A leftover Codex instance on the Windows side is unrelated to this design and is not affected.
8. If an rc marker block has been damaged by hand, the disable command refuses and asks you to fix it manually.

## License

[MIT](LICENSE)

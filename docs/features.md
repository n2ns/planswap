# Features

This document describes the extension's behavior feature by feature. The implementation is based on `docs/design.md` (design) and `docs/interfaces.md` (module contract). UI texts are quoted in English; the Chinese UI shows the equivalent `zh-cn` strings (see section 11).

## 1. Accounts and directories

| Account | Directory | Notes |
|---|---|---|
| `default` | `~/.claude`; if the extension host environment already has `CLAUDE_CONFIG_DIR`, that value wins | Always exists, cannot be removed |
| `<name>` | `~/.claude-<name>` | Created with "Add account", or registered by auto-discovery |

- The account list is stored in the extension's `globalState` under the `accounts` key; only non-default accounts (`{ name, dir }`) are stored, and the default account is always prepended at runtime.
- The **current account** is determined solely by the `CLAUDE_CONFIG_DIR` entry in `claudeCode.environmentVariables`:
  - Both the array form `[{ "name": ..., "value": ... }]` and the object form `{ "KEY": value }` are accepted; non-string values are converted to strings; an empty string counts as no entry.
  - No entry → the current account is the default account.
  - Entry present → the current directory is its value (compared after `path.resolve`).
  - The value does not correspond to any registered account (e.g. set by hand) → an "External directory" ("外部目录") row is appended to the list and marked current (pinned to the first row and highlighted).
- Email and plan come from `oauthAccount` in the account info file (usually `<dir>/.claude.json`, see section 6): the email is `emailAddress`; the plan is formatted from `organizationType` and `organizationRateLimitTier` (`claude_max` → `Max`, `claude_pro` → `Pro`, `claude_team`/`team` → `Team`, `claude_enterprise`/`enterprise` → `Enterprise`, other values lose the `claude_` prefix and are capitalized; a trailing `_<n>x` of the tier becomes `<n>x`; combined as e.g. `Max 20x`; nothing is shown when both are empty). Read-only, never copied. A missing, half-written or unparsable file counts as "unknown" without an error.
- Signed-in state: an email is the primary criterion; without an email, an existing `.credentials.json` also counts as signed in (only the file's existence is checked, its content is never read).
- **Shared and independent accounts**: every named account is either **shared** (everything except its login identity is symlinked to the default account's directory, so settings, rules, history and sessions carry over when you switch, e.g. because one account ran out of quota) or **independent** (the default account's configuration is copied once when the account is created; history and sessions stay separate). The choice is made when adding (see 2.5); an independent account can later be converted into a shared one (see 4.6), not the other way round. The mode is never stored: an account is shared when its `projects` entry is a symlink resolving to the default directory's `projects` (details in section 5).
- **Account display names (aliases)**: every named account can have an alias; the default row and the external-directory row cannot (the default account is always shown as `default`, and an alias stored for it by an earlier version is ignored). Aliases are stored by account name in `globalState` `claude.labels` (`Record<account name, alias>`); no entry means not set (the account name itself is shown). Aliases are display-only (sidebar, status bar, QuickPick, messages, terminal names); the directory and internal name do not change, and logic still uses the internal name and directory. How to set one: see 2.7; removing an account also clears its alias.

## 2. Sidebar

- A new account icon in the activity bar (container id `aiSwitcher`, title "AI Account Switcher" / "AI 账号切换器") containing **one** view, also named "AI Account Switcher" (view id `aiSwitcher.accounts`). These names follow VS Code's display language (see section 11).
- The sidebar is a Webview panel (changed from a native TreeView to a Webview); UI components come from @vscode-elements/elements, icons from @vscode/codicons; all colors follow the editor theme.
- **Tab bar**: two tab buttons at the top of the panel, Claude / Codex (segmented control style); the selected one is highlighted, and a click switches the page. The Claude page is what this section and sections 3–8 describe; the Codex page is in section 10. The frontend remembers the current tab (in the Webview's own state) and tells the host through a `setTab` message; the host stores it in the memento key `panel.activeTab` (default `claude`); the frontend only adopts the host's pushed `active` when it has no record of its own. The Command Palette's "add account" commands first switch to the corresponding tab and then focus the input.
- Each page contains, from top to bottom: banner (only when needed), all accounts list (the current account pinned to the first row and highlighted), "Tools" row (see 5.5), add-account section; the add inputs of the two pages keep independent state.
- Outside the tab pages, a toolbar shared by both pages and a separate extension version line below it are pinned to the bottom of the panel (see 5.5), with the content area scrolling above them; the version card, when expanded, sits directly above the toolbar.
- The default account row always exists.

### 2.1 Reload banner

- Only shown at the top of the panel when an account was switched in this window and the window has not been reloaded yet.
- Content: title "Switched to <account name>"; explanation "New sessions use the new account; open sessions still use the old one. After reloading, all panels start over with the new account."
- Button **Reload Window**: reloads the window immediately.
- Close button at the top right: only hides the banner, no reload.
- Another switch updates the banner to the new account name; the banner disappears after reloading the window.

### 2.2 Current account row

There is no separate "current account" card and no top card. The current account is pinned to the first position of the list and shown with an emphasized style: plan-colored gradient background, plan-colored outline, a 3px accent bar on the left and a drop shadow, a slightly larger bold name, and one more line than other rows with the directory path (monospace, home directory shown as `~`). At the right end of the name line there is a 16px raised round check-mark badge (accent gradient, top highlight, drop shadow, a ring of background color separating it from the card; title "Current account"); the text tag "Current" is no longer shown.

The colors of plan tags and row outlines unify the tiers of both vendors by price level, so different names map to the same color (the frontend maps the plan text to `data-plan`, and CSS picks the color; light and dark themes each have a set of values):

| Tier | Claude | ChatGPT / Codex | Color |
|---|---|---|---|
| Free | — | Free, Go | Neutral gray |
| Standard paid | Pro | Plus | Blue |
| Premium | Max (not 20x, e.g. Max 5x) | Pro Lite | Champagne gold (solid background + dark text) |
| Top | Max 20x | Pro | Amber-to-bright-gold gradient (gradient background + dark gold text + top highlight) |
| Team | Team | Team, Business | Teal |
| Enterprise | Enterprise | Enterprise | Slate |
| API key | — | API key | Orange |

Rows without a plan (signed out or unknown) use the normal outline. The plan tag is a 4px rounded pill (light background + plan-colored outline and text), distinct from the capsule-shaped "Not logged in" tag. The current badge always uses the accent color and does not follow the plan.

### 2.3 All accounts list

Title "All accounts"; the count badge next to it shows the number of rows (including the external-directory row).

Each row shows:

| Position | Content |
|---|---|
| Avatar | Uniform 20px circle with the first letter of the display name (uppercase), `?` for the external directory; the background is a theme chart color fixed per account name, so the same name always gets the same color; the avatar sticks to the top when the name spans several lines |
| Avatar badge | The default row has a small 12px `home` badge at the bottom right of its avatar (title "Default account") |
| Name | Display name, bold; the external-directory row shows "External directory"; the current row has the check-mark badge at the right end of its name line (see 2.2) |
| Shared badge | Shared accounts have a 16px flat round `link` badge right after the name (title "Shared with the default account"); independent accounts, the default row and the external-directory row have none |
| Email | The email when available; "Logged in" with a green dot when signed in without email; no line when signed out without email |
| Directory | Current row only, monospace, home directory shown as `~` |
| Tag group | Plan tag (when there is a plan, colors in 2.2); a "Not logged in" capsule tag when signed out |
| Sign-in hint | Rows that are signed out and not current additionally show `Click "Log in" to log in from a terminal, or switch and log in from the Claude panel` |
| Hover tooltips | Rows, names, emails, directories and plan tags have no tooltip; only buttons and badges do |

Adaptive layout (container query on the width of the panel content area, breakpoint 340px):

- Narrow panel (< 340px), three lines: avatar + name (+ check-mark badge) / email / tag group + button group; empty areas take no space.
- Wide panel (≥ 340px), two lines: avatar + name + tag group + button group / email; the button group is vertically centered on the right.
- Wrapping: names, emails, directories and hint texts that do not fit break anywhere (`overflow-wrap: anywhere`), with no horizontal scrolling; plan tags are single-line with ellipsis; the tag group itself can wrap.

The current row has the plan-colored gradient background and the left accent bar; other rows use the normal surface color with the outline following the plan color.

Row buttons are always shown (semi-transparent normally, fully opaque on mouse hover or when the row has focus):

| Button | Action | Shown when |
|---|---|---|
| `arrow-swap` switch to this account | Switch (see 4.1) | Non-current rows |
| `terminal` run claude with this account in a terminal | Open terminal (see 4.4) | Signed-in rows (including the external-directory row) |
| Text button "Log in" | Opens a terminal running claude to sign in (see 4.4) | Signed-out rows (including the external-directory row), always prominent |
| `trash` remove account | Enters the inline remove confirmation (see 4.3) | Only rows that are not default, not external and not current |
| Pencil icon "Rename" | Enters inline rename (see 2.7) | Named account rows only (not the default row or the external-directory row) |
| `link` "Share with the default account" | Converts the account into a shared one after a modal confirmation (see 4.6) | Independent named accounts that are not current |

Other interactions:

- Double-clicking a non-current row, or focusing a non-current row with Tab and pressing Enter, also switches to that account.
- A single click on the row does nothing, to avoid accidental actions; the current row is not focusable.

### 2.4 Inline remove confirmation

After clicking a row's remove button, the row turns into a confirmation area in place:

- Text "Remove <account name> from the list?";
- Hint "You will be asked separately whether to delete the account directory.";
- Buttons **Remove** / **Cancel**. Remove continues with the steps in 4.3; Cancel restores the row.
- If the account disappears from the list during the confirmation (e.g. removed elsewhere), the confirmation is cancelled automatically.

### 2.5 Add-account section

Always present at the bottom of each page (with a divider above it):

- Title "Add account", an input (placeholder "Account name, e.g. work") and an **Add** button (with the `add` icon) joined as a group; below it a checkbox "Share settings and history with the default account" (checked by default; its state is kept per page across list refreshes, like the typed text) and one help line.
- Typing is validated live with immediate hints (details in 4.2): an invalid name turns the input red and the help line shows the reason; the add button is disabled while the input is empty, invalid, being submitted, or showing an add failure reported by the extension. The disabled state still looks like a button: accent color mixed 40% with the input background + accent outline, text and plus sign still readable (dark accent text in light themes); the enabled state is solid accent, brighter on hover, with a glow ring on focus.
- The help line shows "Each account uses its own config directory ~/.claude-<name>" while the input is empty; for a valid name it follows the checkbox: "Will create ~/.claude-<name> sharing settings, history and memory with the default account" (checked; on the Codex page "Will create ~/.codex-<name> sharing settings, sessions and history with the default account (memories stay per account)") or "Will create ~/.claude-<name> with a copy of the default account's settings" (unchecked).
- Enter or the add button submits. On success the input is cleared; on failure the reason is shown in the help line and stays (also across list refreshes) until the input is edited or the display language changes.
- List refreshes do not affect the text already typed into the input or its focus.

### 2.6 Title bar button

Only one: `$(refresh)` refresh (`aiSwitcher.refresh`), which refreshes both the Claude and the Codex page.

### 2.7 Inline rename

After clicking the pencil icon of a named account row, the row's name turns into an input (prefilled with the current display name, fully selected); the edit state is keyed by the row's directory (`dir`), and only one row per page can be in edit state at a time. Edit state styling: the row outline turns to the accent color; the name line is wrapped in an opaque editor-background layer, the input uses the theme input background + accent outline and bold text, with a 1px outline plus a 3px glow when focused; when validation fails the outline and glow switch to the error color and the reason is shown in red inline. In edit state the row hides its button group and the check-mark badge.

- Enter submits `rename` (with `mode`, the row's `dir` and the new display name `label`); Esc cancels and restores the row; losing focus also cancels (except while waiting for the host's result).
- The extension first looks the row up by `dir` among the page's account rows and only accepts named accounts (the default row and the external-directory row cannot be renamed), then validates (the extension is authoritative, the frontend only gives immediate hints); on failure the reason is shown in red inline:
  - empty after trim: "Enter a display name";
  - more than 32 characters: "Display name can be at most 32 characters";
  - contains a line break: "Display name cannot contain line breaks";
  - equals the external-directory name (in either language): "Cannot use the reserved name <value>";
  - same as the account name of another account on this page: "Same as an existing account name";
  - same as the display name of another account on this page: "Same as an existing account's display name".
  The account itself is excluded from the checks, so entering its own account name or current alias passes; the same name is allowed across the Claude and Codex pages.
- When valid, the alias is written to `globalState` by account name (entering the account's own name clears the alias), the panel and the status bar are refreshed, and edit state ends; the list, the status bar and the QuickPick show the new alias right away.
- The directory and internal name do not change; the `default` row still cannot be removed.

## 3. Status bar

- On the left it shows `$(account) Claude: <display name of the current account>` (the alias for accounts that have one); when the current account is an external directory it shows `Claude: External directory` (localized).
- The first tooltip line is the email ("Not logged in" when there is none), followed by ` · <plan>` when there is a plan; the second line is the directory.
- A click opens the "AI Account Switcher" sidebar.
- It updates at the same times as the sidebar (see section 6), and also immediately when `aiSwitcher.language` changes.

## 4. Commands

All five commands appear in the Command Palette in the category "Claude Account" ("Claude 账号"). Buttons, double-clicks, inputs and other actions in the panel send messages directly to the extension to run the corresponding flow, without going through the Command Palette; when a command that needs an account (switch, remove, open terminal) is run from the Command Palette, a QuickPick asks for the account first (each item shows the display name, the email or "Not logged in", and the directory); when there is nothing to pick, "No accounts to choose from." is shown. Messages and terminal names always use the account's display name.

### 4.1 Switch account `aiSwitcher.switchAccount`

Entry points:

- Panel: the `arrow-swap` button of a non-current row; double-clicking a non-current row; focusing a non-current row and pressing Enter.
- Command Palette: a QuickPick of registered accounts that are not current (the external directory is not included).

Flow:

1. The target already is the current account → return without doing anything.
   When the target is a shared account, its links are first re-created or repaired and the default account's `.claude.json` is mirrored into it (as "Sync shared" does, see section 5); anything that needs attention (entries kept as the account's own, entries not shared for safety, errors) only shows the warning "Re-linking X to the default account reported: …", and the switch still happens.
2. Read `claudeCode.environmentVariables` and build a **new array**: keep all other entries, remove every `CLAUDE_CONFIG_DIR` entry; when the target is not the default account, append `{ "name": "CLAUDE_CONFIG_DIR", "value": "<absolute path>" }`. The path contains no `~` and no trailing slash. When the original value is in object form, it is written back as an array.
3. Write with `ConfigurationTarget.Global`. In a WSL window this writes to the WSL remote Machine settings.
4. When the write fails, an error is shown: "Switch failed. Possible causes: the official Claude Code extension is not installed on the WSL side, or the remote settings.json has a syntax error. Original error: <error>"
5. After a successful write **no notification is shown**: the reload banner appears at the top of the panel (see 2.1), and the status bar updates immediately.
6. If the sidebar panel is not visible at that moment (never opened or hidden), a notification is shown instead: "Switched to X. New sessions will use this account; sessions already open are still using the old account.", with the button **Reload Window**. Opening the panel later still shows the banner.
7. After switching to a signed-out account, the official panel shows its sign-in screen automatically and you can sign in directly (paste code under WSL).

After the official extension sees the `CLAUDE_CONFIG_DIR` change, it refreshes the account display of all panels about 1 second later; this is the official extension's own behavior.

### 4.2 Add account `aiSwitcher.addAccount`

Entry point: the add-account input at the bottom of the panel (see 2.5). The Command Palette's "Add Account (Focus Sidebar Input)" only opens the sidebar and puts the focus into that input; it does not show an input box.

Flow:

1. Type the account name into the input. The panel validates live with immediate hints:
   - only letters, digits, underscores and hyphens (`^[A-Za-z0-9_-]+$`);
   - the reserved name `default` cannot be used;
   - must not equal the account name or display name of an account already in the list.
2. After submission the extension validates the name with leading/trailing whitespace removed once more (the extension is authoritative); on failure the reason is shown in the help line:
   - empty: "Enter an account name";
   - invalid characters: "Only letters, digits, underscores and hyphens are allowed";
   - equals `default`: "Cannot use the reserved name default";
   - same as a registered account: "An account with this name already exists";
   - same as the current display name of any account on this page: "Same as an existing account's display name";
   - its directory is the same as the default directory: "This account directory is the same as the default account directory".
3. The directory `~/.claude-<name>` is created (mode 0700) if it does not exist; an existing one is reused as is, without clearing.
4. Depending on the checkbox (see "Shared and independent accounts" in section 5):
   - **shared** (checked): every shared entry is linked to the default directory (missing entries are first created empty in the default directory) and the default account's `.claude.json` is mirrored into `<new dir>/.claude.json`; when something could not be linked, the warning "Account X was created and shared, but: …" lists it;
   - **independent** (unchecked): the default account's configuration is copied once (stripped `settings.json`, `CLAUDE.md`, the configuration folders, the `skills` children and the user-level MCP servers).
   `.credentials.json` is never read, copied or linked. A failure of this step only shows the warning "Account X was created, but linking it to the default account failed: …" / "Account X was created, but copying the default account's configuration failed: …" and does not block.
5. If creating the directory fails (e.g. a regular file with the same name exists, or permissions are insufficient), the help line shows "Failed to create account directory: <reason>" and the account is not registered.
6. The account is registered in the list (the directory is removed from the ignore list if it was there), the panel and the status bar are refreshed, and an account info file watcher is added for the directory.
7. The input is cleared and the new account appears in the list. No follow-up message is shown after adding; to sign in, click the row's terminal button, or switch to the account and sign in from the official panel.

### 4.3 Delete account `aiSwitcher.removeAccount`

Entry points:

- Panel: the `trash` button of a row that is neither default nor external, via the inline confirmation (see 2.4).
- Command Palette: a QuickPick of non-default accounts.

The default account and the external directory cannot be removed.

Flow:

1. First confirmation:
   - panel entry: clicking **Remove** in the inline confirmation goes straight to the next step, without another dialog;
   - Command Palette entry: a modal confirmation "Delete account <account name>?" with the button **Delete**.
2. The current account cannot be removed: in the panel the current row has no remove button, and the Command Palette list does not contain the current account. To remove the current account, switch to another account first.
3. The account is removed from the list, its alias (if any) is cleared, the directory's file watcher is released, and the panel and the status bar are refreshed.
4. Deleting the directory is always confirmed again with a system modal (regardless of the entry point): "Account <account name> was removed from the list. Also delete directory <dir>?", with the button **Delete Directory**. The detail text: the directory contains the sign-in credentials and session history and cannot be recovered after deletion; and if you just switched away from this account without reloading, open sessions are still using this directory. For a shared account the detail reads instead: "This shared account's directory only holds its login credentials and account caches; its history, settings and other shared data live in the default account and are kept. The login cannot be recovered once deleted."
5. After confirmation, the safety checks run first (see section 7); if they pass the directory is deleted and removed from the ignore list again (so a directory recreated later with the same name is auto-discovered); if they fail or deletion errors, "Failed to delete directory: <reason>" is shown.

If you choose not to delete the directory, it stays on disk and is recorded in the ignore list, so auto-discovery will not register it again. Typing the same name into the add-account input later registers it again and removes it from the ignore list.

Deleting the directory of a shared account removes only its own files (credentials, `.claude.json`, account-only entries) and its symlinks; `fs.rm` does not follow symlinks, so the shared settings, history and sessions in the default directory are kept.

### 4.4 Run claude in a terminal as an account `aiSwitcher.openTerminal`

Entry points:

- Panel: the `terminal` button of every row (including the external-directory row).
- Command Palette: a QuickPick of registered accounts, also including the external directory when it is current.

Flow:

1. Create a terminal named `Claude (<account name>)`; for non-default accounts `CLAUDE_CONFIG_DIR=<dir>` is set in the terminal environment.
2. Send the command:
   - non-default account: `env CLAUDE_CONFIG_DIR='<absolute path>' claude`, which bypasses a possible `export CLAUDE_CONFIG_DIR` in rc files such as `~/.bashrc`; the terminal env parameter is a second safeguard.
   - default account: no variable is injected; `claude` is sent directly.
3. Show the terminal. The first run in a new directory goes through Claude Code's first-run onboarding; under WSL sign-in uses paste code.
4. When a terminal created by this extension closes, the panel and the status bar are refreshed; if it was neither the default account nor the external directory and the account is still not signed in (the same state the panel rows use: no email in its account info file and no `.credentials.json`, whose existence only is checked), the message "Login did not land in this directory: no login info found under <dir>. Check whether ~/.bashrc or similar overrides CLAUDE_CONFIG_DIR, or reopen the terminal and log in again." is shown.

Prerequisite: a `claude` command on PATH.

### 4.5 Refresh `aiSwitcher.refresh`

Entry points: the `$(refresh)` title bar button, the Command Palette. Scans the home directory and registers unregistered `~/.claude-*` directories (rules in section 5), re-reads each account directory's email, plan and sign-in state, redraws the panel and updates the status bar.

### 4.6 Share an independent account

Entry point: the `link` button "Share with the default account" of an independent named row that is not current (panel only, no Command Palette entry).

1. The extension resolves the row by `dir` and only accepts named accounts that are not already shared; the current account is refused with "Switch away from X before sharing it.".
2. Modal confirmation "Share X with the default account? Its history, memory, settings and other shared folders in <dir> are moved into the default account and replaced by links; the login stays. Files that differ from the default account's are kept next to them with a .from-<name> suffix for manual merging. This cannot be undone automatically.", button **Share**.
3. Busy check: when a Claude process is still running with this configuration directory (a `<dir>/sessions/<pid>.json` whose pid is alive and whose `/proc/<pid>/environ` has `CLAUDE_CONFIG_DIR` equal to the directory), the warning "Claude Code is still running with account X; close its sessions and try again." is shown and nothing changes.
4. Migration into the default directory (nothing is ever overwritten there):
   - shared folders (`projects`, `file-history`, `todos`, …) are merged recursively: files missing in the default directory are moved there, identical files are dropped, and a file that differs is moved next to the default one as `<file>.from-<account name>` for manual merging; the emptied account folder is then replaced by a link;
   - `history.jsonl`: the account's lines are appended to the default file;
   - `settings.json` / `CLAUDE.md`: when the default directory has no such file, the account's file is moved there and becomes the shared one (a `settings.json` with a login-related key stays in the account and is not linked); otherwise the default file wins: an identical account copy is dropped, a different one is renamed to `<file>.independent-backup` in the account directory (`settings.json` stays in place when the default settings cannot be shared, see section 5);
   - the children of `skills/` and `plugins/` (except `synced` and `.trash`) are merged the same way;
   - finally all links are created and the default account's `.claude.json` is mirrored.
5. The result is summarized in one notification "X is now shared with the default account. <summary>", where the summary lists files moved, identical files dropped, both versions kept ("merge manually"), backups, entries kept as the account's own and entries not shared for safety, or "Nothing needed manual attention."; an error stops the migration with "Sharing X stopped: <reason>" (what was already moved stays in the default directory).
6. The panel is refreshed; the row now shows the shared badge.

## 5. Auto-discovery, shared and independent accounts

### Auto-discovery of `~/.claude-*`

On activation and on refresh the home directory is scanned; a directory that meets all of the following conditions and is not in the account list is registered automatically:

- the basename matches `^\.claude-[A-Za-z0-9_-]+$`;
- it is a real directory, not a symlink;
- it is not the default directory (compared after resolving symlinks);
- it is not in the ignore list (directories kept when removing an account go into the ignore list);
- its name does not equal the display name (alias) of an existing account; such a directory is skipped until the conflicting alias is changed.

The account name is the basename without the `.claude-` prefix. This keeps the list from becoming empty when `globalState` is lost and also adopts manually created directories.

### Keys stripped when copying settings

When `settings.json` is copied from the default directory into a new independent account directory, the following keys are deleted (no effect if absent):

- under `env`: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CONFIG_DIR`
- top-level: `apiKeyHelper`, `forceLoginMethod`, `forceLoginOrgUUID`, `enabledPlugins`, `extraKnownMarketplaces`, `additionalMarketplaces`

The copy happens only once; afterwards the independent account's `settings.json` is its own.

### Shared accounts

A shared account keeps only its login identity (`.credentials.json`, `.claude.json`) and a few per-account entries; everything else is an absolute symlink to the same entry of the default directory:

- files: `settings.json`, `CLAUDE.md`, `history.jsonl`;
- folders: `projects`, `file-history`, `todos`, `session-env`, `shell-snapshots`, `sessions`, `tasks`, `uploads`, `agents`, `commands`, `output-styles`, `hooks`, `rules`, `ide`;
- per child: `skills/` and `plugins/` are real folders in the account, and every child of the default account's folder is linked into them, except `synced` and `.trash` (per-account cloud-synced buckets); links whose default child no longer exists are removed, and a whole-folder `skills` / `plugins` link from an earlier version is replaced by per-child links.

Rules:

- The account is shared when `projects` is a symlink resolving to the default `projects`; this marker is read from disk every time, never stored.
- A shared entry missing in the default directory is created empty there first (folder 0700; file 0600, `settings.json` with `{}`), so the link has a target. Existing default content is never modified by linking.
- An entry the account already has as a regular file or folder, or as a link pointing elsewhere, is left untouched and reported ("kept the account's own: …"); merge it by hand, delete the account's copy, then sync again. Exception: when Claude Code has replaced the `history.jsonl` link of a shared account by a regular file (e.g. `claude project purge` rewrites it), the next refresh appends the lines the default file lacks to it, removes the account's file and re-creates the link. Lines the purge removed stay in the shared default history, because the merge only appends. An independent account's own `history.jsonl` is not merged by syncing.
- `settings.json` is not linked ("not shared for safety") when the default settings are not a valid JSON object or contain a login-related key (top-level `apiKeyHelper`, `forceLoginMethod`, `forceLoginOrgUUID`, or `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CONFIG_DIR` under `env`).
- `.claude.json` is not linked (it holds the sign-in and onboarding state) but mirrored from the default account's `.claude.json` (usually `~/.claude.json`): `mcpServers` becomes an exact copy (servers removed from the default account are removed too), and for every project path of the default account the keys `allowedTools`, `mcpServers`, `enabledMcpjsonServers`, `disabledMcpjsonServers`, `mcpContextUris`, `hasTrustDialogAccepted`, `hasClaudeMdExternalIncludesApproved` and `hasClaudeMdExternalIncludesWarningShown` are copied; all other keys stay as they are. A missing file is created (0600); an existing one keeps its mode and is replaced atomically; nothing is written when nothing changed. A file that is not a JSON object, or that Claude Code rewrote while mirroring, is left unchanged and reported; an invalid default file stops the mirror ("The default account's info file is not a valid JSON object; nothing was synced").
- Links and the mirror are refreshed when adding the account, before switching to it (4.1), by "Sync shared" (5.5) and after converting it (4.6); there is no background sync.
- Running sessions keep their MCP list until a new session starts.

### Independent accounts

An independent account gets a one-time copy of the default account's configuration when it is created (nothing is overwritten, symlinks inside copied folders are copied as links): `settings.json` with the keys above stripped (0600), `CLAUDE.md`, the folders `agents`, `commands`, `output-styles`, `hooks`, `rules` (a folder that is itself a link is copied from its real location), the children of `skills/` except `synced` and `.trash`, and the user-level MCP servers of the default `.claude.json` (servers the account lacks are added, differing ones kept, nothing removed). History, sessions and projects stay separate. Later changes in the default account are not copied; "Sync shared" does not touch independent accounts.

For both modes `.credentials.json` is never read, copied or linked, so remote MCP servers that use OAuth must be authorized again in each account, and MCP `env` values (which may contain API keys) are copied in plain text into the other accounts' `.claude.json`.

## 5.5 Tool buttons

- **Footer toolbar pinned to the bottom of the panel** (outside the tab pages, always visible, shared by both pages): six icon buttons, left to right: Show CLI and extension versions (`info`), Reload Window (`refresh`, no confirmation), Restart Extension Host (`debug-restart`, no confirmation), Restart WSL Server (`server-process`, uses the Codex modal confirmation and checks, or the manual-restart warning in editors that cannot restart automatically, see 10.6; when Codex is not initialized: "The Codex part is not initialized; cannot restart the WSL server.").
- The last two footer buttons are User guide (`book`, Chinese "使用说明") and Star (`star-empty`). They open the GitHub README (`https://github.com/n2ns/planswap#readme`) and repository home (`https://github.com/n2ns/planswap`) in the external browser. Both pages share these buttons, including when Codex switching is disabled. Clicking Star only opens GitHub; the user stars the repository there.
- Below the footer toolbar, a separate centered small-text line shows the PlanSwap extension version (`v<version>`), sourced from `package.json` at build time. It stays visible on both tabs, including while Codex switching is disabled.
- **Version card**: after clicking "Show CLI and extension versions", the extension runs `claude --version` and `codex --version` in parallel (`execFile`, no shell, 8-second timeout), reads the versions of the two official extensions, and pushes them to the panel, which expands a card above the toolbar: title "CLI and extension versions" plus a close button, and below it four items `Claude Code CLI`, "Claude Code extension", `Codex CLI`, "Codex extension", each on two vertical lines (label on one line, value on the next, the value in monospace and wrappable). Clicking the info button again or close collapses it. Not installed shows "Not found", a timeout shows "Timed out", other failures show an error summary; no network access, no update check.
- **"Tools" row inside each tab page** (between the account list and the add-account section, title "Tools", labeled secondary buttons that wrap automatically when they do not fit, four on each page):
  - `CLAUDE.md` (Claude page) / `AGENTS.md` (Codex page), ruler icon `symbol-ruler`: opens `<current effective directory>/CLAUDE.md` or `<current effective directory>/AGENTS.md` (Claude uses `currentDir()`, Codex uses `effectiveDir()`); when the file does not exist, a modal asks "File does not exist. Create it?", and after confirmation an empty file (0600) is created and opened. When the file is a dangling symlink (e.g. to a deleted default rules file), the empty file is created at the link target so the link works again; if the target's directory does not exist, "Failed to create file: <reason>" is shown.
  - Settings, icon `settings-gear`: opens the Settings UI filtered by `claudeCode.` (Claude page) / `chatgpt.` (Codex page).
  - Sync shared, icon `sync` (Chinese label "同步共享账号"; title "Re-link every shared account to the default account and mirror its MCP servers" on the Claude page, "Re-link every shared account to the default account" on the Codex page): for every registered named account of this page that is shared, re-creates or repairs its links as when adding it and, on the Claude page, mirrors the default account's `.claude.json` (see "Shared accounts" in section 5; Codex: 10.12); independent accounts are not touched. With no shared accounts: "No shared Claude accounts to sync." (`Codex` on the Codex page). Otherwise one notification "Synced N shared Claude account(s) with the default account.", followed by "Needs attention: <name>: <notes>; …" (shown as a warning) when an account kept its own entries, had entries not shared for safety, or failed. The list uses each account's display name (the directory name when it is not registered). The "Tools" row is shown on the Codex page even while Codex switching is not enabled.
  - Update CLI, icon `cloud-download` (Chinese label "更新 CLI"): opens and shows a new integrated terminal named "Update Claude CLI" / "Update Codex CLI" (localized). Claude sends `claude update`; Codex sends `env -u CODEX_HOME codex update`, using the default home for this update process only so an account selected by PlanSwap does not affect standalone installation detection. The action does not change the selected account, shell startup files or extension-host environment. Progress, prompts and errors stay in the terminal; there is no pre-check or separate check button. This panel-only action is also available while Codex switching is disabled. It assumes a `claude` / `codex` command on PATH; the Codex workaround targets standalone installations under the default `~/.codex`.
- Command Palette entries (category "AI Account Switcher"): `aiSwitcher.tools.openClaudeMd` (open the global CLAUDE.md), `aiSwitcher.tools.openAgentsMd` (open the global AGENTS.md), `aiSwitcher.tools.openSettings` (open extension settings, first a QuickPick Claude Code / Codex), `aiSwitcher.tools.reloadWindow` (reload window), `aiSwitcher.tools.restartExtHost` (restart extension host), `aiSwitcher.tools.cliVersions` (show CLI and extension versions; the Command Palette entry uses a read-only QuickPick list instead of the panel card), `aiSwitcher.tools.sync` (Sync Shared Accounts with the Default Account, first a QuickPick Claude Code / Codex); restarting the WSL server reuses `aiSwitcher.codex.restartServer`.
- When the Codex part fails to initialize (see the beginning of section 10), the toolbar and the "Tools" rows of both pages keep working; only "Restart WSL Server" and the Codex page's "Sync shared" report that Codex is not initialized ("The Codex part is not initialized; cannot sync shared accounts.").

## 6. Refresh triggers

Location of the account info file: usually `<dir>/.claude.json`; for the default account without `CLAUDE_CONFIG_DIR` (neither in the extension host environment nor set explicitly to `~/.claude` in `claudeCode.environmentVariables`) it is `~/.claude.json`. `.claude.json` below always means this file.

The panel and the status bar refresh when:

- the `claudeCode.environmentVariables` setting changes (including writes by this extension, manual edits, and changes caused by switching in another window);
- the `.claude.json` of any account row in the panel (including the external-directory row) is created, changed or deleted (one file watcher per row, added and removed along with the rows);
- the sidebar panel becomes visible again (panel only);
- after adding or removing an account;
- a terminal created by this extension closes;
- the refresh button is clicked;
- the `aiSwitcher.language` setting changes (both are re-rendered in the new language).

## 7. Safety checks before deleting a directory

Before deleting a directory, the following are checked one by one; if any fails, deletion is refused with the reason:

1. `path.resolve(dir)` is a direct child of the home directory (`os.homedir()`), preventing an escape outside the home directory through a symlinked parent;
2. the basename matches `^\.claude-[A-Za-z0-9_-]+$`;
3. after resolving symlinks it does not point to the default directory;
4. `lstat` says it is not a symlink.

When they pass, it is deleted with Node's `fs.rm(dir, { recursive: true, force: true })`, never through a shell.

## 8. Multi-window behavior

- `claudeCode.environmentVariables` is a machine-level setting; all VS Code windows on the same WSL share the same value.
- After an account switch in any window:
  - new sessions in all windows use the new account;
  - the official panels of all windows refresh the account shown in their headers;
  - this extension's sidebar and status bar in other windows update when that window receives the setting-change event (not specifically verified across windows; click refresh if they do not update);
  - sessions already open in each window keep using the old account and each window must be reloaded separately. The reload banner (or the notification when the panel is not visible) only appears in the window that performed the switch.
- The account list lives in `globalState`; accounts added in one window are not guaranteed to show up in other windows immediately; click refresh or reload the window.
- `aiSwitcher.language` has `application` scope, so a change applies to every window.

## 9. Platform guard

- When activated on a non-Linux platform, only the warning "AI Account Switcher only supports WSL/Linux." is shown once; the sidebar, status bar and commands are not registered.
- The extension declares `extensionKind: ["workspace"]`, so in a WSL window it is installed and runs on the WSL side.

## 10. Codex account switching

Independent of Claude account switching. The implementation is based on `docs/codex-design.md` (design) and `docs/codex-interfaces.md` (module contract). This extension only reads each account directory's `auth.json` and only decodes the payload of its `tokens.id_token` to display the email and plan; it never copies, links, swaps, caches or outputs any token or `auth.json`. The contents of `~/.codex` are only changed for shared accounts (10.12): missing shared entries are created empty there as link targets, and converting an account moves its files in without overwriting existing ones.

If the Codex part fails to initialize on activation (e.g. an rc file is unreadable), this is only logged and Claude is not affected: the Codex page renders as "not enabled, no accounts"; account actions on the Codex page and the 7 `aiSwitcher.codex.*` commands then show "Codex account switching is unavailable: <reason>", while the toolbar and the "Tools" row work as usual (see 5.5).

### 10.1 Accounts and directories

| Account | Directory | Notes |
|---|---|---|
| `default` | `~/.codex` (fixed, ignores environment variables) | Always exists, cannot be removed; effective when the state file is empty |
| `<name>` | `~/.codex-<name>` | Created with "Add account", or registered by auto-discovery (same rules as section 5, basename matches `^\.codex-[A-Za-z0-9_-]+$`) |

- The account list is stored in `globalState` `codex.accounts`, the ignore list in `codex.ignoredDirs`, with the same semantics as on the Claude side (auto-discovery also skips a name equal to the display name of an existing Codex account; a deleted directory leaves the ignore list).
- The **selected account** is whatever the state file `~/.config/ai-switcher/codex-home` says (content is the absolute path of the directory, empty means the default account; shared across windows, the last writer wins).
- The **directory effective in this window** = the extension host's own `process.env.CODEX_HOME`, or `~/.codex` when empty. The panel marks it as "current". When the effective directory does not correspond to any registered account, an "External directory" row is appended to the list and marked current.
- Signed-in state: whether `<dir>/auth.json` exists.
- Email and plan: when `auth.json` exists it is read and parsed as JSON:
  - `auth_mode` is `apikey` (or `auth_mode` is missing, `OPENAI_API_KEY` is non-empty and there are no `tokens`) → the plan shows "API key", no email;
  - otherwise only the second part of the `tokens.id_token` JWT is decoded (base64url, no signature check), taking `email` and `https://api.openai.com/auth`.`chatgpt_plan_type` from the payload; the plan is capitalized (`plus` → `Plus`, `pro` → `Pro`, `team` → `Team`, etc.), `prolite` → `Pro Lite`;
  - when the JSON is damaged or being written, email and plan are unknown but the account still counts as signed in;
  - the raw `access_token`/`refresh_token`/`id_token` are never stored, cached or output.
- Every named Codex account is shared or independent, as on the Claude side (see 1); the marker is `sessions` (a symlink resolving to `~/.codex/sessions`), and the entries are listed in 10.12.
- Each account's display name (alias) is stored by account name in `globalState` `codex.labels`, with the same rules as on the Claude side (see 1 and 2.7); the aliases of both sides are independent, and the same name is allowed across Claude and Codex.

### 10.2 Codex tab in the sidebar

- **Disabled page**: when either `~/.profile` or `~/.bashrc` has no marker block, the Codex page's account list and add-account section are replaced by an explanation card (titled "Codex account switching is not enabled"; each account uses its own `CODEX_HOME` directory; the extension writes a marker block into `~/.profile` and `~/.bashrc`; switching requires restarting the editor's WSL server) and an **Enable Codex switching** button; the "Tools" row is still shown.
- Once enabled the layout matches the Claude page: all accounts list, "Tools" row, add-account section (every named account row has a pencil button for renaming), with these differences:
  - No reload banner; the `reload` and `dismissBanner` messages are ignored for Codex.
  - **"Takes effect after restart" banner**: when the directory in the state file differs from the directory effective in this window, the top shows "<display name> selected; takes effect after restarting the server" (an unregistered directory shows its path), with the explanation "Restarting the server disconnects all WSL windows (reload or reopen them); integrated terminals close." and a **Restart server** button. When another window switches, this window shows the banner as well through its state file watcher.
  - Current and other rows: email and plan when there is an email; "Logged in" when signed in without email (API key mode or decoding failure); "Not logged in" when signed out.
  - Rows that are signed out and not current show `Click "Log in" to log in from a terminal, or switch and log in from the Codex panel`.
  - The terminal icon's title is "Run codex with this account in a terminal", and the sign-in button's title is "Run codex login in a terminal".
  - The add section's help text uses `~/.codex-<name>`; the add section has the same shared checkbox (checked by default), and rows have the same shared badge and "Share with the default account" button as on the Claude page (conversion in 10.12).
  - The current (effective in this window) account row has no remove button.

### 10.3 Commands

Seven commands appear in the Command Palette in the category "Codex Account" ("Codex 账号"). Commands that need an account first show a QuickPick (each item shows the display name, "Logged in"/"Not logged in", and the directory); when there is nothing to pick, "No accounts to choose from." is shown. Messages and terminal names always use the display name.

| Command id | Title | Entry points and flow |
|---|---|---|
| `aiSwitcher.codex.enable` | Enable Codex Account Switching | Disabled-page button, Command Palette → 10.4 |
| `aiSwitcher.codex.disable` | Disable Codex Account Switching | Command Palette → 10.5 |
| `aiSwitcher.codex.switchAccount` | Switch Codex Account | Panel switch button/double-click/Enter, Command Palette QuickPick (without the account that is both effective and selected) → 10.6 |
| `aiSwitcher.codex.addAccount` | Add Codex Account | Opens the panel, switches to the Codex tab and focuses the add input → 10.7 |
| `aiSwitcher.codex.removeAccount` | Delete Codex Account | Panel trash button via inline confirmation, Command Palette QuickPick (without the effective and the selected account) → 10.8 |
| `aiSwitcher.codex.openTerminal` | Run codex in Terminal with Codex Account | Panel terminal/sign-in button, Command Palette QuickPick (also the external directory when it is current) → 10.9 |
| `aiSwitcher.codex.restartServer` | Restart WSL Server | Button of the "takes effect after restart" banner, Command Palette → Antigravity / VSCodium: modal confirmation "Restart {editor}'s WSL server: all WSL windows disconnect and prompt to reload, all extensions restart, and integrated terminals close. Continue?", then restart as in 10.6 step 5; VS Code / unrecognized editor: the warning "This editor's WSL server cannot be restarted automatically. {hint}" directly, without a modal |

### 10.4 Enable

1. Pre-checks; if any fails, an error lists all reasons and the flow returns:
   - the basename of the extension host's `SHELL` is `bash`;
   - `~/.bash_profile` and `~/.bash_login` do not exist, or their content contains `.bashrc`;
   - `~/.profile` and `~/.bashrc` contain no `export CODEX_HOME=` outside the marker block;
   - neither file contains a damaged block with "a start marker but no end marker" (`broken`).
2. Modal confirmation "The following marker block will be written to ~/.profile and ~/.bashrc to set CODEX_HOME in login shells. Continue?", with the full marker block in the detail and the button **Write**.
3. Write the marker blocks (see 10.11); files that already have a block are skipped. A write failure shows "Failed to write rc files: <reason>".
4. Self-check: back up the state file, create a temporary empty directory and point the state file to it, run `bash -i -l -c 'printf %s "$CODEX_HOME"'` (10-second timeout, take the last line of output) and compare with the temporary directory (or its realpath); restore the original state file and delete the temporary directory whether it succeeds or not.
5. Self-check failure: only the files newly written in this run are rolled back (files that already had a block before enabling are left alone), and "Self-check failed; rc files were rolled back: <details>" is shown.
6. Refresh the view.

### 10.5 Disable

1. Modal confirmation "The marker blocks in ~/.profile and ~/.bashrc will be removed and the selected Codex account cleared. CODEX_HOME in open windows does not change until the server restarts. Continue?", button **Disable**.
2. Remove both blocks by their markers; if any file has a start marker but no end marker, an error is thrown, no file is changed, "Failed to disable: <reason>" is shown and manual repair is required.
3. Delete the state file.
4. Refresh the view.

### 10.6 Switch

While another switch is in progress (e.g. its confirmation is still open), a further switch request (such as a double click) is ignored.

1. The target is both the directory effective in this window and the content of the state file → "X is already the current account." and return.
2. The target directory does not exist → error "Account directory does not exist: <dir>".
3. Detect the editor kind from the WSL server's data directory directly under `~` (whitelist): `~/.antigravity-ide-server` or `~/.antigravity-server` (older releases) → Antigravity, `~/.vscodium-server` → VSCodium (both restart automatically); `~/.vscode-server` → VS Code, anything else or a detection failure → unknown (both manual only). Modal confirmation, button **Continue**:
   - Antigravity / VSCodium: "Switching the Codex account restarts {editor}'s WSL server: all WSL windows disconnect and prompt to reload, all extensions restart, and integrated terminals close. Continue?" (`{editor}` is "Antigravity" or "VSCodium");
   - VS Code / unknown: "The new Codex account takes effect only after the WSL server restarts, which this editor cannot do automatically. {hint} Continue?" (`{hint}` is the manual method of step 5).
4. When the target is a shared account, its links are re-created or repaired first (10.12); anything that needs attention only shows the warning "Re-linking X to the default account reported: …", and the switch continues. Then write the state file atomically (empty for the default account); on failure "Failed to write the state file: <reason>" and return; refresh the view.
5. Restart the server. VS Code / unknown: nothing is signaled and no further message is shown, because the confirmation in step 3 already contained the manual method `{hint}`, which is "Close all VS Code windows connected to this distro, wait a few seconds, then reopen them." (VS Code) or "Close all editor windows connected to this distro, wait at least 5 minutes, then reopen them. If the account has still not changed, run "wsl --shutdown" in Windows (this stops all WSL distros) and reopen." (unknown). VS Code is manual because its Windows-side wslDaemon caches the resolved port: after the server is killed a reloaded window can receive a stale port while other windows keep the daemon alive; closing all VS Code windows connected to the distro makes the daemon exit (3 s) and stop the server, and reopening starts a new one. Antigravity / VSCodium: first locate and verify the server (the parent process `process.ppid` is greater than 1; its cmdline contains `out/server-main.js` and `--start-server` and its data directory is Antigravity's or VSCodium's; the top-level `commit` of the server root's `product.json` is 40 lowercase hex characters and matches the root directory name; the value in the pid file `<dataDir>/.<commit>.pid` equals the server's parent pid); when verification fails, a warning "Cannot restart the WSL server automatically: <reason>" is shown together with the manual method "Manual alternative: close all {editor} windows connected to this distro, wait at least 5 minutes, then reopen." When it passes, `SIGTERM` is sent to the server, then to every process in `/proc` whose parent is the server (excluding this extension host), one by one (`ESRCH` and `EPERM` are ignored), without waiting.
6. Afterwards (Antigravity / VSCodium) every WSL window shows "Cannot reconnect. Please reload the window.", and the user clicks "Reload Window" in each one.

### 10.7 Add

1. Name validation as in 4.2 (`^[A-Za-z0-9_-]+$`, not `default`, not equal to the account name or display name of any account on the Codex page, `~/.codex-<name>` not equal to `~/.codex` after resolving symlinks).
2. Create `~/.codex-<name>` (0700; reused if it exists). When this fails, the help line shows "Failed to create account directory: <reason>" and nothing is registered.
3. Depending on the shared checkbox (see 10.12):
   - **shared** (checked): every shared entry is linked to `~/.codex` (missing entries are first created empty there); when something could not be linked, the warning "Account X was created and shared, but: …" lists it (e.g. "not shared for safety: config.toml" when the default `config.toml` sets a login-related key);
   - **independent** (unchecked): `config.toml` is copied from `~/.codex` as a starting point (skipped when the target exists or the source does not; mode 0600), then `AGENTS.md` and `hooks.json` (0600), the folders `rules`, `hooks`, `agents`, `themes` and the children of `skills/` except `.system` are copied once, never overwriting. `config.toml` is not copied when it contains one of the top-level keys `forced_login_method`, `forced_chatgpt_workspace_id`, `sqlite_home`, `log_dir`, `model_provider`, or `model_providers` in any form (a `[model_providers]` / `[model_providers.x]` table, a dotted key `model_providers.x.base_url = …`, an inline table `model_providers = { … }`); quoted keys and whitespace around dots are recognized (`"model_provider" = …`, `[ model_providers.x ]`), a dotted key or table header counts when its first segment is blocked, comment lines are ignored, and keys after entering any other table are not top-level. A message is shown only when a file was not copied because of a blocked key/section: "Account X was created; the following files were not copied: …"; a missing source, an existing target and similar cases are silent.
   `auth.json` is never copied or linked. A failure of this step only shows the warning "Account X was created, but linking it to the default account failed: …" / "… but copying the default account's configuration failed: …" and does not block.
4. Register the account (removing it from the ignore list), refresh the view.

### 10.8 Remove

- Cannot be removed: the default account, the account effective in this window ("X is the account in effect in this window and cannot be deleted. Switch to another account first."), the account the state file currently points to ("X is the selected account waiting for a restart to take effect and cannot be deleted. Switch to another account first.").
- The panel entry goes straight to the next step after the inline confirmation; the Command Palette entry shows the modal "Delete Codex account X?", button **Delete**.
- Remove it from the list and record it in `codex.ignoredDirs`, clear the account's alias, refresh the view.
- Modal confirmation "Account X was removed from the list. Also delete directory <dir>?" (detail: the directory contains the account's credentials, sessions and local data and cannot be recovered after deletion; for a shared account: "This shared account's directory only holds its login credentials and account caches; its history, settings and other shared data live in the default account and are kept. The login cannot be recovered once deleted."), button **Delete Directory**.
- Safety checks for deleting the directory (`checkCodexSafeToDelete`); if any fails, deletion is refused with "Failed to delete directory: <reason>":
  1. `path.resolve(dir)` is a direct child of the home directory;
  2. the basename matches `^\.codex-[A-Za-z0-9_-]+$`;
  3. not equal to the default directory (neither directly nor after resolving symlinks);
  4. `lstat` says it is not a symlink and is a directory;
  5. **no live daemon**: read `daemon.pid`, `app-server.pid`, `daemon-updater.pid`, `app-server-updater.pid` under `<dir>/app-server-daemon/` (whichever exist); the content is JSON; take `pid` and `processIdentity.startTicks` (or `processStartTime` when missing) and compare with the start time in `/proc/<pid>/stat` (field 22); a match means the daemon is alive and deletion is refused; a missing file or parse failure counts as not alive.
- When the checks pass, it is deleted with Node's `fs.rm(dir, { recursive: true, force: true })`, never through a shell, and removed from `codex.ignoredDirs` again (a directory recreated later with the same name is auto-discovered).
- Deleting a shared account's directory removes only its own files and its symlinks (`fs.rm` does not follow symlinks); the shared sessions, history, settings and thread databases in `~/.codex` are kept.

### 10.9 Terminal

- Create a terminal named `Codex (<account name>)` and send:
  - non-default account: `env CODEX_HOME='<absolute path>' codex`; ` login` is appended when signed out.
  - default account: `env -u CODEX_HOME codex`, which overrides both sources: an rc file export and inheritance from the server's cached environment.
- When a terminal created by this extension closes, the view is refreshed. Prerequisite: a `codex` command on PATH.

### 10.10 Refresh triggers

- Creation, change or deletion of `auth.json` in the directory of each account row (including the external-directory row);
- creation, change or deletion of the state file `~/.config/ai-switcher/codex-home` (so the "takes effect after restart" banner shows up when another window switches);
- when the panel becomes visible again; after adding or removing an account; after a terminal created by this extension closes; when the refresh button is clicked (which also scans and registers unregistered `~/.codex-*`); when `aiSwitcher.language` changes.

### 10.11 State file and rc marker block

- State file: `~/.config/ai-switcher/codex-home`, directory 0700, file 0600. Content is the absolute path of the selected directory, or empty (default account). Atomic write: temporary file in the same directory + `fsync` + `rename` + directory `fsync`.
- The marker block is written to both `~/.profile` and `~/.bashrc` with the following content (login shells use the former, non-login interactive terminals the latter; when `~/.profile` sources `~/.bashrc` it runs twice, which is idempotent and harmless). The block is never localized; it is identical whatever the UI language:

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

- In `~/.bashrc` it is inserted before the interactive guard (the `case $- in` line) with a blank line added before the block; if no guard is found it is appended at the end. In `~/.profile` it is appended at the end. The files keep their original permissions; a missing file is created with 0644. The rc files are written atomically.
- When the state file is empty or the directory does not exist, the block runs `unset`, so after switching back to the default account new terminals do not inherit the old value cached by the server. Once enabled, this extension owns `CODEX_HOME` exclusively.
- Appending at the end adds a blank line before the block when the file ends with a newline, and only the missing newline otherwise.
- Removal deletes everything from the start marker to the end marker (including the marker lines) and the blank line (or newline) added on installation, so install + remove restores the original bytes of a file that existed before (a file created by enabling is left empty); when the end marker is missing in either file an error is thrown and neither file is changed.
- "Enabled" for the Codex page = both files have the marker block.

### 10.12 Shared and independent Codex accounts

Same model as on the Claude side (section 5), with the default directory `~/.codex`.

- **Shared entries** (absolute symlinks to the same entry of `~/.codex`):
  - files: `config.toml`, `AGENTS.md`, `hooks.json` (created with `{}` when missing), `history.jsonl`, `session_index.jsonl`;
  - thread databases, linked as single files even while the default one does not exist yet (Codex creates it at the link target; nothing is pre-created): `state_5.sqlite`, `thread_history_1.sqlite`, `goals_1.sqlite`, `queue_1.sqlite`; SQLite puts its `-wal` / `-shm` files next to the target;
  - `.tmp/rollout-maintenance.lock` (inside a real `.tmp` folder of the account; `.tmp` itself is never linked, and `~/.codex/.tmp` is created when missing), so two accounts do not maintain the shared rollouts at the same time;
  - folders: `sessions` (the marker), `archived_sessions`, `rules`, `hooks`, `agents`, `themes`, `thread-writer-locks`, `rollout-migrations`, `attachments`, `generated_images`, `shell_snapshots`, `tui-thread-reference-capabilities`;
  - per child: every child of `~/.codex/skills` except `.system`, and of `~/.codex/plugins/cache` except `openai-curated-remote`.
- **Never shared** (stay per account): `auth.json`, `memories/` and the memories databases (Codex refuses a symlinked memory root), logs, the app-server daemon files, caches, `installation_id`, `version.json`, the rest of `plugins/`, `.tmp/rollout-compression.lock` (Codex creates it with `O_EXCL`, which fails on a dangling link), and every other entry not listed above.
- `config.toml` is not linked ("not shared for safety") when the default config cannot be read or sets one of the top-level keys `model_provider`, `forced_login_method`, `forced_chatgpt_workspace_id`, `sqlite_home`, `log_dir`, `cli_auth_credentials_store`, `mcp_oauth_credentials_store`, `chatgpt_base_url`, `openai_base_url`, `profile`, `oss_provider`, or a `model_providers` / `profiles` table (same TOML detection as in 10.7).
- Repair: when Codex has replaced the `history.jsonl` or `session_index.jsonl` link of a shared account by a regular file (it rewrites `session_index.jsonl` by rename when a thread is deleted), the lines the default file lacks are appended to it, the account file is removed and the link re-created. A regular thread database in a shared account (after a Codex version bump or corruption recovery) is reported as kept and left untouched. Other entries the account has as its own are reported and left untouched, as on the Claude side.
- Links are refreshed when adding the account, after the switch confirmation (10.6), by "Sync shared" (5.5) and after converting it; there is no `.claude.json`-style mirror on the Codex side.
- **Independent accounts**: see 10.7 step 3.
- **Converting** an independent account (the row's `link` button; not for the account effective in this window or the selected account: "Switch away from X before sharing it."):
  1. Modal confirmation "Share X with the default account? Its sessions, history, settings, rules, skills and thread databases in <dir> are moved into the default account and replaced by links; the login and memories stay per account. Files that differ from the default account's are kept next to them with a .from-<name> suffix for manual merging. Resuming a session started by another ChatGPT account may be rejected by the server. This cannot be undone automatically.", button **Share**.
  2. Busy check: a live app-server daemon of the account (as in 10.8), or any process whose executable is named `codex` and whose `CODEX_HOME` (from `/proc/<pid>/environ`) resolves to the account directory → "Codex is still running with account X; close it (including the editor's Codex panel sessions) and try again." and nothing changes. Processes that merely inherit `CODEX_HOME` (shells, MCP servers) do not count.
  3. Migration into `~/.codex`, never overwriting: folders are merged as on the Claude side (differing files kept as `<file>.from-<account name>`); `history.jsonl` / `session_index.jsonl`: the lines the default file lacks are appended; `config.toml` / `AGENTS.md` / `hooks.json` / `.tmp/rollout-maintenance.lock`: when `~/.codex` lacks the file it is moved there and becomes the shared one (a `config.toml` with a login-related key stays in the account and is not linked); otherwise the default wins, an identical copy is dropped and a different one is renamed to `<file>.independent-backup` (`config.toml` stays when the default config cannot be shared); each thread database is renamed with its `-wal` / `-shm` files to `<db>.independent-backup` (Codex rebuilds thread metadata from the session files); the `skills` and `plugins/cache` children are merged; finally all links are created.
  4. Summary notification as on the Claude side (4.6 step 5), then the view is refreshed.

## 11. Language

- Setting `aiSwitcher.language` (scope `application`): `auto` (default) follows the VS Code display language (`zh-cn` when it starts with `zh`, otherwise `en`); `en` English; `zh-cn` 简体中文.
- Changing the setting takes effect immediately, without a reload, for everything rendered at runtime:
  - the sidebar panel re-renders completely in the new language: tabs, section titles, banners, buttons, tooltips, aria-labels, placeholders, the add-section help text, validation messages, the disabled Codex page, the "Tools" row, the footer toolbar titles and the version card;
  - the status bar text and tooltip ("Not logged in", "External directory");
  - notifications, warnings, errors, modal dialogs and their buttons, QuickPick items and placeholders, and error reasons produced by the extension (validation messages, safety-check reasons, pre-check reasons, restart errors).
- Command titles, command categories, the activity bar container and view names, and the setting's own description are static `package.json` strings resolved by VS Code from `package.nls.json` (English) / `package.nls.zh-cn.json` (Chinese) according to **VS Code's display language**; they do not follow `aiSwitcher.language` (platform limitation). Change VS Code's display language to change them.
- Never translated: shell commands sent to terminals, file names and paths, setting ids, command ids, terminal names `Claude (<label>)` / `Codex (<label>)`, plan names (`Pro`, `Max 20x`, `Plus`, `API key`, ...), and the rc marker block written to `~/.profile` / `~/.bashrc` (see 10.11).
- Aliases are user data and are shown as typed in every language. The external-directory name is reserved in both languages ("External directory" and "外部目录" are both rejected as aliases).

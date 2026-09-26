# Codex Module Interface Contract (shared during development; implementations must follow the signatures exactly)

Companion design: docs/codex-design.md (v6). For shared parts (full signatures of `protocol.ts`, `labels.ts`, `accountsPanel.ts`, `i18n.ts`), docs/interfaces.md is authoritative; this document only lists the Codex side. All files: TypeScript strict, ESM imports, Node built-in modules with the `node:` prefix. The host only depends on `vscode` and Node built-ins. User-visible text always goes through `t()` from `src/i18n.ts` (English / Simplified Chinese, see docs/interfaces.md); where this contract quotes a message it gives the English text. The rc marker block is never localized.

## src/codex/codexPaths.ts (no vscode import)

```ts
export const CODEX_DEFAULT_NAME = 'default';
export const CODEX_DIR_BASENAME_RE = /^\.codex-[A-Za-z0-9_-]+$/;
export interface CodexAccount { name: string; dir: string }        // dir is an absolute path after path.resolve

export function codexDefaultDir(): string;                          // path.resolve(os.homedir(), '.codex'), ignores environment variables
export function codexAccountDir(name: string): string;              // path.resolve(os.homedir(), '.codex-' + name)
export function codexLoggedIn(dir: string): boolean;                // <dir>/auth.json exists
export interface CodexAccountInfo { email?: string; plan?: string; loggedIn: boolean }
export function decodeJwtPayload(jwt: string): Record<string, unknown> | undefined; // only decodes the second JWT part (base64url → JSON), no signature check; any exception returns undefined
export function formatCodexPlan(planType?: string): string | undefined; // chatgpt_plan_type → capitalized (plus→Plus, pro→Pro, team→Team…), prolite→"Pro Lite"; empty returns undefined
export function readCodexAccountInfo(dir: string): CodexAccountInfo; // auth.json missing → { loggedIn: false }; present → loggedIn: true, and: auth_mode==='apikey', or auth_mode missing with non-empty OPENAI_API_KEY and no tokens → plan 'API key', no email; otherwise only the tokens.id_token payload is decoded for email and 'https://api.openai.com/auth'.chatgpt_plan_type (via formatCodexPlan); damaged JSON means unknown; never returns or logs the raw access_token/refresh_token/id_token
export function scanCodexDirs(): CodexAccount[];                    // real directories ~/.codex-* (not symlinks), excluding sameRealPath(codexDefaultDir())
export function ensureCodexDir(dir: string): void;                  // mkdir recursive 0700
export type { RulesLinkResult };                                    // re-exported from ../paths
export function linkGlobalRules(dir: string): RulesLinkResult;      // linkRulesFile(dir, codexDefaultDir(), 'AGENTS.md'); see "Shared global rules" in docs/interfaces.md
export interface CopyResult { copied: string[]; skipped: Array<{ file: string; reason: string }> }
export function copyCodexSeed(fromDir: string, toDir: string): CopyResult;
//   Only copies config.toml (skipped when the target exists, reason "target already exists"; skipped when the source is missing or unreadable); written with 0600 and flag 'wx'.
//   AGENTS.md is not copied; it is symlinked by linkGlobalRules.
//   When config.toml contains a top-level key forced_login_method / forced_chatgpt_workspace_id / sqlite_home / log_dir / model_provider (matched at line start, leading whitespace allowed, # comment lines ignored, keys after the first table header are not top-level),
//   or a "[model_providers." section, it is skipped and the reason names the matched key. Reasons are localized via t().
export function checkCodexSafeToDelete(dir: string): string | undefined;  // localized refusal reason or undefined; rules in design 8.3 (direct child, basename, not the default directory by realpath, not a symlink, no live daemon)
export function codexDaemonAlive(dir: string): boolean;             // the daemon check of design 8.3; missing file / parse failure returns false
export async function deleteCodexDir(dir: string): Promise<void>;   // checkCodexSafeToDelete first, throw when unsafe; fs.promises.rm recursive force
```
`samePath`, `sameRealPath` and `linkRulesFile` are reused from `../paths` (already exported there).

## src/codex/codexState.ts (no vscode import)

```ts
export const STATE_FILE = () => path.join(os.homedir(), '.config', 'ai-switcher', 'codex-home');
export function readSelectedDir(): string | undefined;             // state file content trimmed; non-empty → path.resolve; missing/empty → undefined
export function writeSelectedDir(dir: string | undefined): void;  // atomic write: directory 0700, temporary file 0600 + fsync + rename + directory fsync; undefined writes an empty file
export function effectiveDir(): string;                            // process.env.CODEX_HOME non-empty → path.resolve(it), otherwise codexDefaultDir()

export const RC_BEGIN = '# >>> ai-switcher codex >>>';
export const RC_END = '# <<< ai-switcher codex <<<';
export function rcBlock(): string;                                 // the block from design section 4 (with both markers, trailing newline); never localized
export interface RcFileStatus { file: string; hasBlock: boolean; broken: boolean; hasUserExport: boolean }
export function rcStatus(): RcFileStatus[];                        // checks ~/.profile and ~/.bashrc; hasUserExport = /^\s*export\s+CODEX_HOME=/ outside the marker block; broken = start marker without end marker (block damaged by hand)
export interface PreCheck { ok: boolean; reasons: string[] }
export function preCheck(): PreCheck;                              // pre-checks 1–3 of design section 4 (SHELL is bash; bash_profile/bash_login missing or containing ".bashrc"; no user export); a broken file is also reported (manual fix required); no modal confirmation; reasons localized via t()
export function installRcBlocks(): void;                           // writes both files: in ~/.bashrc before the interactive guard (/^\s*case\s+\$-\s+in/), appended at the end when not found; appended at the end of ~/.profile; skipped when a block exists; keeps the original mode, missing files created with 0644; atomic write (temporary file + rename)
export function removeRcBlocks(): void;                            // removes both blocks by their markers (including marker lines and the blank line added on installation); does nothing without a block; start marker without end marker → throw Error (localized reason) without changing the file; atomic write
export function selfCheck(): { ok: boolean; detail: string };      // creates a temporary empty directory + temporary state file content pointing to it, spawnSync('bash', ['-i','-l','-c','printf %s "$CODEX_HOME"'], {timeout: 10000}), compares the output; restores the original state file and deletes the temporary directory whether it succeeds or not
```
Note: selfCheck must first back up the original state file content (which may not exist) and restore it afterwards exactly (deleting it if it did not exist).

## src/codex/codexServer.ts (no vscode import)

```ts
export type ServerKind = 'antigravity' | 'vscodium' | 'vscode' | 'unknown';
export interface ServerPlan { serverPid: number; children: number[]; commit: string }
export function parseStatParentPid(statText: string): number;      // field 4 (parent pid) of /proc/<pid>/stat, parsed after the last ')' (comm may contain spaces and parentheses); throws when unparsable
export function parseServerRoot(cmdline: string): string | undefined; // the path before `/out/server-main.js` (first token ending with it, suffix stripped); undefined if absent
export function classifyDataDir(dataDir: string, home: string): ServerKind; // whitelist; dataDir must be exactly path.join(home, <name>): .antigravity-ide-server → 'antigravity', .vscodium-server → 'vscodium', .vscode-server / .vscode-server-insiders → 'vscode', otherwise 'unknown'
export function detectServerKind(): ServerKind;                    // process.ppid cmdline → root → dataDir = dirname(dirname(root)) → classifyDataDir(dataDir, os.homedir()); never throws, any failure → 'unknown'
export function canAutoRestart(kind: ServerKind): boolean;         // true only for 'antigravity' and 'vscodium'
export function readServerCommit(root: string): string;            // top-level `commit` of <root>/product.json; must be 40 lowercase hex, else throws t('server.noCommit')
export function readCmdline(pid: number): string;                  // /proc/<pid>/cmdline with \0 replaced by spaces
export function listChildren(parentPid: number): number[];         // numeric /proc entries with ppid === parentPid, excluding process.pid
export function planRestart(): ServerPlan;   // locating and checks of design section 5; any failure → throw Error(localized reason). children are the processes in /proc with ppid === serverPid and pid !== process.pid
export function executeRestart(plan: ServerPlan): void; // process.kill(serverPid,'SIGTERM'), then process.kill(pid,'SIGTERM') for each child (ESRCH and EPERM ignored, other errors thrown). No waiting. Only after a modal confirmation by the user; never in tests
```
`planRestart` checks, in order (each failure throws the localized error in parentheses):
1. `process.ppid <= 1` (`server.notFound`);
2. the cmdline contains `out/server-main.js` and `--start-server`, the root is parsed, and `canAutoRestart(classifyDataDir(dataDir, home))` (`server.unsupported` with `{cmdline}` = the first 120 characters: "Parent process is not a WSL server that supports automatic restart: {cmdline}");
3. `commit = readServerCommit(root)` (`server.noCommit`: "Cannot read the server commit from product.json");
4. `basename(root) === commit` or it ends with `-<commit>` (`server.noCommit`);
5. the pid file `<dataDir>/.<commit>.pid` is readable (`server.pidReadFailed` `{file}`) and equals the wrapper pid, i.e. field 4 of `/proc/<ppid>/stat` (`server.pidMismatch`).

Field 4 of `/proc/<ppid>/stat` is the parent pid (note that the comm field can contain spaces and parentheses, so parse after the last `)`). `server.statUnparseable` is kept. `parseCommitFromCmdline` and the former `server.notAntigravity` key are removed.

## src/codex/codexStore.ts (imports vscode only for the Memento type)

Same shape as `AccountStore` in `src/accounts.ts`, with the keys `codex.accounts` and `codex.ignoredDirs`, the default account `{ name: CODEX_DEFAULT_NAME, dir: codexDefaultDir() }`, and scanning via `scanCodexDirs()`. Class name `CodexAccountStore`, methods: `named() all() find(name) findByDir(dir) add(a) remove(name) syncWithDisk()`.

## src/protocol.ts

Full definition in docs/interfaces.md. Used on the Codex side: `PanelMode = 'codex'`; `PanelState.codex: TabState` (`enabled` means both rc files have the marker block; `pendingDir` is the display name when the directory in the state file differs from the directory effective in this window, the path for an unregistered directory); `PanelState.locale` (shared by both pages); `AccountView.email` / `plan` are filled by `readCodexAccountInfo` (`plan` is `'API key'` in API key mode); `enable` / `restartServer` of `FromWebview` only make sense for codex, `reload` / `dismissBanner` are ignored for codex; `rename` (with `dir`, `label`) and `renameResult` (with `dir`, optional `error`) are shared by both pages and dispatched by `mode`.

## src/accountsPanel.ts

Single instance, signatures in docs/interfaces.md. The Codex side only provides a data source:

```ts
// src/codex/codexCommands.ts
export function codexPanelSource(store: CodexAccountStore, labels: LabelStore): PanelSource;
//   accounts(): maps store.all() (kind, name, label via labelFor(a.name, labels), dir, dirLabel, ...readCodexAccountInfo(dir), isCurrent = samePath(dir, effectiveDir()));
//              when effectiveDir() does not correspond to any account, appends a current row with kind='external' (name EXTERNAL_NAME, label labelFor(EXTERNAL_NAME, labels), also using readCodexAccountInfo).
//   enabled(): rcStatus() reports hasBlock for both files.
//   pendingDir(): when readSelectedDir() ?? codexDefaultDir() differs from effectiveDir(), returns the display name of that directory's account, or the path if unregistered; undefined when equal.
//   watchTargets(): <dir>/auth.json of each row + STATE_FILE().
```
Messages with `mode === 'codex'` are dispatched to `panel.setHandler('codex', ...)`; `panel.resolve('codex', dir)`, `panel.accounts('codex')`, `panel.focusAdd('codex')`.

## src/webview/main.ts

When the top tab bar switches to Codex, the page is rendered from `state.codex`, with all texts from `src/webview/i18n.ts` in `state.locale`:
- `!enabled`: only the explanation (design section 7) and the "Enable Codex switching" button (sends `{type:'enable', mode:'codex'}`) plus the "Tools" row are rendered; the other blocks are hidden.
- No reload banner; when `pendingDir` is set, the top shows "X selected; takes effect after restarting the server" with a "Restart server" button (sends `{type:'restartServer', mode:'codex'}`); the add section's help text uses `~/.codex-<name>`; the sign-in button's title is "Run codex login in a terminal"; the terminal icon's title is "Run codex with this account in a terminal"; the signed-out hint is `Click "Log in" to log in from a terminal, or switch and log in from the Codex panel`.
- Current and other rows: email and `plan` when there is an `email`; "Logged in" when `loggedIn` without `email`; "Not logged in" when signed out.
- Pencil renaming of all non-external rows works as on the Claude page (`rename` with `dir`, `label`, edit state keyed by `dir`), with messages carrying `mode:'codex'`.
- The "Tools" row shows `AGENTS.md`, the Codex extension settings and "Sync rules" (`tool` messages with `mode:'codex'`).
- Claude page behavior is unchanged.

## src/codex/codexCommands.ts (imports vscode)

```ts
export interface CodexDeps { store: CodexAccountStore; panel: AccountsPanel; labels: LabelStore; tools: ToolDeps } // labels is codex.labels (legacy key codex.defaultLabel migrated automatically); tools is passed to runTool for Codex page tool messages
export function registerCodexCommands(deps: CodexDeps): vscode.Disposable[];
export function codexPanelSource(store: CodexAccountStore, labels: LabelStore): PanelSource;
export async function restartServerInteractive(): Promise<void>; // "Restart WSL Server" with modal confirmation, shared by the panel banner button, the Command Palette and the footer toolbar (ToolDeps.codexRestart)
```
Command ids and behavior in design section 8. QuickPick items, messages and terminal names always use `labelFor(a.name, labels)`; all texts come from `t()`. `validateName` adds "equals `labelFor(a.name, labels)` of any Codex account → 'Same as an existing account's display name'" (only Codex accounts are checked; the same name as on the Claude side is allowed). Panel messages (`panel.setHandler('codex', ...)`): `enable` → if preCheck fails, showErrorMessage(reasons); otherwise modal confirmation (showing rcBlock() verbatim) → installRcBlocks → selfCheck; on failure only the files newly written in this run are rolled back (files that already had a block before enabling are left alone) and an error is shown → refresh. `add` → ensureCodexDir → copyCodexSeed → linkGlobalRules (a failure only shows the warning "Account X was created, but linking the global AGENTS.md failed: …") → store.add; a message is shown only when copyCodexSeed skipped a file because of a blocked key/section; a missing source, an existing target and similar cases are silent; the result is `post({ type: 'addResult', mode: 'codex', error })`. `rename` → `panel.resolve('codex', dir)` finds the row with `kind !== 'external'` (otherwise ignored) → `labels.validate(label, account.name, store.all().map(a => ({ name: a.name, label: labelFor(a.name, labels) })))`; on error `post({ type: 'renameResult', mode: 'codex', dir, error })`, otherwise `labels.set(account.name, <trimmed value>)` (entry deleted when it equals `account.name`) → `panel.refresh()` → `post({ type: 'renameResult', mode: 'codex', dir })`. `remove` also calls `labels.remove(name)` besides `store.remove(name)`. `switch` → 8.1. `restartServer` → restartServerInteractive: kind = detectServerKind(); manual kind (`!canAutoRestart(kind)`) → showWarningMessage(t('codex.manualRestartRequired', {hint})) directly, no modal; otherwise modal confirmation `codex.restartConfirm` {editor}, then planRestart/executeRestart; when planRestart throws, showWarningMessage(reason + manualHint(kind)). Editor display name for a kind: `antigravity` → "Antigravity", `vscodium` → "VSCodium" (not localized). `manualHint(kind)`: `antigravity`/`vscodium` → `codex.manualRestartHint` {editor}, `vscode` → `codex.manualRestartHintVscode`, `unknown` → `codex.manualRestartHintUnknown`. `switch` confirmation: auto kind → `codex.switchConfirm` {editor}, manual kind → `codex.switchConfirmManual` {hint}; after writing the state file `restart()` shows `codex.manualRestartRequired` for manual kinds and returns false without signaling anything. `terminal`/`remove` follow the Claude logic but use the codex modules. `tool` → `runTool('codex', msg.tool, tools)`. `reload`/`dismissBanner` are ignored for codex. `aiSwitcher.codex.addAccount` → `panel.focusAdd('codex')`.

## src/extension.ts

See docs/interfaces.md: a single `AccountsPanel` whose `sources.codex` is `codexPanelSource(codexStore, codexLabels)`; when Codex initialization fails it degrades to an empty source (`enabled: () => false`), Claude is not affected, and `tool` messages of the Codex page still go through `runTool('codex', …)`; otherwise `registerCodexCommands({ store, panel, labels: codexLabels, tools })`, and `ToolDeps.codexRestart` is `restartServerInteractive`.

## package.json

- `viewsContainers.activitybar[0].title` and the view name are both "AI Account Switcher" (`%key%` placeholders; "AI 账号切换器" in `package.nls.zh-cn.json`).
- `views.aiSwitcher` has a single view `{ type: 'webview', id: 'aiSwitcher.accounts', name: <"AI Account Switcher"> }`; Codex is a tab inside that view and has no view id of its own.
- `commands` contains 7 `aiSwitcher.codex.*` entries (category "Codex Account", "Codex 账号" in Chinese; titles from `package.nls*.json`); the refresh button in `view/title` has `when: view == aiSwitcher.accounts`, and the existing `aiSwitcher.refresh` refreshes both stores and both pages.

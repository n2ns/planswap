# Module Interface Contract (shared during development; implementations must follow the signatures exactly)

All files live in `src/`, TypeScript strict, ESM-style imports.

- Extension host (`src/*.ts`): bundled by esbuild as cjs; Node built-in modules are imported with the `node:` prefix; may only depend on `vscode` and Node built-ins. Type-checked with the root `tsconfig.json` (which excludes `src/webview`).
- Webview frontend (`src/webview/`): bundled by esbuild as iife (browser); may only depend on `@vscode-elements/elements`, `@vscode/codicons` (CSS/font only) and types from `../protocol.ts`; must not import `vscode` or Node modules. Type-checked with `src/webview/tsconfig.json`.
- `src/protocol.ts` is shared by both sides, contains only types, and imports no runtime module.
- User-visible strings are never hard-coded: the host uses `t()` from `src/i18n.ts`, the Webview uses `t()` from `src/webview/i18n.ts` (see the i18n sections below). Where this contract quotes a message, it gives the English text of the corresponding i18n entry.

## src/i18n.ts (host i18n, no vscode import)

```ts
export type Locale = 'en' | 'zh-cn';
export function setLocale(l: Locale): void;
export function getLocale(): Locale;
export function t(key: MessageKey, params?: Record<string, string | number>): string; // `{name}` placeholders are replaced from params; unknown placeholders are left as is
export function translationsOf(key: MessageKey): string[]; // the message in every locale (used to reserve all localized external-directory names)
export const en: { ... };                                 // English table, the source of truth
export type MessageKey = keyof typeof en;
export const zhCn: Record<MessageKey, string>;            // Chinese table, exactly the same keys
```
- Contains two tables, `en` and `zhCn` (locale `zh-cn`). Because `zhCn` is typed `Record<MessageKey, string>`, it must have exactly the same keys as `en` (key-parity rule, enforced by the type checker). Keys are grouped by prefix (`common.*`, `account.*`, `ext.*`, `name.*`, `label.*`, `claude.*`, `codex.*`, `server.*`, `del.*`, `tools.*`).
- Has no `vscode` import, so the pure modules (`paths.ts`, `labels.ts`, `codex/codexPaths.ts`, `codex/codexState.ts`, `codex/codexServer.ts`) can use it for the reasons and errors they return or throw.
- Every user-visible host string goes through `t()`: messages, errors, warnings, modal text and buttons in `commands.ts`, `codex/codexCommands.ts`, `tools.ts`, `statusBar.ts`, `extension.ts`; reasons returned by pure modules (`paths.checkSafeToDelete`, `codexPaths.checkCodexSafeToDelete` / `copyCodexSeed` reasons, `codexState.preCheck` reasons and thrown errors, `codexServer.planRestart` errors, `labels.validate` messages); QuickPick labels and placeholders. Terminal names stay `Claude (<label>)` / `Codex (<label>)`.
- Never localized: the rc marker block text in `codexState.rcBlock()` (written to user files, byte-identical), shell commands, file names, setting ids, command ids.

## src/i18nVscode.ts (imports vscode)

```ts
export function resolveLocale(): Locale;                                    // aiSwitcher.language: 'en' / 'zh-cn' as is; 'auto' (default) → vscode.env.language starts with 'zh' ? 'zh-cn' : 'en'
export function watchLocale(onChange: () => void): vscode.Disposable;      // onDidChangeConfiguration affecting 'aiSwitcher.language' → setLocale(resolveLocale()), then onChange()
```

## package.json static strings and the language setting

- `displayName`, `description`, command titles and categories, view container and view names, configuration titles and descriptions are `%key%` placeholders resolved from `package.nls.json` (English) and `package.nls.zh-cn.json` (Chinese, same keys). VS Code resolves these by its own display language, not by `aiSwitcher.language` (platform limitation).
- English names: displayName "PlanSwap: Claude Code & Codex Account Switcher" (brand "PlanSwap" is permanent; the part after the colon grows as more AI tools are supported), identifier `planswap`; container and view title "AI Account Switcher"; command categories "Claude Account" / "Codex Account" / "AI Account Switcher". The Chinese file keeps the Chinese titles ("AI 账号切换器", "Claude 账号", "Codex 账号", ...).
- `contributes.configuration`: `aiSwitcher.language`, type string, enum `["auto", "en", "zh-cn"]`, default `"auto"`, scope `application`, enumDescriptions: auto = follow the VS Code display language; en = English; zh-cn = 简体中文.

## src/paths.ts (data layer, no vscode import)

```ts
export const DEFAULT_NAME = 'default';
export const NAME_RE = /^[A-Za-z0-9_-]+$/;
export const DIR_BASENAME_RE = /^\.claude-[A-Za-z0-9_-]+$/;

export interface Account { name: string; dir: string }          // dir is always an absolute path after path.resolve
export interface AccountInfo { email?: string; plan?: string; loggedIn: boolean } // plan is the formatted plan text (e.g. "Max 20x")

export function defaultDir(): string;                 // path.resolve(process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude'))
export function accountDir(name: string): string;     // path.resolve(os.homedir(), '.claude-' + name)
export function samePath(a: string, b: string): boolean; // strictly equal after path.resolve
export function sameRealPath(a: string, b: string): boolean; // compares after resolving symlinks; falls back to path.resolve when a path does not exist
export function claudeJsonPath(dir: string): string;  // account info file: ~/.claude.json when process.env.CLAUDE_CONFIG_DIR is not set and dir is ~/.claude, otherwise <dir>/.claude.json
export function formatClaudePlan(orgType?: string, tier?: string): string | undefined; // organizationType → name (claude_max→Max, claude_pro→Pro, claude_team/team→Team, claude_enterprise/enterprise→Enterprise, others lose the claude_ prefix and are capitalized); a trailing /_(\d+)x$/ of tier → "<n>x"; both combined as "Max 20x", only one → only that one, both empty → undefined
export function readAccountInfo(dir: string): AccountInfo; // synchronous; reads oauthAccount from claudeJsonPath(dir): email = emailAddress, plan = formatClaudePlan(organizationType, organizationRateLimitTier); never throws on parse failure / missing file; loggedIn = has email || <dir>/.credentials.json exists (email is the primary criterion)
export function scanAccountDirs(): Account[];          // scans real directories (not symlinks) under os.homedir() whose basename matches DIR_BASENAME_RE, excluding sameRealPath(defaultDir()); name = basename without '.claude-'
export function copySettingsStripped(fromDir: string, toDir: string): boolean; // see design.md 6.2 step 5; returns false when the source is missing or the target already has settings.json; writes with mode 0o600
export function ensureAccountDir(dir: string): void;   // mkdir recursive, mode 0o700
export type RulesLinkResult = 'linked' | 'already-linked' | 'kept-own-file' | 'skipped-default';
export function linkRulesFile(dir: string, defDir: string, file: string): RulesLinkResult; // shared by Claude and Codex: sameRealPath(dir, defDir) → 'skipped-default'; if <defDir>/file does not exist, first create an empty file with 0600; <dir>/file missing → symlink to the absolute path of the default file → 'linked'; already a link to the default file → 'already-linked'; a regular file or a link pointing elsewhere → left alone → 'kept-own-file'; lstat errors other than ENOENT are rethrown as is
export function linkGlobalRules(dir: string): RulesLinkResult; // linkRulesFile(dir, defaultDir(), 'CLAUDE.md')
export function checkSafeToDelete(dir: string): string | undefined; // returns the refusal reason (localized via t()), undefined when safe; rules in design.md 6.3 step 6
export async function deleteAccountDir(dir: string): Promise<void>; // checkSafeToDelete first, throw Error(reason) when unsafe; fs.promises.rm recursive force
```

## src/claudeSettings.ts (imports vscode)

```ts

export function currentDir(): string;                         // CLAUDE_CONFIG_DIR from the setting (array and object forms accepted, empty string counts as missing) ?? defaultDir()
export async function setConfigDir(dir: string | undefined): Promise<void>; // builds a new array (never mutates the get() result), keeps other entries, removes all CLAUDE_CONFIG_DIR entries; appends {name, value: path.resolve(dir)} when dir is defined and not samePath(defaultDir()); object form converted to an array; await update(..., ConfigurationTarget.Global). Errors are rethrown as is
export function affectsSetting(e: vscode.ConfigurationChangeEvent): boolean; // e.affectsConfiguration('claudeCode.environmentVariables')
```

## src/accounts.ts (imports vscode only for the Memento type)

```ts
import type { Account } from './paths';
export class AccountStore {
  constructor(state: vscode.Memento);
  named(): Account[];                 // non-default accounts in globalState 'accounts', sorted by name
  all(): Account[];                   // [{name: DEFAULT_NAME, dir: defaultDir()}, ...named()]
  find(name: string): Account | undefined;   // searches all()
  findByDir(dir: string): Account | undefined; // samePath match in all()
  add(account: Account): Promise<void>;       // also removes the directory from globalState 'ignoredDirs'
  remove(name: string): Promise<void>;        // also records the directory in 'ignoredDirs'
  syncWithDisk(): Promise<void>;       // adds entries of scanAccountDirs() that are not registered and not in 'ignoredDirs'
}
```

## src/labels.ts (depends only on the vscode Memento type)

```ts
export const EXTERNAL_NAME = '<external>'; // internal sentinel name of the external-directory row; never displayed; '<' cannot pass NAME_RE

export class LabelStore {
  constructor(state: vscode.Memento, key: 'claude.labels' | 'codex.labels', legacyKey: 'claude.defaultLabel' | 'codex.defaultLabel');
  // storage: globalState[key] is Record<string /*name*/, string /*label*/>, keyed by account name;
  // on first read, if key does not exist and legacyKey has a value, migrate it to { default: <old value> } and delete legacyKey
  get(name: string): string | undefined;                       // undefined when not set
  set(name: string, label: string | undefined): Promise<void>; // undefined / empty / equal to name → delete the entry
  remove(name: string): Promise<void>;                         // called when an account is removed, equivalent to set(name, undefined)
  validate(label: string, name: string, existing: Array<{ name: string; label: string }>): string | undefined;
  //   returns a localized error message or undefined: empty after trim 'Enter a display name'; > 32 characters 'Display name can be at most 32 characters'; contains a line break 'Display name cannot contain line breaks';
  //   equals EXTERNAL_NAME or any of translationsOf('account.external') ("External directory" / "外部目录") 'Cannot use the reserved name <value>';
  //   after excluding name itself from existing: equals another account's name 'Same as an existing account name', equals another account's label 'Same as an existing account's display name'.
  //   existing only contains accounts of the same vendor (same key); the same name is allowed across Claude and Codex; entering the account's own name passes (set deletes the entry, i.e. clears the alias)
}
export function labelFor(name: string, labels: LabelStore): string; // name === EXTERNAL_NAME → t('account.external'); otherwise labels.get(name) ?? name
```
External-directory rows never have an alias; their `name` is `EXTERNAL_NAME` and their `label` is `labelFor(EXTERNAL_NAME, labels)`, i.e. `t('account.external')` ("External directory" / "外部目录").

## src/protocol.ts (shared by both sides, types only)

```ts
export type AccountKind = 'default' | 'named' | 'external';
export type PanelMode = 'claude' | 'codex';
export type ToolId = 'openGlobalMd' | 'openSettings' | 'reloadWindow' | 'restartExtHost' | 'restartServer' | 'cliVersions' | 'syncRules';

export interface AccountView {
  kind: AccountKind;
  name: string;        // internal name (default / name derived from the directory / EXTERNAL_NAME), used for logic
  label: string;       // display name: labelFor(name, labels), equal to name when no alias is set; the localized external-directory name for the external row
  dir: string;         // absolute path, used as the account identifier in messages
  dirLabel: string;    // for display, home directory replaced by ~
  email?: string;
  plan?: string;       // formatted plan (e.g. "Max 20x", "Plus", "API key")
  loggedIn: boolean;
  isCurrent: boolean;
}

export interface TabState {
  enabled: boolean;          // false when codex is not enabled; always true for claude
  accounts: AccountView[];
  switchedTo?: string;       // claude only: shows the reload banner, value is the display name
  pendingDir?: string;       // codex only: selected but not restarted, value is the display name (path for an unregistered directory)
}

export interface PanelState { active: PanelMode; locale: Locale; claude: TabState; codex: TabState } // locale: 'en' | 'zh-cn', filled by the host from getLocale()

export type ToWebview =
  | { type: 'state'; state: PanelState }
  | { type: 'addResult'; mode: PanelMode; error?: string }     // error undefined means success
  | { type: 'renameResult'; mode: PanelMode; dir: string; error?: string } // dir is the renamed row's directory; error undefined means success
  | { type: 'focusAdd'; mode: PanelMode }                     // the frontend switches to that tab and focuses the input
  | { type: 'versions'; items: Array<{ label: string; value: string }> }; // CLI and extension versions, shown by the frontend as a card above the footer toolbar

export type FromWebview =
  | { type: 'ready' }
  | { type: 'setTab'; mode: PanelMode }                       // the user clicked a tab; the host remembers it
  | { type: 'switch'; mode: PanelMode; dir: string }
  | { type: 'terminal'; mode: PanelMode; dir: string }
  | { type: 'remove'; mode: PanelMode; dir: string }          // the frontend has completed the inline confirmation
  | { type: 'add'; mode: PanelMode; name: string }
  | { type: 'rename'; mode: PanelMode; dir: string; label: string } // renames that row's account; never sent for the external row
  | { type: 'reload'; mode: PanelMode }
  | { type: 'dismissBanner'; mode: PanelMode }
  | { type: 'enable'; mode: PanelMode }
  | { type: 'restartServer'; mode: PanelMode }
  | { type: 'tool'; mode: PanelMode; tool: ToolId };          // toolbar / per-page "Tools" row buttons; for the footer toolbar mode is the current tab
```
`Locale` is imported with `import type { Locale } from './i18n'` (a type-only import, erased at build time), so `protocol.ts` still imports no runtime module.

## src/accountsPanel.ts

```ts
export const VIEW_ID = 'aiSwitcher.accounts';

export interface PanelSource {
  accounts(): AccountView[];      // each implementation handles the external-directory row itself; label / email / plan already filled in
  enabled(): boolean;
  pendingDir(): string | undefined;   // display name
  watchTargets(): string[];       // absolute paths of the files to watch (claude: claudeJsonPath of each directory; codex: auth.json of each directory + the state file)
}
export function claudePanelSource(store: AccountStore, labels: LabelStore): PanelSource; // maps store.all() (label via labelFor(name, labels), email/plan via readAccountInfo); when currentDir() does not correspond to any account, appends a current row with kind='external' (name EXTERNAL_NAME, label labelFor(EXTERNAL_NAME, labels)); enabled always true; pendingDir always undefined
export function tildify(dir: string): string;  // replaces the home directory with ~

export class AccountsPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  constructor(extensionUri: vscode.Uri, sources: { claude: PanelSource; codex: PanelSource }, memento: vscode.Memento); // single instance; syncs file watchers immediately in the constructor
  readonly onDidChange: vscode.Event<void>;  // fires on every panel state push (including file watcher events), so the status bar can sync
  setHandler(mode: PanelMode, handler: (msg: FromWebview) => void | Promise<void>): void; // every message except ready / setTab is dispatched by msg.mode
  get visible(): boolean;                    // the panel is resolved and currently visible
  get activeTab(): PanelMode;                // memento key 'panel.activeTab', default 'claude'
  accounts(mode: PanelMode): AccountView[];  // sources[mode].accounts()
  resolve(mode: PanelMode, dir: string): (Account & { kind: AccountKind }) | undefined; // only searches accounts(mode) with samePath
  setSwitchedTo(label: string | undefined): void; // claude only: sets/clears the banner state and calls refresh()
  refresh(): void;                           // both pages: sync file watchers + push the full PanelState
  post(msg: ToWebview): void;                // silently dropped when the panel is not resolved
  focusAdd(mode: PanelMode): void;           // after executeCommand(`${VIEW_ID}.focus`): if ready, post({ type: 'focusAdd', mode }), otherwise queue it until ready
  resolveWebviewView(view: vscode.WebviewView): void;
  dispose(): void;
}
```
- `resolveWebviewView`: `enableScripts: true`, `localResourceRoots: [<extension>/dist/media]`; the HTML references `codicon.css` (the `<link>` id must be `vscode-codicon-stylesheet`), `panel-style.css` and `panel.js` (with nonce); on `ready` it pushes the state and handles a queued focusAdd; `setTab` only writes the memento, without pushing; it pushes the state when the panel becomes visible; when the panel is disposed it clears the reference and the ready flag.
- CSP: `default-src 'none'; font-src <cspSource>; style-src <cspSource> 'unsafe-inline'; script-src 'nonce-<nonce>'`; the nonce is the base64 of `randomBytes(16)`, created anew each time the HTML is generated. `'unsafe-inline'` is needed because Lit components fall back to inline `<style>` when adoptedStyleSheets is not supported.
- File watchers: the watcher set = union of both `watchTargets()`, one `createFileSystemWatcher(new RelativePattern(Uri.file(dirname), basename))` per file; added/removed on refresh; watcher callbacks only push the state and do not resync the watchers, to avoid loops.
- State push: `post({ type: 'state', state: { active: activeTab, locale: getLocale(), claude: tabState('claude'), codex: tabState('codex') } })`, then fire `onDidChange`. A locale change triggers `refresh()` (see extension.ts).

## src/webview/i18n.ts (frontend i18n)

```ts
export type Locale = PanelState['locale'];
export const en: { ... };                                  // English table, the source of truth
export type MessageKey = keyof typeof en;
export const zhCn: Record<MessageKey, string>;             // same keys as en (key-parity rule)
export function getLocale(): Locale;
export function setLocale(locale: Locale): void;           // unknown locale falls back to 'en'
export function t(key: MessageKey, params?: Record<string, string | number>): string; // `{name}` placeholders
```
- `main.ts` calls `setLocale(state.locale)` when a `state` message arrives, so `t()` always uses the locale of the most recent state.
- All Webview strings go through it: tabs, section titles, banners, buttons, titles/tooltips, aria-labels, placeholders, help text, validation messages, version card, disabled Codex page, tools.

## src/webview/main.ts (frontend, no exports)

- Imports `index.js` of `vscode-button`, `vscode-textfield`, `vscode-toolbar-button` and `vscode-icon` under `@vscode-elements/elements/dist/` (registers only the needed components, not the whole package; the count badge is a plain `span`, not `vscode-badge`).
- Sends `FromWebview` through `acquireVsCodeApi().postMessage`; receives `ToWebview` via the `window` `message` event. Every message to the host (except `ready`) carries `mode`.
- Top tab bar: two tab buttons Claude / Codex, the selected one highlighted; a click → sends `setTab` and switches rendering; the current tab is remembered in the Webview state with `vscode.setState({ tab })`, and `state.active` is only adopted when there is no local record; on `focusAdd` it switches to its `mode` (also sending `setTab` if needed) and focuses that page's input.
- On startup it renders once and then sends `ready`; on `state` both pages redraw their banner and list; the add section and the "Tools" row exist once per page, are created only once and not rebuilt on redraw, and keep independent input state. When `state.locale` changes, every static text (including the add-section help text, the "Tools" row, the footer toolbar titles and the version card) is re-rendered in the new language.
- Page structure: `#app` (scrollable, container query `panel`) contains the tab bar + two `.page` elements (each with `.page-top`: banner / disabled card / account list; `.page-tools`: "Tools" row; `.add`: add section); outside `#app` follow the version card `.versions` (hidden by default) and the pinned footer toolbar `.tools`.
- Per-page "Tools" row: three `vscode-button`s (secondary, icon and text): `symbol-ruler` + `CLAUDE.md`/`AGENTS.md` (title "Open global CLAUDE.md"/"Open global AGENTS.md") → `tool: 'openGlobalMd'`; `settings-gear` + "Settings" (title "Open Claude Code extension settings"/"Open Codex extension settings") → `'openSettings'`; `link` + "Sync rules" (title "Link the default account's global rules to other accounts") → `'syncRules'`. Messages carry the page's `mode`; shown on the Codex page even while it is not enabled.
- Pinned footer toolbar: four `vscode-toolbar-button`s, left to right `info` "Show CLI and extension versions" → `'cliVersions'`, `refresh` "Reload Window" → `'reloadWindow'`, `debug-restart` "Restart Extension Host" → `'restartExtHost'`, `server-process` "Restart WSL Server" → `'restartServer'`; `mode` is the current tab.
- Version card: on `versions`, if the card is expanded it collapses, otherwise it is filled with the title "CLI and extension versions" + close button and the `items` (each `.version-item`: `.version-label` on one line, `.version-value` on the next) and shown; the close button hides the card. Item labels come from the host (localized there).
- Account row rendering: the current row is always first; 20px avatar (the default row has a `home` badge, title "Default account"); at the right end of the name line the current row has a 16px check-mark badge (`current-icon`, title "Current account", not in edit state); email line ("Logged in" when there is no email but `loggedIn`, nothing when signed out); the current row has an extra `dirLabel` line; `.row-foot` holds the tag group (plan pill + "Not logged in" pill) and the button group; the `li` has `data-plan` (the frontend maps the `plan` text and `mode` to `none` / `apikey` / `team` / `enterprise` / `tier0` / `tier1` / `tier2` / `tier3`); rows, names, emails, directories and plan pills have no `title`. Non-current rows that are not in edit state get `tabindex=0`; double-click or Enter sends `switch`.
- It only renders and exchanges messages; business logic and validation are authoritative on the extension side; frontend validation (`NAME_RE`, the reserved name `default`, clashes with `name` or `label` of the page's `accounts`) is only an immediate hint.
- All text is written through `textContent`, never by concatenating HTML. Rows show `label` (not `name`), `email` and `plan`.
- Every row with `kind !== 'external'` has a pencil icon button (title "Rename"): a click turns the name into an input (prefilled with the current `label`); the edit state is keyed by the row's `dir` (`renamingDir`); Enter sends `rename` (with `dir` and `label`), Esc cancels; on `renameResult` only the one whose `dir` matches the row being edited is handled: with `error` it is shown in red inline, without `error` edit state ends. When that directory disappears from the state, the edit state is cleared. The external-directory row has no pencil button.
- Local UI state: `confirmingDir` (directory of the account being confirmed for removal inline; cleared when it disappears from the state), `adding` (an add was submitted, waiting for `addResult`), `renamingDir` (directory of the account being renamed inline), all per page.
- On `addResult`: success clears that page's input; failure shows `error` in the help line.

## src/statusBar.ts

```ts
export class StatusBar implements vscode.Disposable {
  constructor(store: AccountStore, labels: LabelStore);
  update(): void;   // text `$(account) Claude: <label>` (labelFor(name, labels); t('account.external') for an external directory); tooltip first line email (t() "Not logged in" when none) + ` · <plan>` when there is a plan, second line the directory; command = 'workbench.view.extension.aiSwitcher'
  dispose(): void;
}
```

## src/commands.ts

```ts
export interface Deps {
  store: AccountStore;
  panel: AccountsPanel;
  statusBar: StatusBar;
  labels: LabelStore;                    // claude.labels (legacy key claude.defaultLabel migrated automatically)
  codex?: { store: CodexAccountStore };  // the refresh command acts on both pages
  tools: ToolDeps;                       // panel tool messages are passed to runTool('claude', tool, tools)
}
export function registerCommands(deps: Deps): vscode.Disposable[];
export function shQuote(s: string): string;
```
- Command ids: `aiSwitcher.switchAccount`, `aiSwitcher.addAccount`, `aiSwitcher.removeAccount`, `aiSwitcher.openTerminal`, `aiSwitcher.refresh`. None of the commands take arguments:
  - `switchAccount`: QuickPick of the non-current `store.all()` accounts, then switch;
  - `addAccount`: only calls `panel.focusAdd('claude')`;
  - `removeAccount`: QuickPick of `store.named()`, then remove (with modal confirmation);
  - `openTerminal`: QuickPick of `store.all()`, plus the directory when the current one is external;
  - `refresh`: `await store.syncWithDisk()` (and `codex.store.syncWithDisk()`), then `panel.refresh()` + `statusBar.update()`.
- QuickPick items, messages and terminal names always use `labelFor(account.name, labels)`; logic still uses name / dir. All QuickPick texts and messages come from `t()`.
- `validateName`: empty / does not match `NAME_RE` / equals `default` / clashes with `store.find(name)` ("An account with this name already exists") / equals `labelFor(a.name, labels)` of any account in `store.all()` ("Same as an existing account's display name") / `samePath(accountDir(name), defaultDir())`. Only checks Claude accounts. Messages come from `t()`.
- Calls `panel.setHandler('claude', ...)` to handle panel messages: `switch`/`terminal`/`remove`/`rename` are first verified with `panel.resolve('claude', dir)`; `remove` only handles `kind === 'named'` and counts as confirmed (no first modal); `add` runs the add flow on the trimmed name and `panel.post({ type: 'addResult', mode: 'claude', error })`; `rename` only handles rows with `kind !== 'external'` → `labels.validate(label, account.name, store.all().map(a => ({ name: a.name, label: labelFor(a.name, labels) })))`; on error `post({ type: 'renameResult', mode, dir, error })`, otherwise `labels.set(account.name, <trimmed value>)` (deletes the entry when it equals `account.name`) → refresh the panel and the status bar → `post({ type: 'renameResult', mode, dir })`; `reload` runs `workbench.action.reloadWindow`; `dismissBanner` calls `panel.setSwitchedTo(undefined)`; `tool` calls `runTool('claude', msg.tool, tools)`.
- Adding an account: `ensureAccountDir` → `copySettingsStripped(defaultDir(), dir)` (on failure returns "Failed to create account directory: <reason>") → `linkGlobalRules(dir)` (on failure only `showWarningMessage("Account X was created, but linking the global CLAUDE.md failed: …")`, not blocking) → `store.add` → refresh.
- Removing an account also calls `labels.remove(name)` besides `store.remove(name)`.
- After a successful switch, call `panel.setSwitchedTo(label)` and `statusBar.update()`; when `!panel.visible`, also show a notification with a "Reload Window" button.
- The current account cannot be removed (refused with a hint to switch first); deleting the directory is always confirmed with a modal and only done through `deleteAccountDir`.
- Behavior details in design.md section 6.
- This module keeps its own set of "terminals created by this extension" and registers `onDidCloseTerminal`: on a match it calls `panel.refresh()` and `statusBar.update()`; this disposable is also in the returned array.

## src/extension.ts

```ts
export async function activate(ctx: vscode.ExtensionContext): Promise<void>;
export function deactivate(): void;
```
`setLocale(resolveLocale())` first, so every string below is localized → platform guard (non-linux: `showWarningMessage` once with the localized "AI Account Switcher only supports WSL/Linux.", then return) → `new AccountStore(ctx.globalState)` → `await store.syncWithDisk()` → `claudeLabels = new LabelStore(ctx.globalState, 'claude.labels', 'claude.defaultLabel')`, `codexLabels = new LabelStore(ctx.globalState, 'codex.labels', 'codex.defaultLabel')` → `new StatusBar(store, claudeLabels)` → Codex initialization (`CodexAccountStore` + `syncWithDisk` + `codexPanelSource(codexStore, codexLabels)`; on failure only `console.error`, remember `codexInitError`, and the Codex page degrades to `{ accounts: () => [], enabled: () => false, pendingDir: () => undefined, watchTargets: () => [] }`) → assemble `tools: ToolDeps = { codexRestart: codex ? restartServerInteractive : undefined, postVersions: (items) => panel.post({ type: 'versions', items }), claudeDirs: () => store.named().map(a => a.dir), codexDirs: codex ? () => codex.store.named().map(a => a.dir) : undefined }` → `new AccountsPanel(ctx.extensionUri, { claude: claudePanelSource(store, claudeLabels), codex: codexSource }, ctx.globalState)`, `registerWebviewViewProvider(VIEW_ID, panel)` → if `codexInitError`: `panel.setHandler('codex', msg => msg.type === 'tool' ? runTool('codex', msg.tool, tools) : showErrorMessage("Codex account switching is unavailable: <reason>"))`, and the 7 `aiSwitcher.codex.*` commands are registered to show the same error → `registerCommands({ store, panel, statusBar, labels: claudeLabels, codex, tools })`, (when Codex is healthy) `registerCodexCommands({ store, panel, labels: codexLabels, tools })`, `registerToolCommands(tools)` → `panel.onDidChange` → `statusBar.update()` → `onDidChangeConfiguration(affectsSetting)` → `panel.refresh()` + `statusBar.update()` → `watchLocale(() => { panel.refresh(); statusBar.update(); })` → everything pushed to `ctx.subscriptions`.

## src/tools.ts (tools: footer toolbar and per-page "Tools" row, 2026-09-26)

Shared tools live in the footer toolbar pinned to the bottom of the panel, tab-specific tools in each page's "Tools" row; both pages share one host implementation; `openGlobalMd`, `openSettings` and `syncRules` depend on the mode, the others do not.

```ts
export interface ToolDeps {
  codexRestart?: () => Promise<void>;   // provided by codexCommands.restartServerInteractive (modal confirmation + planRestart checks); undefined when Codex is not initialized
  postVersions?: (items: Array<{ label: string; value: string }>) => void; // panel entry: pushes the version info to the sidebar; the Command Palette entry passes undefined and uses a QuickPick instead
  claudeDirs?: () => string[];          // directories of store.named() on the Claude side (for syncRules)
  codexDirs?: () => string[];           // directories of store.named() on the Codex side; undefined when not initialized
}
export function runTool(mode: PanelMode, tool: ToolId, deps: ToolDeps): Promise<void>; // shared entry for panel tool messages and the Command Palette
export function registerToolCommands(deps: ToolDeps): vscode.Disposable[];
//   aiSwitcher.tools.openClaudeMd → runTool('claude','openGlobalMd'); openAgentsMd → runTool('codex','openGlobalMd');
//   openSettings → QuickPick (Claude Code / Codex), then runTool(mode,'openSettings'); reloadWindow / restartExtHost → runTool('claude', …);
//   cliVersions → runTool('claude','cliVersions', { ...deps, postVersions: undefined }) (read-only QuickPick list);
//   syncRules → QuickPick (Claude Code (CLAUDE.md) / Codex (AGENTS.md)), then runTool(mode,'syncRules').
//   Restarting the WSL server reuses aiSwitcher.codex.restartServer and is not registered here
```

Tool behavior (all texts via `t()`):
- `openGlobalMd`: claude → `<currentDir()>/CLAUDE.md`; codex → `<effectiveDir()>/AGENTS.md`. When the file does not exist, a modal asks "File does not exist. Create it?\n<path>" (button "Create"); on confirmation `writeFileSync(file, '', { mode: 0o600, flag: 'wx' })` and then `showTextDocument`; create / open failures → `showErrorMessage`.
- `openSettings`: `workbench.action.openSettings` with the argument `claudeCode.` (claude) or `chatgpt.` (codex).
- `reloadWindow`: `workbench.action.reloadWindow`, no confirmation.
- `restartExtHost`: `workbench.action.restartExtensionHost`, no confirmation.
- `restartServer`: calls `deps.codexRestart`; when undefined, `showWarningMessage("The Codex part is not initialized; cannot restart the WSL server.")`.
- `cliVersions`: `collectVersions()` runs `execFile('claude', ['--version'], { timeout: 8000 })` and `execFile('codex', …)` in parallel (no shell, PATH inherited from the extension host; ENOENT → "Not found", killed by the timeout → "Timed out", other → "Failed: <first line>", no output → "(no output)"), then reads `vscode.extensions.getExtension('anthropic.claude-code')?.packageJSON.version` and `getExtension('openai.chatgpt')?.packageJSON.version` (non-string → "Not found"). Returns four items: `Claude Code CLI`, "Claude Code extension", `Codex CLI`, "Codex extension" (the two extension labels are localized). With `deps.postVersions` it pushes `{ type: 'versions', items }` (shown by the frontend as the version card), otherwise `showQuickPick` (`label` / `description`, placeHolder "CLI and extension versions (display only)", selecting does nothing). No network access, no update check.
- `syncRules`: takes `deps.claudeDirs` / `deps.codexDirs`; when missing, `showWarningMessage("The <Claude|Codex> part is not initialized; cannot sync rules.")`; calls the vendor's `linkGlobalRules` for each directory and counts by `RulesLinkResult` (the account name is derived from the directory basename without the `.claude-` / `.codex-` prefix); one `showInformationMessage` summarizes: "Linked N account(s)", "M account(s) already linked", "X, Y kept their own CLAUDE.md; merge manually, delete that file, then sync again", "Link failed: <name>: <reason>; …", joined with a separator and ending with a period; when everything is empty: "No other accounts need CLAUDE.md synced." (`AGENTS.md` for Codex).

### Frontend

- **Footer toolbar pinned to the bottom of the panel** (outside the tab pages, always visible, the content area scrolls): 4 shared icon buttons, left to right: Show CLI and extension versions (`info`), Reload Window (`refresh`), Restart Extension Host (`debug-restart`), Restart WSL Server (`server-process`). The message's `mode` is the current tab; the host does not distinguish modes for these 4 tools.
- **Version card**: on `versions`, it expands above the toolbar (collapses if already expanded): title "CLI and extension versions" + close button; each item on two vertical lines (label, value).
- **Per-page "Tools" row** (between the account list and the "Add account" section, title "Tools"): three labeled secondary buttons: `CLAUDE.md` (claude page) / `AGENTS.md` (codex page), icon `symbol-ruler` (a ruler, standing for the rules file) → `openGlobalMd`; "Settings", icon `settings-gear` → `openSettings`; "Sync rules", icon `link` (title "Link the default account's global rules to other accounts") → `syncRules`.
- Every click sends `{ type: 'tool', mode, tool }`. The "Tools" row is shown on the Codex page even while it is not enabled.

### package.json

Commands (category "AI Account Switcher", 7 in total): `aiSwitcher.tools.openClaudeMd` (Open Global CLAUDE.md, `$(symbol-ruler)`), `aiSwitcher.tools.openAgentsMd` (Open Global AGENTS.md, `$(symbol-ruler)`), `aiSwitcher.tools.openSettings` (Open Extension Settings, `$(settings-gear)`), `aiSwitcher.tools.reloadWindow` (Reload Window, `$(refresh)`), `aiSwitcher.tools.restartExtHost` (Restart Extension Host, `$(debug-restart)`), `aiSwitcher.tools.cliVersions` (Show CLI and Extension Versions, `$(info)`), `aiSwitcher.tools.syncRules` (Sync Global Rules to Other Accounts, `$(link)`). Together with the 5 "Claude Account" and 7 "Codex Account" commands, `contributes.commands` has 19 entries. Titles and categories are `%key%` placeholders in `package.json`.

## Shared global rules (2026-09-26)

- Global rules files: `<account dir>/CLAUDE.md` for Claude, `<account dir>/AGENTS.md` for Codex. The default account's file is the single source (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`); other account directories contain a symlink (absolute path) pointing to it.
- The generic implementation is `linkRulesFile(dir, defDir, file)` in `src/paths.ts` (signature and behavior in the paths.ts section above); `paths.linkGlobalRules(dir)` fixes `CLAUDE.md`, `codexPaths.linkGlobalRules(dir)` fixes `AGENTS.md` (`codexPaths` also re-exports the `RulesLinkResult` type).
- Adding an account (Claude and Codex) calls `linkGlobalRules(dir)` after copying the seed configuration; a failure only triggers `showWarningMessage` and does not block. Codex's `copyCodexSeed` only copies `config.toml`; it no longer copies `AGENTS.md`.
- `runTool(mode, 'syncRules')` calls `linkGlobalRules` for each directory of `ToolDeps.claudeDirs()` / `codexDirs()` (the vendor's `store.named()` directories); the summary report is described above.
- Command Palette: `aiSwitcher.tools.syncRules` (first pick Claude Code (CLAUDE.md) / Codex (AGENTS.md)).
- Frontend: the third button "Sync rules" (icon `link`) of each page's "Tools" row sends `{ type: 'tool', mode, tool: 'syncRules' }`.
- When an account directory is deleted, the link goes with it; the default account's file is not affected (`fs.rm` does not follow symlinks).

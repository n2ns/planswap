import * as vscode from 'vscode';
import * as path from 'node:path';
import { AccountStore } from './accounts';
import { AccountsPanel, VIEW_ID, claudePanelSource, type PanelSource } from './accountsPanel';
import { LabelStore, labelFor } from './labels';
import { FileMemento } from './fileState';
import { ensureCodexLinks, isSharedCodexAccount } from './codex/codexShare';
import { StatusBar } from './statusBar';
import { registerCommands } from './commands';
import { affectsSetting } from './claudeSettings';
import { CodexAccountStore } from './codex/codexStore';
import { codexPanelSource, registerCodexCommands, restartServerInteractive } from './codex/codexCommands';
import { registerToolCommands, runTool, type ToolDeps } from './tools';
import { setLocale, t } from './i18n';
import { resolveLocale, watchLocale } from './i18nVscode';

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  // Resolve the UI locale before anything renders
  setLocale(resolveLocale());
  if (process.platform !== 'linux') {
    void vscode.window.showWarningMessage(t('ext.linuxOnly'));
    return;
  }
  // Account lists, ignore lists and aliases live in ~/.config/planswap/state.json so they follow the WSL distribution;
  // globalState is stored on the client and would be shared by every distro. Existing globalState data is imported once
  const state = new FileMemento();
  await state.importOnce(ctx.globalState);
  const store = new AccountStore(state);
  const claudeLabels = new LabelStore(state, 'claude.labels');
  await store.syncWithDisk(claudeLabels);
  const codexLabels = new LabelStore(state, 'codex.labels');
  const statusBar = new StatusBar(store, claudeLabels);

  // A Codex init failure is only logged and does not affect Claude: the Codex tab renders as "not enabled, no accounts"
  let codex: { store: CodexAccountStore; labels: LabelStore } | undefined;
  let codexSource: PanelSource = { accounts: () => [], enabled: () => false, pendingDir: () => undefined, watchTargets: () => [] };
  let codexInitError: string | undefined;
  try {
    const codexStore = new CodexAccountStore(state);
    await codexStore.syncWithDisk(codexLabels);
    codexSource = codexPanelSource(codexStore, codexLabels);
    codex = { store: codexStore, labels: codexLabels };
  } catch (err) {
    codexInitError = err instanceof Error ? err.message : String(err);
    console.error('[planswap] Codex initialization failed:', err);
  }

  // Toolbar dependencies: no restart entry when Codex is not initialized
  const tools: ToolDeps = {
    codexRestart: codex ? restartServerInteractive : undefined,
    postVersions: (items) => panel.post({ type: 'versions', items }),
    claudeDirs: () => store.named().map((a) => a.dir),
    codexDirs: codex ? () => codex.store.named().map((a) => a.dir) : undefined,
    codexShareOps: codex ? { isShared: isSharedCodexAccount, refresh: ensureCodexLinks } : undefined,
    labelOf: (mode, dir) => {
      const account = mode === 'claude' ? store.findByDir(dir) : codex?.store.findByDir(dir);
      return account ? labelFor(account.name, mode === 'claude' ? claudeLabels : codexLabels) : path.basename(dir);
    },
  };

  const panel = new AccountsPanel(ctx.extensionUri, { claude: claudePanelSource(store, claudeLabels), codex: codexSource }, ctx.globalState);
  // On init failure, Codex actions in the panel and Command Palette show a clear message instead of silently doing nothing
  if (codexInitError) {
    const notify = () => void vscode.window.showErrorMessage(t('ext.codexUnavailable', { error: codexInitError ?? '' }));
    // Toolbar messages are handled as usual (runTool reports "not initialized" for restartServer)
    panel.setHandler('codex', (msg) => (msg.type === 'tool' ? runTool('codex', msg.tool, tools) : notify()));
    for (const id of ['enable', 'disable', 'switchAccount', 'addAccount', 'removeAccount', 'openTerminal', 'restartServer']) {
      ctx.subscriptions.push(vscode.commands.registerCommand(`planswap.codex.${id}`, notify));
    }
  }

  ctx.subscriptions.push(
    panel,
    vscode.window.registerWebviewViewProvider(VIEW_ID, panel),
    statusBar,
    ...registerCommands({ store, panel, statusBar, labels: claudeLabels, codex, tools }),
    ...(codex ? registerCodexCommands({ store: codex.store, panel, labels: codexLabels, tools }) : []),
    ...registerToolCommands(tools),
    // Account info file changes only push panel state; keep the status bar email in sync here
    panel.onDidChange(() => statusBar.update()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!affectsSetting(e)) return;
      panel.refresh();
      statusBar.update();
    }),
    // Language setting changes apply immediately: re-render the panel and status bar
    watchLocale(() => {
      panel.refresh();
      statusBar.update();
    }),
  );
}

export function deactivate(): void {}

import * as vscode from 'vscode';
import {
  DEFAULT_NAME,
  NAME_RE,
  type Account,
  accountDir,
  copySettingsStripped,
  defaultDir,
  deleteAccountDir,
  ensureAccountDir,
  linkGlobalRules,
  readAccountInfo,
  samePath,
} from './paths';
import { currentDir, setConfigDir } from './claudeSettings';
import type { AccountStore } from './accounts';
import type { AccountsPanel } from './accountsPanel';
import type { StatusBar } from './statusBar';
import { labelFor, type LabelStore, EXTERNAL_NAME } from './labels';
import type { FromWebview } from './protocol';
import type { CodexAccountStore } from './codex/codexStore';
import { runTool, type ToolDeps } from './tools';
import { t } from './i18n';

export interface Deps {
  store: AccountStore;
  panel: AccountsPanel;
  statusBar: StatusBar;
  labels: LabelStore;
  // Codex-side store; the refresh command applies to both tabs
  codex?: { store: CodexAccountStore };
  tools: ToolDeps;
}

export function registerCommands(deps: Deps): vscode.Disposable[] {
  const { store, panel, statusBar, labels, codex, tools } = deps;
  const MODE = 'claude';
  // Terminals created by this extension -> their account
  const terminals = new Map<vscode.Terminal, Account>();

  const refreshUi = (): void => {
    panel.refresh();
    statusBar.update();
  };
  const isCurrent = (a: Account): boolean => samePath(a.dir, currentDir());
  // Display name: the alias if set, otherwise the name
  const labelOf = (a: Account): string => labelFor(a.name, labels);
  const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

  async function pickAccount(accounts: Account[], placeHolder: string): Promise<Account | undefined> {
    if (accounts.length === 0) {
      void vscode.window.showInformationMessage(t('common.noAccounts'));
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      accounts.map((account) => ({
        label: labelOf(account),
        description: readAccountInfo(account.dir).email ?? t('common.notLoggedIn'),
        detail: account.dir,
        account,
      })),
      { placeHolder },
    );
    return picked?.account;
  }

  function validateName(name: string): string | undefined {
    if (!name) return t('name.empty');
    if (!NAME_RE.test(name)) return t('name.invalid');
    if (name === DEFAULT_NAME) return t('name.reserved', { name: DEFAULT_NAME });
    if (store.find(name)) return t('name.exists');
    if (store.all().some((a) => labelOf(a) === name)) return t('name.dupLabel');
    if (samePath(accountDir(name), defaultDir())) return t('name.sameAsDefaultDir');
    return undefined;
  }

  // Rename: the external row cannot be renamed; label equal to name clears the alias
  async function rename(dir: string, label: string): Promise<string | undefined> {
    const account = panel.resolve(MODE, dir);
    if (!account || account.kind === 'external') return undefined;
    const existing = store.all().map((a) => ({ name: a.name, label: labelOf(a) }));
    const error = labels.validate(label, account.name, existing);
    if (error) return error;
    const value = label.trim();
    await labels.set(account.name, value === account.name ? undefined : value);
    refreshUi();
    return undefined;
  }

  async function switchTo(account: Account): Promise<boolean> {
    if (isCurrent(account)) return true;
    try {
      await setConfigDir(account.name === DEFAULT_NAME ? undefined : account.dir);
    } catch (err) {
      void vscode.window.showErrorMessage(
        t('claude.switchFailed', { error: errText(err) }),
      );
      return false;
    }
    // The reload prompt is the banner at the top of the panel; fall back to a notification when the panel is hidden
    panel.setSwitchedTo(labelOf(account));
    statusBar.update();
    // Do not await the notification so the caller is not blocked by it
    if (!panel.visible) {
      void vscode.window
        .showInformationMessage(t('claude.switched', { label: labelOf(account) }), t('common.reloadWindow'))
        .then((choice) => (choice ? reloadWindow() : undefined));
    }
    return true;
  }

  async function reloadWindow(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }

  async function addAccount(name: string): Promise<string | undefined> {
    const error = validateName(name);
    if (error) return error;
    const account: Account = { name, dir: accountDir(name) };
    try {
      ensureAccountDir(account.dir);
      copySettingsStripped(defaultDir(), account.dir);
    } catch (err) {
      return t('account.createDirFailed', { error: errText(err) });
    }
    // Share the default account's global CLAUDE.md; failure only warns and does not block
    try {
      linkGlobalRules(account.dir);
    } catch (err) {
      void vscode.window.showWarningMessage(t('account.linkRulesFailed', { name, file: 'CLAUDE.md', error: errText(err) }));
    }
    await store.add(account);
    refreshUi();
    return undefined;
  }

  // confirmed: the panel already did an inline confirmation; Command Palette entries need a modal confirmation
  async function removeAccount(account: Account, confirmed: boolean): Promise<void> {
    if (account.name === DEFAULT_NAME || !store.find(account.name)) return;
    // The current account cannot be deleted; switch to another account first
    if (isCurrent(account)) {
      void vscode.window.showWarningMessage(t('claude.removeCurrent', { label: labelOf(account) }));
      return;
    }
    if (!confirmed) {
      const deleteLabel = t('common.delete');
      const ok = await vscode.window.showWarningMessage(t('claude.removeConfirm', { label: labelOf(account) }), { modal: true }, deleteLabel);
      if (ok !== deleteLabel) return;
    }

    await store.remove(account.name);
    await labels.remove(account.name);
    refreshUi();

    const detail = t('claude.removeDirDetail');
    const deleteDirLabel = t('common.deleteDir');
    const delDir = await vscode.window.showWarningMessage(
      t('account.removeDirPrompt', { label: labelOf(account), dir: account.dir }),
      { modal: true, detail },
      deleteDirLabel,
    );
    if (delDir !== deleteDirLabel) return;
    try {
      await deleteAccountDir(account.dir);
    } catch (err) {
      void vscode.window.showErrorMessage(t('account.deleteDirFailed', { error: errText(err) }));
    }
  }

  function openTerminal(account: Account): void {
    const isDefault = account.name === DEFAULT_NAME;
    const terminal = vscode.window.createTerminal({
      name: `Claude (${labelOf(account)})`,
      env: isDefault ? undefined : { CLAUDE_CONFIG_DIR: account.dir },
    });
    terminals.set(terminal, account);
    terminal.sendText(isDefault ? 'claude' : `env CLAUDE_CONFIG_DIR=${shQuote(account.dir)} claude`);
    terminal.show();
  }

  // Panel messages
  panel.setHandler(MODE, async (msg: FromWebview) => {
    switch (msg.type) {
      case 'switch': {
        const a = panel.resolve(MODE, msg.dir);
        if (a) await switchTo(a);
        return;
      }
      case 'terminal': {
        const a = panel.resolve(MODE, msg.dir);
        if (a) openTerminal(a);
        return;
      }
      case 'remove': {
        const a = panel.resolve(MODE, msg.dir);
        if (a?.kind === 'named') await removeAccount(a, true);
        return;
      }
      case 'add':
        panel.post({ type: 'addResult', mode: MODE, error: await addAccount(msg.name.trim()) });
        return;
      case 'rename':
        panel.post({ type: 'renameResult', mode: MODE, dir: msg.dir, error: await rename(msg.dir, msg.label) });
        return;
      case 'reload':
        await reloadWindow();
        return;
      case 'dismissBanner':
        panel.setSwitchedTo(undefined);
        return;
      case 'tool':
        await runTool(MODE, msg.tool, tools);
        return;
    }
  });

  // Command Palette entries
  const allWithExternal = (): Account[] =>
    store.findByDir(currentDir()) ? store.all() : [...store.all(), { name: EXTERNAL_NAME, dir: currentDir() }];

  return [
    vscode.commands.registerCommand('aiSwitcher.switchAccount', async () => {
      const a = await pickAccount(store.all().filter((x) => !isCurrent(x)), t('claude.pick.switch'));
      if (a) await switchTo(a);
    }),
    vscode.commands.registerCommand('aiSwitcher.addAccount', () => panel.focusAdd(MODE)),
    vscode.commands.registerCommand('aiSwitcher.removeAccount', async () => {
      const a = await pickAccount(store.named().filter((x) => !isCurrent(x)), t('claude.pick.remove'));
      if (a) await removeAccount(a, false);
    }),
    vscode.commands.registerCommand('aiSwitcher.openTerminal', async () => {
      const a = await pickAccount(allWithExternal(), t('claude.pick.terminal'));
      if (a) openTerminal(a);
    }),
    vscode.commands.registerCommand('aiSwitcher.refresh', async () => {
      await store.syncWithDisk();
      if (codex) await codex.store.syncWithDisk();
      refreshUi();
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      const account = terminals.get(terminal);
      if (!account) return;
      terminals.delete(terminal);
      refreshUi();
      if (account.name !== DEFAULT_NAME && !readAccountInfo(account.dir).email) {
        void vscode.window.showWarningMessage(
          t('claude.loginNotLanded', { dir: account.dir }),
        );
      }
    }),
  ];
}

// Wrap in single quotes; inner ' becomes '\''
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

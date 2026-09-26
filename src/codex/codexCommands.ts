import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { NAME_RE, samePath, sameRealPath } from '../paths';
import { shQuote } from '../commands';
import { type AccountsPanel, type PanelSource, tildify } from '../accountsPanel';
import { labelFor, type LabelStore, EXTERNAL_NAME } from '../labels';
import type { AccountView, FromWebview } from '../protocol';
import {
  CODEX_DEFAULT_NAME,
  type CodexAccount,
  codexAccountDir,
  codexDefaultDir,
  codexLoggedIn,
  readCodexAccountInfo,
  copyCodexSeed,
  deleteCodexDir,
  ensureCodexDir,
  linkGlobalRules,
} from './codexPaths';
import {
  RC_BEGIN,
  RC_END,
  STATE_FILE,
  effectiveDir,
  installRcBlocks,
  preCheck,
  rcBlock,
  rcStatus,
  readSelectedDir,
  removeRcBlocks,
  selfCheck,
  writeSelectedDir,
} from './codexState';
import { type ServerKind, canAutoRestart, detectServerKind, executeRestart, planRestart } from './codexServer';
import type { CodexAccountStore } from './codexStore';
import { runTool, type ToolDeps } from '../tools';
import { t } from '../i18n';

export interface CodexDeps { store: CodexAccountStore; panel: AccountsPanel; labels: LabelStore; tools: ToolDeps }

/**
 * Removes this extension's marker block from a single rc file (used by enable rollback, only for files newly written this time).
 * Same as codexState.removeFrom: also removes the blank line added before the block at install time and keeps permissions;
 * difference: when the END marker is missing it leaves the file untouched and throws; writes back via temp file + rename.
 */
function removeRcBlockFrom(file: string): void {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw e;
  }
  const lines = text.split('\n');
  const begin = lines.findIndex((l) => l.trim() === RC_BEGIN);
  if (begin < 0) return;
  const end = lines.findIndex((l, i) => i > begin && l.trim() === RC_END);
  if (end < 0) throw new Error(t('codex.rollbackMissingEnd', { file }));
  lines.splice(begin, end - begin + 1);
  if (begin > 0 && lines[begin - 1] === '') lines.splice(begin - 1, 1);
  const mode = fs.statSync(file).mode & 0o777;
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(tmp, 'w', mode);
  try {
    fs.writeFileSync(fd, lines.join('\n'));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// Editor display names (not localized); a Record so that a new kind cannot be left out
const EDITOR_NAMES: Record<ServerKind, string> = {
  antigravity: 'Antigravity',
  vscodium: 'VSCodium',
  vscode: 'VS Code',
  unknown: '', // unused: the unknown kind never names an editor
};
const editorName = (kind: ServerKind): string => EDITOR_NAMES[kind];

// Manual restart guidance for the given server kind
function manualHint(kind: ServerKind): string {
  if (kind === 'vscode') return t('codex.manualRestartHintVscode');
  if (kind === 'unknown') return t('codex.manualRestartHintUnknown');
  return t('codex.manualRestartHint', { editor: editorName(kind) });
}

// Returns false when automatic restart is unsupported or validation failed and the manual alternative was shown
function restart(): boolean {
  const kind = detectServerKind();
  if (!canAutoRestart(kind)) {
    void vscode.window.showWarningMessage(t('codex.manualRestartRequired', { hint: manualHint(kind) }));
    return false;
  }
  let plan;
  try {
    plan = planRestart();
  } catch (err) {
    void vscode.window.showWarningMessage(t('codex.restartPlanFailed', { error: errText(err), hint: manualHint(kind) }));
    return false;
  }
  try {
    executeRestart(plan);
  } catch (err) {
    void vscode.window.showWarningMessage(t('codex.restartFailed', { error: errText(err), hint: manualHint(kind) }));
    return false;
  }
  return true;
}

/** "Restart WSL server" with modal confirmation: shared by the panel button, Command Palette and toolbar */
export async function restartServerInteractive(): Promise<void> {
  const kind = detectServerKind();
  if (!canAutoRestart(kind)) {
    void vscode.window.showWarningMessage(t('codex.manualRestartRequired', { hint: manualHint(kind) }));
    return;
  }
  const continueLabel = t('common.continue');
  const ok = await vscode.window.showWarningMessage(t('codex.restartConfirm', { editor: editorName(kind) }), { modal: true }, continueLabel);
  if (ok !== continueLabel) return;
  restart();
}

/** Data source of the Codex panel tab */
export function codexPanelSource(store: CodexAccountStore, labels: LabelStore): PanelSource {
  const accounts = (): AccountView[] => {
    const cur = effectiveDir();
    const rows: AccountView[] = store.all().map((a) => ({
      kind: a.name === CODEX_DEFAULT_NAME ? 'default' : 'named',
      name: a.name,
      label: labelFor(a.name, labels),
      dir: a.dir,
      dirLabel: tildify(a.dir),
      ...readCodexAccountInfo(a.dir),
      isCurrent: samePath(a.dir, cur),
    }));
    if (!rows.some((r) => r.isCurrent)) {
      rows.push({
        kind: 'external',
        name: EXTERNAL_NAME,
        label: labelFor(EXTERNAL_NAME, labels),
        dir: cur,
        dirLabel: tildify(cur),
        ...readCodexAccountInfo(cur),
        isCurrent: true,
      });
    }
    return rows;
  };
  return {
    accounts,
    // Treat errors such as unreadable rc files as not enabled so panel rendering is not interrupted
    enabled: () => {
      try {
        return rcStatus().every((s) => s.hasBlock);
      } catch {
        return false;
      }
    },
    pendingDir: () => {
      const selected = readSelectedDir() ?? codexDefaultDir();
      if (samePath(selected, effectiveDir())) return undefined;
      const account = store.findByDir(selected);
      return account ? labelFor(account.name, labels) : selected;
    },
    watchTargets: () => [...accounts().map((r) => path.join(r.dir, 'auth.json')), STATE_FILE()],
  };
}

export function registerCodexCommands(deps: CodexDeps): vscode.Disposable[] {
  const { store, panel, labels, tools } = deps;
  const MODE = 'codex';
  // Terminals created by this extension -> their account
  const terminals = new Map<vscode.Terminal, CodexAccount>();

  // Display name: the alias if set, otherwise the name
  const labelOf = (a: CodexAccount): string => labelFor(a.name, labels);
  const isEffective = (a: CodexAccount): boolean => samePath(a.dir, effectiveDir());
  const isSelected = (a: CodexAccount): boolean => samePath(a.dir, readSelectedDir() ?? codexDefaultDir());

  async function pickAccount(accounts: CodexAccount[], placeHolder: string): Promise<CodexAccount | undefined> {
    if (accounts.length === 0) {
      void vscode.window.showInformationMessage(t('common.noAccounts'));
      return undefined;
    }
    const picked = await vscode.window.showQuickPick(
      accounts.map((account) => ({
        label: labelOf(account),
        description: codexLoggedIn(account.dir) ? t('common.loggedIn') : t('common.notLoggedIn'),
        detail: account.dir,
        account,
      })),
      { placeHolder },
    );
    return picked?.account;
  }

  async function enable(): Promise<void> {
    let check: ReturnType<typeof preCheck>;
    try {
      check = preCheck();
    } catch (err) {
      void vscode.window.showErrorMessage(t('codex.enableFailed', { error: errText(err) }));
      return;
    }
    if (!check.ok) {
      void vscode.window.showErrorMessage(t('codex.enableFailedReasons', { reasons: check.reasons.join('\n') }));
      return;
    }
    const writeLabel = t('codex.enableButton');
    const ok = await vscode.window.showWarningMessage(t('codex.enableConfirm'), { modal: true, detail: rcBlock() }, writeLabel);
    if (ok !== writeLabel) return;
    // Snapshot before writing: rollback only removes blocks from files newly written this time, never the user's existing blocks
    let newlyWritten: string[];
    try {
      newlyWritten = rcStatus().filter((s) => !s.hasBlock).map((s) => s.file);
    } catch (err) {
      void vscode.window.showErrorMessage(t('codex.enableFailed', { error: errText(err) }));
      return;
    }
    const rollback = (): string[] => {
      const failed: string[] = [];
      for (const file of newlyWritten) {
        try {
          removeRcBlockFrom(file);
        } catch (e) {
          failed.push(errText(e));
        }
      }
      return failed;
    };
    try {
      installRcBlocks();
    } catch (err) {
      const failed = rollback();
      void vscode.window.showErrorMessage(
        t('codex.writeRcFailed', { error: errText(err) }) +
          (failed.length ? t('codex.rollbackFailedSuffix', { errors: failed.join('\n') }) : ''),
      );
      panel.refresh();
      return;
    }
    const result = selfCheck();
    if (!result.ok) {
      const failed = rollback();
      void vscode.window.showErrorMessage(
        failed.length
          ? t('codex.selfCheckFailedRollbackFailed', { detail: result.detail, errors: failed.join('\n') })
          : t('codex.selfCheckFailed', { detail: result.detail }),
      );
    }
    panel.refresh();
  }

  async function disable(): Promise<void> {
    const disableLabel = t('codex.disableButton');
    const ok = await vscode.window.showWarningMessage(t('codex.disableConfirm'), { modal: true }, disableLabel);
    if (ok !== disableLabel) return;
    try {
      removeRcBlocks();
      try {
        fs.unlinkSync(STATE_FILE());
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    } catch (err) {
      void vscode.window.showErrorMessage(t('codex.disableFailed', { error: errText(err) }));
    }
    panel.refresh();
  }

  async function switchTo(account: CodexAccount): Promise<void> {
    if (isEffective(account) && isSelected(account)) {
      void vscode.window.showInformationMessage(t('account.alreadyCurrent', { label: labelOf(account) }));
      return;
    }
    if (!fs.existsSync(account.dir)) {
      void vscode.window.showErrorMessage(t('account.dirMissing', { dir: account.dir }));
      return;
    }
    const kind = detectServerKind();
    const auto = canAutoRestart(kind);
    const confirmText = auto
      ? t('codex.switchConfirm', { editor: editorName(kind) })
      : t('codex.switchConfirmManual', { hint: manualHint(kind) });
    const continueLabel = t('common.continue');
    const ok = await vscode.window.showWarningMessage(confirmText, { modal: true }, continueLabel);
    if (ok !== continueLabel) return;
    try {
      writeSelectedDir(account.name === CODEX_DEFAULT_NAME ? undefined : account.dir);
    } catch (err) {
      void vscode.window.showErrorMessage(t('codex.writeStateFailed', { error: errText(err) }));
      return;
    }
    panel.refresh();
    // Manual kinds already showed the instructions in the confirmation
    if (auto) restart();
  }

  function validateName(name: string): string | undefined {
    if (!name) return t('name.empty');
    if (!NAME_RE.test(name)) return t('name.invalid');
    if (name === CODEX_DEFAULT_NAME) return t('name.reserved', { name: CODEX_DEFAULT_NAME });
    if (store.find(name)) return t('name.exists');
    if (store.all().some((a) => labelOf(a) === name)) return t('name.dupLabel');
    if (sameRealPath(codexAccountDir(name), codexDefaultDir())) return t('name.sameAsDefaultDir');
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
    panel.refresh();
    return undefined;
  }

  async function addAccount(name: string): Promise<string | undefined> {
    const error = validateName(name);
    if (error) return error;
    const account: CodexAccount = { name, dir: codexAccountDir(name) };
    try {
      ensureCodexDir(account.dir);
      const result = copyCodexSeed(codexDefaultDir(), account.dir);
      // "Source missing" / "target exists" are normal and not reported; only blocked or unreadable files are
      const normal = [t('codex.seed.srcMissing'), t('codex.seed.dstExists')];
      const notable = result.skipped.filter((s) => !normal.includes(s.reason));
      if (notable.length) {
        void vscode.window.showInformationMessage(
          t('codex.seedSkipped', {
            name,
            list: notable.map((s) => t('codex.seedSkippedItem', { file: s.file, reason: s.reason })).join('\n'),
          }),
        );
      }
    } catch (err) {
      return t('account.createDirFailed', { error: errText(err) });
    }
    // Share the default account's global AGENTS.md (an own file copied by the seed is kept); failure only warns and does not block
    try {
      linkGlobalRules(account.dir);
    } catch (err) {
      void vscode.window.showWarningMessage(t('account.linkRulesFailed', { name, file: 'AGENTS.md', error: errText(err) }));
    }
    await store.add(account);
    panel.refresh();
    return undefined;
  }

  // confirmed: the panel already did an inline confirmation; Command Palette entries need a modal confirmation
  async function removeAccount(account: CodexAccount, confirmed: boolean): Promise<void> {
    if (account.name === CODEX_DEFAULT_NAME || !store.find(account.name)) return;
    if (isEffective(account)) {
      void vscode.window.showWarningMessage(t('codex.removeEffective', { label: labelOf(account) }));
      return;
    }
    if (isSelected(account)) {
      void vscode.window.showWarningMessage(t('codex.removeSelected', { label: labelOf(account) }));
      return;
    }
    if (!confirmed) {
      const deleteLabel = t('common.delete');
      const ok = await vscode.window.showWarningMessage(t('codex.removeConfirm', { label: labelOf(account) }), { modal: true }, deleteLabel);
      if (ok !== deleteLabel) return;
    }

    await store.remove(account.name);
    await labels.remove(account.name);
    panel.refresh();

    const detail = t('codex.removeDirDetail');
    const deleteDirLabel = t('common.deleteDir');
    const delDir = await vscode.window.showWarningMessage(
      t('account.removeDirPrompt', { label: labelOf(account), dir: account.dir }),
      { modal: true, detail },
      deleteDirLabel,
    );
    if (delDir !== deleteDirLabel) return;
    try {
      await deleteCodexDir(account.dir);
    } catch (err) {
      void vscode.window.showErrorMessage(t('account.deleteDirFailed', { error: errText(err) }));
    }
  }

  function openTerminal(account: CodexAccount, login: boolean): void {
    const isDefault = account.name === CODEX_DEFAULT_NAME;
    const terminal = vscode.window.createTerminal({ name: `Codex (${labelOf(account)})` });
    terminals.set(terminal, account);
    const cmd = isDefault ? 'env -u CODEX_HOME codex' : `env CODEX_HOME=${shQuote(account.dir)} codex`;
    terminal.sendText(login ? `${cmd} login` : cmd);
    terminal.show();
  }

  // Panel messages
  panel.setHandler(MODE, async (msg: FromWebview) => {
    switch (msg.type) {
      case 'enable':
        await enable();
        return;
      case 'restartServer':
        await restartServerInteractive();
        return;
      case 'switch': {
        const a = panel.resolve(MODE, msg.dir);
        if (a) await switchTo(a);
        return;
      }
      case 'terminal': {
        const a = panel.resolve(MODE, msg.dir);
        if (a) openTerminal(a, !codexLoggedIn(a.dir));
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
      case 'dismissBanner':
        return;
      case 'tool':
        await runTool(MODE, msg.tool, tools);
        return;
    }
  });

  // Command Palette entries
  const allWithExternal = (): CodexAccount[] =>
    store.findByDir(effectiveDir()) ? store.all() : [...store.all(), { name: EXTERNAL_NAME, dir: effectiveDir() }];

  return [
    vscode.commands.registerCommand('aiSwitcher.codex.enable', enable),
    vscode.commands.registerCommand('aiSwitcher.codex.disable', disable),
    vscode.commands.registerCommand('aiSwitcher.codex.switchAccount', async () => {
      const a = await pickAccount(store.all().filter((x) => !(isEffective(x) && isSelected(x))), t('codex.pick.switch'));
      if (a) await switchTo(a);
    }),
    vscode.commands.registerCommand('aiSwitcher.codex.addAccount', () => panel.focusAdd(MODE)),
    vscode.commands.registerCommand('aiSwitcher.codex.removeAccount', async () => {
      const a = await pickAccount(store.named().filter((x) => !isEffective(x) && !isSelected(x)), t('codex.pick.remove'));
      if (a) await removeAccount(a, false);
    }),
    vscode.commands.registerCommand('aiSwitcher.codex.openTerminal', async () => {
      const a = await pickAccount(allWithExternal(), t('codex.pick.terminal'));
      if (a) openTerminal(a, !codexLoggedIn(a.dir));
    }),
    vscode.commands.registerCommand('aiSwitcher.codex.restartServer', restartServerInteractive),
    vscode.window.onDidCloseTerminal((terminal) => {
      if (!terminals.delete(terminal)) return;
      panel.refresh();
    }),
  ];
}

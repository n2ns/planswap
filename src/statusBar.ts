import * as vscode from 'vscode';
import { readAccountInfo } from './paths';
import { currentDir, isExplicitConfigDir } from './claudeSettings';
import type { AccountStore } from './accounts';
import { EXTERNAL_NAME, labelFor, type LabelStore } from './labels';
import { t } from './i18n';

export class StatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

  constructor(
    private readonly store: AccountStore,
    private readonly labels: LabelStore,
  ) {
    this.item.command = 'workbench.view.extension.planswap';
    this.update();
    this.item.show();
  }

  update(): void {
    const dir = currentDir();
    const account = this.store.findByDir(dir);
    const label = labelFor(account ? account.name : EXTERNAL_NAME, this.labels);
    const info = readAccountInfo(dir, isExplicitConfigDir(dir));
    this.item.text = `$(account) Claude: ${label}`;
    const first = info.email ?? t('common.notLoggedIn');
    this.item.tooltip = `${info.plan ? `${first} · ${info.plan}` : first}\n${dir}`;
  }

  dispose(): void {
    this.item.dispose();
  }
}

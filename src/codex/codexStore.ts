import type { Memento } from 'vscode';
import { samePath } from '../paths';
import { labelFor, type LabelStore } from '../labels';
import type { CodexAccount } from './codexPaths';
import { CODEX_DEFAULT_NAME, codexDefaultDir, scanCodexDirs } from './codexPaths';

const STATE_KEY = 'codex.accounts';
// Accounts deleted but whose directories were kept; skipped by the auto scan
const IGNORED_KEY = 'codex.ignoredDirs';

export class CodexAccountStore {
  constructor(private readonly state: Memento) {}

  private load(): CodexAccount[] {
    return this.state.get<CodexAccount[]>(STATE_KEY, []);
  }

  private save(list: CodexAccount[]): Thenable<void> {
    return this.state.update(STATE_KEY, list);
  }

  named(): CodexAccount[] {
    return this.load()
      .filter((a) => a.name !== CODEX_DEFAULT_NAME)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  all(): CodexAccount[] {
    return [{ name: CODEX_DEFAULT_NAME, dir: codexDefaultDir() }, ...this.named()];
  }

  find(name: string): CodexAccount | undefined {
    return this.all().find((a) => a.name === name);
  }

  findByDir(dir: string): CodexAccount | undefined {
    return this.all().find((a) => samePath(a.dir, dir));
  }

  private ignored(): string[] {
    return this.state.get<string[]>(IGNORED_KEY, []);
  }

  async add(account: CodexAccount): Promise<void> {
    await this.state.update(IGNORED_KEY, this.ignored().filter((d) => !samePath(d, account.dir)));
    await this.save([...this.load().filter((a) => a.name !== account.name), account]);
  }

  async remove(name: string): Promise<void> {
    const removed = this.load().find((a) => a.name === name);
    if (removed && !this.ignored().some((d) => samePath(d, removed.dir))) {
      await this.state.update(IGNORED_KEY, [...this.ignored(), removed.dir]);
    }
    await this.save(this.load().filter((a) => a.name !== name));
  }

  // Called after the directory was deleted, so a recreated directory is auto-discovered again
  async unignore(dir: string): Promise<void> {
    await this.state.update(IGNORED_KEY, this.ignored().filter((d) => !samePath(d, dir)));
  }

  // labels: scanned names equal to an existing account's display name are skipped until that alias changes
  async syncWithDisk(labels?: LabelStore): Promise<void> {
    const list = this.load();
    const ignored = this.ignored();
    const taken = labels ? this.all().map((a) => labelFor(a.name, labels)) : [];
    const missing = scanCodexDirs().filter(
      (s) =>
        !ignored.some((d) => samePath(d, s.dir)) &&
        !list.some((a) => a.name === s.name || samePath(a.dir, s.dir)) &&
        !taken.includes(s.name),
    );
    if (missing.length) await this.save([...list, ...missing]);
  }
}

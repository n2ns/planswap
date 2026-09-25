import type { Memento } from 'vscode';
import type { Account } from './paths';
import { DEFAULT_NAME, defaultDir, samePath, scanAccountDirs } from './paths';

const STATE_KEY = 'accounts';
// Accounts deleted but whose directories were kept; skipped by the auto scan
const IGNORED_KEY = 'ignoredDirs';

export class AccountStore {
  constructor(private readonly state: Memento) {}

  private load(): Account[] {
    return this.state.get<Account[]>(STATE_KEY, []);
  }

  private save(list: Account[]): Thenable<void> {
    return this.state.update(STATE_KEY, list);
  }

  named(): Account[] {
    return this.load()
      .filter((a) => a.name !== DEFAULT_NAME)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  all(): Account[] {
    return [{ name: DEFAULT_NAME, dir: defaultDir() }, ...this.named()];
  }

  find(name: string): Account | undefined {
    return this.all().find((a) => a.name === name);
  }

  findByDir(dir: string): Account | undefined {
    return this.all().find((a) => samePath(a.dir, dir));
  }

  private ignored(): string[] {
    return this.state.get<string[]>(IGNORED_KEY, []);
  }

  async add(account: Account): Promise<void> {
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

  async syncWithDisk(): Promise<void> {
    const list = this.load();
    const ignored = this.ignored();
    const missing = scanAccountDirs().filter(
      (s) => !ignored.some((d) => samePath(d, s.dir)) && !list.some((a) => a.name === s.name || samePath(a.dir, s.dir)),
    );
    if (missing.length) await this.save([...list, ...missing]);
  }
}

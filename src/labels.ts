// Account display name (alias) storage and validation, keyed by account name; depends only on vscode's Memento type
import type { Memento } from 'vscode';
import { t, translationsOf } from './i18n';

// Internal sentinel name of the "external directory" row; never displayed (see labelFor). '<' cannot pass NAME_RE.
export const EXTERNAL_NAME = '<external>';
const MAX_LABEL_LENGTH = 32;

type Labels = Record<string, string>;

export class LabelStore {
  constructor(
    private readonly state: Memento,
    private readonly key: 'claude.labels' | 'codex.labels',
    private readonly legacyKey: 'claude.defaultLabel' | 'codex.defaultLabel',
  ) {}

  /** Returns undefined when not set */
  get(name: string): string | undefined {
    // Own properties only, so names like `constructor` / `toString` never resolve to Object.prototype members
    const labels = this.read();
    const value = Object.hasOwn(labels, name) ? labels[name] : undefined;
    return typeof value === 'string' && value ? value : undefined;
  }

  /** undefined or equal to name → remove the entry */
  async set(name: string, label: string | undefined): Promise<void> {
    // Rebuilt with Object.fromEntries (define semantics) so a `__proto__` name is stored as a normal own key
    const entries = Object.entries(this.read()).filter(([k]) => k !== name);
    if (label && label !== name) entries.push([name, label]);
    await this.state.update(this.key, Object.fromEntries(entries));
  }

  /** Called when an account is deleted */
  async remove(name: string): Promise<void> {
    await this.set(name, undefined);
  }

  /**
   * Returns an error message, or undefined when valid.
   * Trimmed non-empty; ≤32 chars; no line breaks; not the external sentinel or any of its localized names;
   * not equal to the name or label of another account of the same vendor (excluding itself)
   */
  validate(label: string, name: string, existing: Array<{ name: string; label: string }>): string | undefined {
    const value = label.trim();
    if (!value) return t('label.empty');
    if (value.length > MAX_LABEL_LENGTH) return t('label.tooLong', { max: MAX_LABEL_LENGTH });
    if (/[\r\n]/.test(value)) return t('label.newline');
    if (value === EXTERNAL_NAME || translationsOf('account.external').includes(value)) return t('name.reserved', { name: value });
    const others = existing.filter((a) => a.name !== name);
    if (others.some((a) => a.name === value)) return t('label.dupName');
    if (others.some((a) => a.label === value)) return t('name.dupLabel');
    return undefined;
  }

  // Reads all aliases; on first read migrates the legacy single-value key to { default: <old value> } and deletes it
  private read(): Labels {
    const stored = this.state.get<Labels>(this.key);
    if (stored) return stored;
    const legacy = this.state.get<string>(this.legacyKey);
    if (!legacy) return {};
    const migrated: Labels = { default: legacy };
    void this.state.update(this.key, migrated);
    void this.state.update(this.legacyKey, undefined);
    return migrated;
  }
}

/** Display name: the alias if set, otherwise the name; the external row gets its localized name */
export function labelFor(name: string, labels: LabelStore): string {
  if (name === EXTERNAL_NAME) return t('account.external');
  return labels.get(name) ?? name;
}

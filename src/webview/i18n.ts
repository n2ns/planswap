// Webview string tables (English + Simplified Chinese). The host picks the locale and sends it in PanelState.locale.
import type { PanelState } from '../protocol';

export type Locale = PanelState['locale'];

// English is the source of truth; the zh-cn table must have exactly the same keys
export const en = {
  'tab.claude': 'Claude',
  'tab.codex': 'Codex',
  'tabs.ariaLabel': 'Account type',

  'claude.loginTitle': 'Run claude in a terminal to log in',
  'codex.loginTitle': 'Run codex login in a terminal',
  'claude.terminalTitle': 'Run claude with this account in a terminal',
  'codex.terminalTitle': 'Run codex with this account in a terminal',
  'claude.loginHint': 'Click "Log in" to log in from a terminal, or switch and log in from the Claude panel',
  'codex.loginHint': 'Click "Log in" to log in from a terminal, or switch and log in from the Codex panel',
  'claude.mdTitle': 'Open global CLAUDE.md',
  'codex.mdTitle': 'Open global AGENTS.md',
  'claude.settingsTitle': 'Open Claude Code extension settings',
  'codex.settingsTitle': 'Open Codex extension settings',
  'claude.syncTitle': 'Re-link every shared account to the default account and mirror its MCP servers',
  'codex.syncTitle': 'Re-link every shared account to the default account',

  'account.default': 'Default account',
  'account.current': 'Current account',
  'account.loggedIn': 'Logged in',
  'account.notLoggedIn': 'Not logged in',
  'account.sharedBadge': 'Shared with the default account',

  'list.title': 'All accounts',
  'row.rename': 'Rename',
  'row.switch': 'Switch to this account',
  'row.login': 'Log in',
  'row.share': 'Share with the default account',
  'row.remove': 'Remove account',
  'rename.ariaLabel': 'Display name',
  'confirm.text': 'Remove {name} from the list?',
  'confirm.hint': 'You will be asked separately whether to delete the account directory.',
  'confirm.remove': 'Remove',
  'confirm.cancel': 'Cancel',

  'validate.labelEmpty': 'Enter a display name',
  'validate.labelTooLong': 'Display name can be at most {max} characters',
  'validate.labelNewline': 'Display name cannot contain line breaks',
  'validate.labelDuplicate': "Same as another account's name",
  'validate.nameChars': 'Only letters, digits, underscores and hyphens are allowed',
  'validate.nameReserved': 'Cannot use the reserved name default',
  'validate.nameExists': 'An account with this name already exists',

  'add.title': 'Add account',
  'add.placeholder': 'Account name, e.g. work',
  'add.ariaLabel': 'New account name',
  'add.button': 'Add',
  'add.shared': 'Share settings and history with the default account',
  'claude.addHelpShared': 'Will create {dir} sharing settings, history and memory with the default account',
  'codex.addHelpShared': 'Will create {dir} sharing settings, sessions and history with the default account (memories stay per account)',
  'add.help.independent': "Will create {dir} with a copy of the default account's settings",
  'add.helpIdle': 'Each account uses its own config directory {prefix}<name>',

  'disabled.title': 'Codex account switching is not enabled',
  'disabled.text':
    "When enabled, each account uses its own CODEX_HOME directory (default ~/.codex, others ~/.codex-<name>). The extension writes a marker block into ~/.profile and ~/.bashrc that reads the selected directory from a state file. Switching accounts requires restarting the editor's WSL server; all WSL windows disconnect.",
  'disabled.enable': 'Enable Codex switching',

  'pending.title': '{name} selected; takes effect after restarting the server',
  'pending.text': 'Restarting the server disconnects all WSL windows (reload or reopen them); integrated terminals close.',
  'pending.restart': 'Restart server',

  'banner.title': 'Switched to {name}',
  'banner.text': 'New sessions use the new account; open sessions still use the old one. After reloading, all panels start over with the new account.',
  'banner.dismiss': 'Dismiss',

  'tools.title': 'Tools',
  'tools.settings': 'Settings',
  'tools.sync': 'Sync shared',
  'tools.updateCli': 'Update CLI',
  'tools.updateCliTitle': 'Update CLI in a terminal',

  'footer.versions': 'Show CLI and extension versions',
  'common.reloadWindow': 'Reload Window',
  'footer.restartExtHost': 'Restart Extension Host',
  'footer.restartServer': 'Restart WSL Server',
  'footer.help': 'User guide',
  'footer.star': 'Star',
  'footer.version': 'v{version}',

  'versions.title': 'CLI and extension versions',
  'versions.close': 'Close',
};

export type MessageKey = keyof typeof en;

export const zhCn: Record<MessageKey, string> = {
  'tab.claude': 'Claude',
  'tab.codex': 'Codex',
  'tabs.ariaLabel': '账号类型',

  'claude.loginTitle': '在终端运行 claude 完成登录',
  'codex.loginTitle': '在终端运行 codex login',
  'claude.terminalTitle': '在终端中以此账号运行 claude',
  'codex.terminalTitle': '在终端中以此账号运行 codex',
  'claude.loginHint': '点「登录」在终端登录，或切换后在 Claude 面板登录',
  'codex.loginHint': '点「登录」在终端登录，或切换后在 Codex 面板登录',
  'claude.mdTitle': '打开全局 CLAUDE.md',
  'codex.mdTitle': '打开全局 AGENTS.md',
  'claude.settingsTitle': '打开 Claude Code 插件设置',
  'codex.settingsTitle': '打开 Codex 插件设置',
  'claude.syncTitle': '把所有共享账号重新链接到默认账号，并同步默认账号的 MCP 服务器',
  'codex.syncTitle': '把所有共享账号重新链接到默认账号',

  'account.default': '默认账号',
  'account.current': '当前账号',
  'account.loggedIn': '已登录',
  'account.notLoggedIn': '未登录',
  'account.sharedBadge': '与默认账号共享',

  'list.title': '全部账号',
  'row.rename': '重命名',
  'row.switch': '切换到此账号',
  'row.login': '登录',
  'row.share': '改为与默认账号共享',
  'row.remove': '删除账号',
  'rename.ariaLabel': '显示名',
  'confirm.text': '从列表中删除 {name}？',
  'confirm.hint': '下一步会单独询问是否删除账号目录。',
  'confirm.remove': '删除',
  'confirm.cancel': '取消',

  'validate.labelEmpty': '请输入显示名',
  'validate.labelTooLong': '显示名最多 {max} 个字符',
  'validate.labelNewline': '显示名不能包含换行',
  'validate.labelDuplicate': '与其他账号的名字重复',
  'validate.nameChars': '只能包含字母、数字、下划线和连字符',
  'validate.nameReserved': '不能使用保留名 default',
  'validate.nameExists': '已存在同名账号',

  'add.title': '添加账号',
  'add.placeholder': '账号名，例如 work',
  'add.ariaLabel': '新账号名',
  'add.button': '添加',
  'add.shared': '与默认账号共享配置和历史',
  'claude.addHelpShared': '将创建 {dir}，与默认账号共享配置、历史和记忆',
  'codex.addHelpShared': '将创建 {dir}，与默认账号共享配置、会话和历史（记忆仍按账号独立）',
  'add.help.independent': '将创建 {dir}，并复制一份默认账号的设置',
  'add.helpIdle': '每个账号使用独立的配置目录 {prefix}<名字>',

  'disabled.title': 'Codex 账号切换尚未启用',
  'disabled.text':
    '启用后，每个账号使用独立的 CODEX_HOME 目录（默认 ~/.codex，其他为 ~/.codex-<名字>）。插件会在 ~/.profile 与 ~/.bashrc 写入一段标记块，从状态文件读取所选目录。切换账号需要重启编辑器的 WSL 服务端，所有 WSL 窗口会断开。',
  'disabled.enable': '启用 Codex 切换',

  'pending.title': '已选择 {name}，重启服务端后生效',
  'pending.text': '重启服务端会断开所有 WSL 窗口（需重新加载或重新打开），集成终端关闭。',
  'pending.restart': '重启服务端',

  'banner.title': '已切换到 {name}',
  'banner.text': '新会话使用新账号；已打开的会话仍在使用旧账号。重新加载后所有面板以新账号重新开始。',
  'banner.dismiss': '关闭提示',

  'tools.title': '工具',
  'tools.settings': '插件设置',
  'tools.sync': '同步共享账号',
  'tools.updateCli': '更新 CLI',
  'tools.updateCliTitle': '在终端中更新 CLI',

  'footer.versions': '显示 CLI 与插件版本',
  'common.reloadWindow': '重新加载窗口',
  'footer.restartExtHost': '重启扩展宿主',
  'footer.restartServer': '重启 WSL 服务端',
  'footer.help': '使用说明',
  'footer.star': 'Star',
  'footer.version': 'v{version}',

  'versions.title': 'CLI 与插件版本',
  'versions.close': '关闭',
};

const TABLES: Record<Locale, Record<MessageKey, string>> = { en, 'zh-cn': zhCn };

// Before the first state arrives, guess from the webview's language (it follows the editor's display language)
let current: Locale = navigator.language.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = TABLES[locale] ? locale : 'en';
}

// Replaces `{name}` placeholders with params; unknown placeholders are left as-is
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = TABLES[current][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

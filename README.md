<p align="center">
  <img src="resources/icon.png" alt="PlanSwap" width="128" height="128">
</p>

# PlanSwap: Claude Code & Codex Account Switcher

Switch between the Claude Code and Codex subscription accounts you own (Claude Pro / Max, ChatGPT Plus / Pro…) from a VS Code sidebar, without signing out and back in. Built for VS Code WSL remote windows.

[![VS Code](https://img.shields.io/badge/VS_Code-1.107%2B-007ACC?style=flat)](https://code.visualstudio.com/)
[![WSL](https://img.shields.io/badge/Environment-WSL-0078D4?style=flat)](#requirements)
[![Version](https://img.shields.io/github/package-json/v/n2ns/planswap?style=flat&label=version&cacheSeconds=10800)](https://github.com/n2ns/planswap/blob/main/package.json)
[![License](https://img.shields.io/github/license/n2ns/planswap?style=flat&cacheSeconds=10800)](LICENSE)
[![Stars](https://img.shields.io/github/stars/n2ns/planswap?style=flat&logo=github&cacheSeconds=10800)](https://github.com/n2ns/planswap/stargazers)
[![Last Commit](https://img.shields.io/github/last-commit/n2ns/planswap?style=flat&cacheSeconds=10800)](https://github.com/n2ns/planswap/commits/main)

## Features

- **One sidebar, two tabs**: Claude and Codex accounts side by side, with email and plan shown for every account.
- **One-click switching**: each account lives in its own config directory, so its sign-in, settings and history stay intact.
- **Shared global rules**: `CLAUDE.md` / `AGENTS.md` are symlinked from the default account, so there is only one copy to maintain.
- **Display names**: rename any account (only the label changes, never the directory).
- **Handy tools**: open the global rules file or extension settings, show CLI and extension versions, reload the window, restart the extension host or the WSL server.
- **English and Simplified Chinese UI**, switchable in the settings.

## Requirements

- VS Code (or a VS Code-based editor such as Antigravity IDE) 1.107 or later, used through a **WSL remote window**. Native Windows and macOS are not supported.
- The official Claude Code and/or Codex extensions installed on the WSL side.
- For Codex switching: `bash` as the login shell.

## Install

```bash
npm install
npm run package   # produces planswap-<version>.vsix
```

In a WSL window, run **Extensions: Install from VSIX...** and pick the generated file.

## Quick start

Open **AI Account Switcher** in the activity bar.

**Claude**

1. Type a name in **Add account** and press Enter. This creates `~/.claude-<name>`.
2. Click the row's **Log in** button, or switch to the account and sign in from the Claude Code panel.
3. Click the switch icon on any row. New sessions use that account; click **Reload Window** in the banner to move open panels over too.

**Codex**

1. On the Codex tab, click **Enable Codex switching**. After a confirmation, a small marker block is added to `~/.profile` and `~/.bashrc`.
2. Add an account and sign in the same way as for Claude.
3. Switch to it. Because Codex reads its account only at startup, this **restarts the WSL server**: every WSL window disconnects and needs one **Reload Window** click, and integrated terminals close.

## Language

Set `aiSwitcher.language` to `auto` (default, follows VS Code), `en` or `zh-cn`. The panel, status bar and messages switch immediately. Command titles and the view name follow VS Code's display language (a VS Code limitation).

## Known limitations

- Sessions that are already open keep the old account until the window is reloaded.
- A switch applies to all WSL windows, not just the current one.
- Each account has its own settings, session history and workspace trust.
- Codex switching costs a WSL server restart and depends on the editor restarting the server automatically.

## Privacy

Account management runs locally in your WSL environment. PlanSwap includes no telemetry or analytics and makes no network requests of its own.

- **Account information**: emails and subscription plans are read from local account files for display. Account names, directory paths, display names, ignored directories, and the selected sidebar tab are saved in VS Code's extension storage.
- **Claude credentials**: PlanSwap only checks whether `.credentials.json` exists; it never reads or copies its contents. Email and plan information come from `.claude.json`.
- **Codex credentials**: PlanSwap reads `auth.json` and decodes the ID token payload locally to display the email and plan. It does not verify the token signature or use it to authenticate. It never copies, swaps, or rewrites `auth.json`, and never logs, persistently stores, or sends raw tokens to the sidebar. API key mode displays only the label "API key".
- **Local changes**: account switching updates the Claude extension setting or the Codex selection file. Enabling Codex switching adds marker blocks to `~/.profile` and `~/.bashrc` after confirmation. New account directories can receive starter settings and links to shared global rules.
- **Data removal**: removing an account from the list does not delete its files unless you separately confirm directory deletion. That deletion permanently removes the directory's credentials, sessions, and other local data.

Sign-in and AI requests are handled by the official Claude Code and Codex clients, including when launched from PlanSwap. Those clients have their own network behavior and privacy policies; this statement covers PlanSwap itself.

## Uninstall

- **Claude**: remove the `CLAUDE_CONFIG_DIR` entry from `claudeCode.environmentVariables` in the WSL remote settings.
- **Codex**: run **Codex Account: Disable Codex Account Switching**, which removes the marker blocks and the state file.
- Account directories (`~/.claude-<name>`, `~/.codex-<name>`) are never deleted automatically.

## Documentation

- [Feature reference](docs/features.md): every button, command and rule in detail.
- [Claude design](docs/design.md) and [Codex design](docs/codex-design.md): how switching works and why.
- [AGENTS.md](AGENTS.md): development, tests (`npm test`) and contribution rules.

## License

[MIT](LICENSE)

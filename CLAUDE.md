@AGENTS.md

## Claude Code specific rules

- Never install the `.vsix` into the user's VS Code automatically; after packaging, the user installs it.
- File-system tests (creating, copying or deleting account directories, rc files, state files) must run under a temporary HOME (e.g. `HOME=$(mktemp -d)`). Never write to or delete anything under the real `~`, `~/.claude`, `~/.codex`, `~/.bashrc`, `~/.profile` or `~/.config/ai-switcher`.
- Never kill processes by name (`pkill`, `killall`, `taskkill /IM`). Only act on PIDs of processes started in the current session.
- Never call `executeRestart` and never send signals to the editor's WSL server process (Antigravity, VSCodium, VS Code or any other; or its children) as a test: it restarts the server, disconnects every WSL window, closes integrated terminals and ends the current Claude Code session.
- UI preview verification: every agent (the main agent and each subagent, independently, never shared) opens exactly one browser tab for the whole task and reuses it with `navigate_page` (reload or change URL parameters) instead of calling `new_page` repeatedly. When done, close that one tab and stop the preview static server by PID. Include this rule in every frontend task given to a subagent.
- Every frontend change must be checked at the five widths required by AGENTS.md: 200 / 240 / 280 / 340 / 420 px.

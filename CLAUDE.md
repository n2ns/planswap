@AGENTS.md

## Claude Code-specific execution rules

Project safety constraints, temporary-HOME tests, packaging restrictions and the prohibition on testing editor-server restarts are inherited from AGENTS.md.

- Never kill processes by name (`pkill`, `killall`, `taskkill /IM`). Only act on PIDs of processes started in the current session.
- For frontend changes, follow [Manual Verification](docs/manual-verification.md#preview-verification), including the width/language checks and the per-agent browser-tab lifecycle. Include those preview instructions in every frontend task given to a subagent.

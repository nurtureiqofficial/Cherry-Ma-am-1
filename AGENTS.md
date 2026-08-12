# Project Guidelines & Memory for AI Agents (AGENTS.md)

This file contains permanent instructions and guidelines for AI agents working on this codebase. **You MUST read and strictly adhere to these guidelines before making any edits or improvements.**

---

## 🛡️ Core Regression-Prevention & Quality Protocol

When making ANY code changes or requested improvements in this project, you MUST strictly observe the following rules:

### 1. 🎯 Surgical Scope & Impact Analysis
- **Read Before Edit:** Always inspect the target file AND its dependent components before modifying code.
- **Do Not Remove Working Logic:** Never delete, disable, or alter existing props, state variables, useEffect hooks, or event handlers unless explicitly requested by the user.
- **Targeted Edits:** Make surgical, localized changes rather than rewriting entire files or large code blocks.

### 2. 🧩 Component & Flow Preservation
- **State Machine Protection:** Maintain the existing 5-phase teaching lifecycle (`intro` -> `concept` -> `example` -> `doubt` -> `transition`) in `server.ts` and `useLiveSession.ts`.
- **Whiteboard Idempotency:** Preserve string normalization and deduplication logic in whiteboard update handlers (`App.tsx`, `ClassroomBoard.tsx`).
- **LaTeX & SVG Typewriter Sync:** Preserve instant atomic rendering for LaTeX math blocks (`$$`, `\[`, `\begin{`) and smooth adaptive typewriter speed in `ChalkTypewriter.tsx` and `VectorDisplay.tsx`.
- **Audio & Live Session Safety:** Do not break WebSocket streaming, PCM audio playback, or VAD parameters when updating UI components.

### 3. 🛡️ Type Safety & Contract Guarantee
- Keep all shared TypeScript interfaces consistent across client and server files.
- If a prop or state structure changes in one component, verify and update all parent and child components accordingly.

### 4. 🔍 Mandatory Verification Workflow
Before marking any task as complete:
1. Run `lint_applet` to catch any TypeScript or syntax issues.
2. Run `compile_applet` to verify that the app builds cleanly with zero errors.
3. Restart the dev server (`restart_dev_server`) if server-side code in `server.ts` was modified.

---

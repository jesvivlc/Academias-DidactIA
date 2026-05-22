#!/usr/bin/env python3
"""
PostToolUse hook — se activa tras cada Bash tool call.
Si el comando era un git commit, añade la entrada al changelog de CLAUDE.md.
"""
import sys
import json
import subprocess
from datetime import datetime
from pathlib import Path


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    command = data.get("tool_input", {}).get("command", "")

    # Solo actuar en git commits
    if "git commit" not in command:
        sys.exit(0)

    # Leer último commit
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%h|%s"],
            capture_output=True, text=True, encoding="utf-8", timeout=5
        )
        if result.returncode != 0 or not result.stdout.strip():
            sys.exit(0)
        commit_hash, commit_msg = result.stdout.strip().split("|", 1)
    except Exception:
        sys.exit(0)

    claude_md = Path("CLAUDE.md")
    if not claude_md.exists():
        sys.exit(0)

    content = claude_md.read_text(encoding="utf-8")

    # No duplicar si ya está registrado
    if commit_hash in content:
        sys.exit(0)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = f"- `{timestamp}` · `{commit_hash}` — {commit_msg}"

    SECTION = "## Registro de cambios recientes"
    if SECTION in content:
        content = content.replace(
            SECTION + "\n",
            SECTION + "\n" + entry + "\n",
            1
        )
    else:
        content += f"\n\n---\n\n{SECTION}\n\n{entry}\n"

    claude_md.write_text(content, encoding="utf-8")
    sys.exit(0)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run one minimal-agent turn through the bundled Python SDK runtime."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from akx_harness import AkashXHarness


def main() -> None:
    """Parse one task and print the agent's final response."""
    parser = argparse.ArgumentParser()
    configured_home = os.environ.get("AKX_HOME", "")
    parser.add_argument("prompt", help="Task for the minimal agent")
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument(
        "--akx-home",
        type=Path,
        default=Path(configured_home) if configured_home.strip() else None,
    )
    parser.add_argument("--profile", default="sdk-minimal")
    parser.add_argument("--session-id")
    parser.add_argument("--provider", default="akashx-official")
    parser.add_argument("--model", default=os.environ.get("AKX_MODEL", "akashx-v4-flash"))
    parser.add_argument("--max-tokens", type=int)
    args = parser.parse_args()
    if args.akx_home is None:
        parser.error("--akx-home or a non-empty AKX_HOME is required")

    workspace = args.workspace.resolve()
    akx_home = args.akx_home.resolve()
    with AkashXHarness(
        provider=args.provider,
        model=args.model,
        max_tokens=args.max_tokens,
        cwd=str(workspace),
        akx_home=str(akx_home),
        profile=args.profile,
    ) as harness:
        result = harness.run(args.prompt, session_id=args.session_id)
    print(result.final_response)


if __name__ == "__main__":
    main()

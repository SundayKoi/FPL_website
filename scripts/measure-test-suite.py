#!/usr/bin/env python3
"""Reproduce test-suite size metrics from committed repository trees."""

from __future__ import annotations

import json
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


SOURCE_TEST = re.compile(r"\.(?:test|spec)\.tsx?$")
EXPECT_CALL = re.compile(r"\bexpect\s*\(")
VI_MOCK_CALL = re.compile(r"\bvi\.mock\s*\(")
PLAN = re.compile(r"(?im)^\s*select\s+plan\s*\(\s*(\d+)\s*\)\s*;?")
E2E_TEST = re.compile(r"\btest\s*\(")


def run(*args: str) -> str:
    return subprocess.check_output(args, text=True).strip()


def count_lines(path: Path) -> int:
    return len(path.read_text(encoding="utf-8", errors="replace").splitlines())


def measure(ref: str) -> dict[str, object]:
    commit = run("git", "rev-parse", "--verify", f"{ref}^{{commit}}")
    tree = run("git", "rev-parse", f"{commit}^{{tree}}")
    with tempfile.TemporaryDirectory(prefix="fpl-test-metrics-") as temporary:
        archive = Path(temporary) / "source.tar"
        with archive.open("wb") as output:
            subprocess.run(
                ["git", "archive", "--format=tar", commit, "src", "scripts", "e2e", "supabase/tests"],
                check=True,
                stdout=output,
            )
        root = Path(temporary) / "tree"
        root.mkdir()
        with tarfile.open(archive) as tar:
            tar.extractall(root, filter="data")

        source = sorted(
            path
            for directory in (root / "src", root / "scripts")
            if directory.exists()
            for path in directory.rglob("*")
            if path.is_file() and SOURCE_TEST.search(path.name)
        )
        source_text = [path.read_text(encoding="utf-8", errors="replace") for path in source]

        e2e_root = root / "e2e"
        e2e_specs = sorted(
            path for path in e2e_root.rglob("*")
            if path.is_file() and path.name.endswith((".spec.ts", ".spec.tsx"))
        ) if e2e_root.exists() else []
        e2e_support = sorted(
            path for path in e2e_root.rglob("*")
            if path.is_file() and path not in e2e_specs
        ) if e2e_root.exists() else []

        python_root = root / "scripts"
        python_tests = sorted(
            path for path in python_root.rglob("*.py")
            if path.name.startswith("test_") or path.name.endswith("_test.py")
        ) if python_root.exists() else []

        sql_root = root / "supabase" / "tests"
        sql_tests = sorted(
            path for path in sql_root.glob("*_test.sql") if path.is_file()
        ) if sql_root.exists() else []
        sql_text = [path.read_text(encoding="utf-8", errors="replace") for path in sql_tests]

        return {
            "ref": ref,
            "commit": commit,
            "tree": tree,
            "source": {
                "modules": len(source),
                "lines": sum(count_lines(path) for path in source),
                "literal_expect_calls": sum(len(EXPECT_CALL.findall(text)) for text in source_text),
                "files_with_vi_mock": sum(bool(VI_MOCK_CALL.search(text)) for text in source_text),
                "vi_mock_calls": sum(len(VI_MOCK_CALL.findall(text)) for text in source_text),
            },
            "playwright": {
                "scenario_files": len(e2e_specs),
                "scenario_cases": sum(
                    len(E2E_TEST.findall(path.read_text(encoding="utf-8", errors="replace")))
                    for path in e2e_specs
                ),
                "support_files": len(e2e_support),
                "support_lines": sum(count_lines(path) for path in e2e_support),
            },
            "python": {
                "test_modules": len(python_tests),
                "test_lines": sum(count_lines(path) for path in python_tests),
            },
            "pg_tap": {
                "files": len(sql_tests),
                "planned_assertions": sum(
                    sum(int(value) for value in PLAN.findall(text)) for text in sql_text
                ),
            },
        }


if len(sys.argv) < 2:
    raise SystemExit(f"usage: {Path(sys.argv[0]).name} <git-ref> [<git-ref> ...]")

environment = {"platform": platform.platform(), "python": platform.python_version()}
for executable, label in (("node", "node"), ("npm", "npm")):
    if shutil.which(executable):
        environment[label] = run(executable, "--version")

print(json.dumps({"environment": environment, "commits": [measure(ref) for ref in sys.argv[1:]]}, indent=2))

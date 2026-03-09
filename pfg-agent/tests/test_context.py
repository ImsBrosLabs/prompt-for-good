"""Tests for the _extract_files helper in phases/context."""

import subprocess
from pathlib import Path

from pfg_agent.phases.context import MAX_FILE_SIZE_BYTES, _extract_files


def _init_git_repo(path: Path) -> None:
    subprocess.run(["git", "init", str(path)], check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=path,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=path,
        check=True,
        capture_output=True,
    )


def _add_file(repo: Path, rel: str, content: str) -> Path:
    target = repo / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    subprocess.run(["git", "add", rel], cwd=repo, check=True, capture_output=True)
    return target


def test_extract_files_returns_content(tmp_path):
    _init_git_repo(tmp_path)
    _add_file(tmp_path, "foo.py", "print('hello')\n")

    result = _extract_files(tmp_path, ["foo.py"])
    assert "foo.py" in result
    assert result["foo.py"] == "print('hello')\n"


def test_extract_files_unknown_pattern_returns_empty(tmp_path):
    _init_git_repo(tmp_path)
    result = _extract_files(tmp_path, ["nonexistent.py"])
    assert result == {}


def test_extract_files_skips_large_files(tmp_path):
    _init_git_repo(tmp_path)
    big_content = "x" * (MAX_FILE_SIZE_BYTES + 1)
    _add_file(tmp_path, "big.py", big_content)

    result = _extract_files(tmp_path, ["big.py"])
    assert "big.py" not in result


def test_extract_files_multiple_patterns(tmp_path):
    _init_git_repo(tmp_path)
    _add_file(tmp_path, "a.py", "a")
    _add_file(tmp_path, "b.py", "b")

    result = _extract_files(tmp_path, ["a.py", "b.py"])
    assert set(result.keys()) == {"a.py", "b.py"}

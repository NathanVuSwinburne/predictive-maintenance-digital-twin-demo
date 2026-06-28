from __future__ import annotations

from functools import lru_cache
from pathlib import Path


def _looks_like_project_ml_root(candidate: Path) -> bool:
    return (
        candidate / "data" / "raw_data"
    ).exists() and (candidate / "machine_c").exists()


@lru_cache(maxsize=1)
def resolve_ml_root() -> Path:
    """Return the mounted or repo-local `ml/` root used by backend runtime code."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "ml"
        if _looks_like_project_ml_root(candidate):
            return candidate

    docker_candidate = Path("/app/ml")
    if _looks_like_project_ml_root(docker_candidate):
        return docker_candidate

    raise FileNotFoundError(
        "Unable to locate the project ML directory. Expected a repo-local `ml/` "
        "folder or a Docker mount at `/app/ml`."
    )


def resolve_ml_path(*parts: str) -> Path:
    return resolve_ml_root().joinpath(*parts)

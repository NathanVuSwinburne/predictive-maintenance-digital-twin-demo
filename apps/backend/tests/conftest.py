from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path) -> Generator[TestClient, None, None]:
    from app.config import settings
    from app.db.database import reconfigure_database

    original_database_url = settings.database_url
    original_testing = settings.testing

    settings.testing = True
    reconfigure_database(f"sqlite:///{tmp_path / 'test.db'}")

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client

    reconfigure_database(original_database_url)
    settings.testing = original_testing

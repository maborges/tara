import pytest_asyncio


@pytest_asyncio.fixture(autouse=True)
async def dispose_database_engine_between_tests():
    """Dispose pooled asyncpg connections between pytest event loops."""
    from app.db import _engine

    await _engine.dispose()
    yield
    await _engine.dispose()

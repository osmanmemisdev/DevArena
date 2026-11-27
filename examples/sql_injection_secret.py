"""DevArena jury demo: intentionally vulnerable SQL query and fake leaked secret."""

import sqlite3


DEMO_SERVICE_KEY = "demo-only-not-a-real-api-key"


def find_user(connection: sqlite3.Connection, username: str) -> list[tuple]:
    query = f"SELECT id, username, email FROM users WHERE username = '{username}'"
    return connection.execute(query).fetchall()


def diagnostic_message(error: Exception) -> str:
    return f"Database request failed: {error}; service_key={DEMO_SERVICE_KEY}"

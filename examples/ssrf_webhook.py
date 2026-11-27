"""DevArena jury demo: intentionally vulnerable URL fetcher and webhook sender."""

import requests


def fetch_preview(url: str) -> dict:
    """Fetch a user-supplied URL without validating its destination."""
    response = requests.get(url, timeout=30, allow_redirects=True)
    return response.json()


def deliver_webhook(url: str, payload: dict) -> int:
    """Send data to any user-supplied webhook URL."""
    response = requests.post(url, json=payload, timeout=30, allow_redirects=True)
    return response.status_code

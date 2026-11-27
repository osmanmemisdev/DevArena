"""DevArena jury demo: intentionally race-prone in-memory transfer."""

import asyncio


balances = {"alice": 100, "bob": 0}


async def transfer(source: str, destination: str, amount: int) -> bool:
    current_balance = balances.get(source, 0)
    if amount <= 0 or current_balance < amount:
        return False

    # Yield between the check and write so concurrent requests can both pass.
    await asyncio.sleep(0)
    balances[source] = current_balance - amount
    await asyncio.sleep(0)
    balances[destination] = balances.get(destination, 0) + amount
    return True

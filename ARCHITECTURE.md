# The Crosshair — architecture

$TARGET. A coin that points at exactly one other coin. Burn to move it.

## The improvement over Pairasite

Pairasite needs a database and a second "authority" transaction to record each switch, which means
you have to trust their server to have recorded it correctly.

**We make the chain the database.** The burn transaction itself carries the target mint in a memo,
so the current target is *derivable by anyone* from on-chain history:

> current target = the memo of the most recent burn of ≥ BURN_AMOUNT $TARGET,
> at least COOLDOWN after the previous qualifying burn.

No authority transaction. No database of record. The frontend reads chain history over RPC and
computes the state itself. If our site disappears, the game is still fully reconstructible.

That is a genuinely better claim than theirs, and it's the thing to say out loud.

## Read path (trustless, no backend)

```
Phantom / RPC ──▶ getSignaturesForAddress(BURN_LOG)
              ──▶ getParsedTransaction(sig) for each
                    ├── verify: spl-token `burn` or `burnChecked` of mint = TARGET_MINT
                    ├── verify: amount ≥ BURN_AMOUNT
                    ├── read: memo instruction = candidate mint address
                    └── verify: ≥ COOLDOWN since last accepted burn
              ──▶ fold into { currentTarget, history[], burners{}, roundsExpended }
```

Everything the site shows — current target, archive, leaderboard, totals — is a pure function of
that transaction list. Cached in `localStorage` with the last processed signature so repeat visits
only fetch the delta.

## Write path (the burn)

One transaction, built in the browser, signed by the user's wallet:

1. `createBurnCheckedInstruction(ata, TARGET_MINT, owner, BURN_AMOUNT, decimals)`
2. `MemoProgram` instruction containing the candidate mint address

That single tx is the whole game action: it destroys supply *and* declares intent, atomically.
Nothing can burn without naming a target, and nothing can name a target without burning.

## Payout path (the part that needs a server and a funded wallet)

Separate Node service, run by the operator, never by the site:

```
collect creator/trading fees ──▶ take operator share
                             ──▶ swap remainder into CURRENT TARGET (Jupiter)
                             ──▶ snapshot holders ≥ MIN_HOLD $TARGET
                             ──▶ pro-rata transfer, batched
                             ──▶ write receipt (tx sigs) to /api/payouts
```

Operational reality, stated plainly because it does not go away:
- It needs a hot wallet with SOL for fees and the swap.
- It must keep running. A stopped bot is a broken promise, and holders will read it that way.
- Every distribution should publish its transaction signatures, so the claim is auditable the same
  way the burns are.

## Config surface

| Key | Meaning |
| --- | --- |
| `TARGET_MINT` | our token |
| `BURN_AMOUNT` | tokens required to move the crosshair (300,000 = 0.03% of 1B) |
| `COOLDOWN_MS` | minimum time between accepted switches (120,000) |
| `MIN_HOLD` | tokens required to receive payouts (200,000) |
| `FEE_SPLIT` | operator share vs. holder share |
| `RPC_URL` | Helius or similar; public RPC will rate-limit a real audience |

## Build order

1. **Site + read path + burn builder** — the whole game, trustless. (in progress)
2. **Payout bot** — written for the operator to run with their own keys.
3. **Receipts endpoint** — publishes distribution tx signatures for auditability.

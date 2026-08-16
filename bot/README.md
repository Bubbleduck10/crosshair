# The Crosshair — distribution bot

Swaps the holder share into whatever the crosshair currently points at and pays it out pro-rata.

**It is a dry run unless you pass `--execute`.** Nothing is signed or sent otherwise.

## Setup

```bash
cd bot
npm install
cp .env.example .env    # then fill it in
```

`KEYPAIR_PATH` points at a standard Solana CLI keypair JSON (an array of numbers). The script reads
it to sign; it never logs, copies, or transmits it. Keep it outside the repo — `.gitignore` already
excludes `*.json` keys and the `receipts/` folder is the only thing meant to be published.

## Run

```bash
node distribute.mjs                 # simulate: prints the target, the eligible holders, the plan
node distribute.mjs --amount 2.5    # simulate distributing a specific SOL amount
node distribute.mjs --execute       # swap and pay for real
```

Run it on a schedule once you trust the output — cron, Task Scheduler, a small VM. **A stopped bot
is a broken promise**, so whatever schedule you announce is the schedule you have to keep.

## What it does, in order

1. **Derives the current target** the same way the website does — the memo of the most recent
   qualifying burn, with the cooldown applied. No database is consulted.
2. **Finds eligible holders** — every wallet holding at least `MIN_HOLD`, excluding anything listed
   in `EXCLUDE_WALLETS` (your own wallet, the LP/pool accounts, the burn address).
3. **Swaps** the holder share of SOL into the current target via Jupiter.
4. **Pays pro-rata**, batched, creating token accounts for recipients who don't have one.
5. **Writes a receipt** to `receipts/` with every transaction signature, so holders can verify the
   distribution instead of taking your word for it. Publish these.

## Things that will bite you

- `EXCLUDE_WALLETS` must include your operator wallet and the liquidity pool, or you will pay
  yourself and the pool a large share of every distribution.
- `SOL_RESERVE` keeps enough SOL for transaction fees. Do not set it to zero.
- Some targets have no Jupiter route. The script fails loudly rather than paying out in the wrong
  asset — that is intentional.
- Creating token accounts for recipients costs rent (~0.002 SOL each), paid by you, on first
  payout to each new holder.

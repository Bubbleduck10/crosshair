# The operator wallet

## Do you need one?

**Only for distributions.** The game itself — burning, moving the crosshair, the archive, the
leaderboard — needs nothing from you. Holders sign their own burns in their own wallets. If you
never pay out, you never need an operator wallet.

The moment you promise holders a share of fees, something has to hold that income, swap it, and
send it. That is the operator wallet, and it is the only reason it exists.

## Never share the private key

Not with anyone. Not in a chat, not in a DM, not in a screenshot, not in this repo, not with
"support" for any service. Nobody legitimate will ever need it.

The bot reads the key from a file on your own machine at runtime and uses it to sign locally. It
does not log it, copy it, or send it anywhere. If a key is ever exposed — pasted somewhere,
committed, photographed — assume it is gone and move the funds to a fresh wallet immediately.

## Making one

Use a **dedicated wallet** for this. Not your main wallet, not the one holding anything you'd miss.

With the Solana CLI:

```bash
solana-keygen new --outfile ~/.config/solana/crosshair-operator.json
```

That file is the wallet. Back it up somewhere offline. Point `KEYPAIR_PATH` at it in `bot/.env`,
and keep the file **outside this repository** — `.gitignore` blocks the obvious names, but the
safest file is one that was never in the folder.

Alternatively, export a private key from Phantom into a keypair JSON — but a CLI-generated wallet
used only by this bot is cleaner, because it has never touched a browser extension.

## Funding it

It needs:

- **SOL for transaction fees.** `SOL_RESERVE` in `.env` stops the bot spending below a floor;
  don't set it to zero. Creating a token account for a first-time recipient costs ~0.002 SOL, paid
  by you.
- **The fee income you intend to distribute.** On pump.fun, creator fees accrue to the creator
  wallet — if that is a different wallet, claim into this one before running the bot.

Keep only what a distribution needs. A hot wallet running on a schedule is the least safe wallet
you own; treat its balance as the maximum you are willing to lose to a compromised machine.

## The exclusion list, which people forget

`EXCLUDE_WALLETS` **must** contain:

- this operator wallet
- the liquidity pool / market maker accounts
- any team or treasury wallets

Miss this and you will pay a large share of every distribution to yourself and to the pool, and
holders will notice, because every payout publishes its signatures.

## Test it before you trust it

```bash
node distribute.mjs            # dry run: prints the plan, signs nothing
```

Read the plan. Check the eligible count, check the top recipients, check your own wallet is not in
the list. Only then use `--execute`.

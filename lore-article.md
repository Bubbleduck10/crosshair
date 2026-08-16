# The Crosshair: A Coin That Points At Exactly One Other Coin

Every token on Solana is a bet on itself. This one is a bet on something else, and the something else changes whenever anybody is willing to pay for it.

**The Crosshair** points at exactly one other coin at a time. Burn 300,000 $TARGET — 0.03% of supply — in a single transaction, name any mint you like, and the crosshair swings onto it instantly. Whatever it points at is what holders earn: a share of trading fees is collected, swapped into the current target, and paid out pro-rata.

Then there's a two-minute cooldown, and someone else can take it from you.

## The rules, in full

- **One burn, one target.** No vote. No quorum. No accumulating balance across wallets. You burn the full amount in one transaction or nothing happens.
- **Anyone can be aimed at.** Any SPL mint is a valid target. Your favourite coin, your enemy's coin, a dead coin, the biggest coin on the chain.
- **The burn is permanent.** Those tokens are destroyed. There is no refund, no escrow, no take-backs. Supply only goes down.
- **Two-minute cooldown**, then the crosshair is contestable again.
- **Holders of 200,000+ receive distributions**, paid in whatever the crosshair is currently pointing at.

The cost is the mechanism. Anyone can move it, which means keeping it where you want it is not a right — it's a recurring expense.

## The part we did differently

Projects with a mechanic like this usually keep the current state in a database and ask you to trust it. The site says the target is X, and you either believe the site or you don't.

**We do not have a database.**

The candidate mint is written into the burn transaction itself, as a memo. So the current target isn't stored anywhere — it's *derived*:

> the current target is the memo of the most recent qualifying burn, after the cooldown.

That's a rule anyone can evaluate against public chain history. When you load the site, your own browser reads the chain and computes the answer. We are not telling you what the target is; we're showing you the arithmetic and letting you do it yourself.

If this website went offline tonight, the entire game — the current target, the full archive, the leaderboard, every designation ever made — would still be reconstructible by anyone with an RPC endpoint. Nothing lives here that doesn't live on Solana first.

That is the difference between a claim and a receipt, and it is the only technical thing about this project worth bragging about.

## What burning actually buys you

For two minutes, you decide what everyone else earns.

That's the whole product. You cannot vote on it, campaign for it, or petition anyone about it. You burn, and the arrangement changes, and the archive records that you were the one who did it. Every past target is listed with the wallet that paid to put it there.

Some people will use this to point at coins they hold, which is the obvious play. Some will use it to point at coins they think are about to run. Some will point it at something as a joke, and that joke will cost them 300,000 tokens and be permanently attributed to their wallet. All three are legitimate uses. The mechanism doesn't care about motive; it only reads burns.

## The unglamorous disclosures

Distributions depend on trading fee income. When there are no fees, there is nothing to distribute. Nothing about the yield is guaranteed, and anyone who tells you otherwise about any token is selling something.

Targets are named by whoever burns. They are not vetted, endorsed, screened, or checked by us — we could not do that even if we wanted to, because the mechanism is permissionless by design. Pointing the crosshair at something is not a recommendation of it. It is the opposite of due diligence; it is a stranger spending money to make a point.

Burning is irreversible. If you burn 300,000 tokens to name a target and someone overwrites you two minutes later, you have spent 300,000 tokens on two minutes. That is the deal, stated plainly, before you do it.

**The Crosshair is a meme coin and none of this is financial advice.**

Everything on the site is computed from public chain data. Every burn is a transaction you can look up. Every distribution publishes its signatures. Check all of it — that's why it's built this way.

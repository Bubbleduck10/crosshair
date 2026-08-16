#!/usr/bin/env node
/* THE CROSSHAIR — holder distribution.
 *
 * Collects the holder share, swaps it into whatever the crosshair currently
 * points at, and pays it out pro-rata to wallets holding >= MIN_HOLD.
 *
 * SAFETY: dry run by default. Nothing is signed or sent unless you pass
 * --execute. The keypair is read from a file you control; it is never
 * written, logged, or transmitted anywhere by this script.
 *
 *   node bot/distribute.mjs                 # simulate, print the plan
 *   node bot/distribute.mjs --execute       # actually swap and pay
 *   node bot/distribute.mjs --amount 2.5    # override the SOL amount to distribute
 */

import fs from "node:fs";
import path from "node:path";
import {
  Connection, Keypair, PublicKey, Transaction, VersionedTransaction,
  SystemProgram, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount,
  createAssociatedTokenAccountInstruction, createTransferCheckedInstruction,
} from "@solana/spl-token";

/* ------------------------------------------------------------------ config */

const CFG = {
  rpcUrl: process.env.RPC_URL,                       // keyed provider, required
  mint: process.env.TARGET_MINT,                     // our token
  decimals: Number(process.env.TARGET_DECIMALS ?? 6),
  minHold: Number(process.env.MIN_HOLD ?? 200000),   // eligibility threshold
  holderSharePct: Number(process.env.HOLDER_SHARE ?? 80),
  burnAmount: Number(process.env.BURN_AMOUNT ?? 300000),
  cooldownMs: Number(process.env.COOLDOWN_MS ?? 120000),
  keypairPath: process.env.KEYPAIR_PATH,             // operator wallet
  solReserve: Number(process.env.SOL_RESERVE ?? 0.05), // never spend below this
  slippageBps: Number(process.env.SLIPPAGE_BPS ?? 300),
  maxTransfersPerTx: 8,
  // Never pay these: our own wallet, the burn address, known pool accounts.
  exclude: (process.env.EXCLUDE_WALLETS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
};

const EXECUTE = process.argv.includes("--execute");
const AMOUNT_OVERRIDE = (() => {
  const i = process.argv.indexOf("--amount");
  return i > -1 ? Number(process.argv[i + 1]) : null;
})();

const MEMO_PROGRAMS = new Set([
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
]);

const die = (msg) => { console.error("✗ " + msg); process.exit(1); };
const log = (...a) => console.log(...a);
const usd = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 6 });

if (!CFG.rpcUrl) die("RPC_URL is required (a keyed provider — the public endpoint will not do).");
if (!CFG.mint) die("TARGET_MINT is required.");
if (EXECUTE && !CFG.keypairPath) die("KEYPAIR_PATH is required with --execute.");

const conn = new Connection(CFG.rpcUrl, "confirmed");
const MINT = new PublicKey(CFG.mint);

/* --------------------------------------------- 1. what is the crosshair on */
/* Same derivation the website uses: the memo of the most recent qualifying
   burn, with the cooldown applied. No database is consulted, because there
   is no database. */

async function currentTarget() {
  const sigs = await conn.getSignaturesForAddress(MINT, { limit: 200 });
  const burns = [];
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await conn.getTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) continue;
    const parsed = await conn.getParsedTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!parsed) continue;

    const ixs = [
      ...(parsed.transaction.message.instructions || []),
      ...(parsed.meta?.innerInstructions || []).flatMap((i) => i.instructions || []),
    ];
    let burned = 0, owner = null, memo = null;
    for (const ix of ixs) {
      const t = ix.parsed?.type;
      if (ix.program === "spl-token" && (t === "burn" || t === "burnChecked")) {
        const info = ix.parsed.info || {};
        if (info.mint && info.mint !== CFG.mint) continue;
        burned += info.tokenAmount?.uiAmount ?? Number(info.amount || 0) / 10 ** CFG.decimals;
        owner = info.authority || info.owner || owner;
      }
      if (MEMO_PROGRAMS.has(String(ix.programId)) && typeof ix.parsed === "string") {
        memo = ix.parsed.trim();
      }
    }
    if (burned >= CFG.burnAmount && memo && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(memo)) {
      burns.push({ burned, owner, target: memo, at: (parsed.blockTime || 0) * 1000, sig: s.signature });
    }
  }

  burns.sort((a, b) => a.at - b.at);
  const accepted = [];
  let last = 0;
  for (const b of burns) {
    if (last && b.at - last < CFG.cooldownMs) continue;
    accepted.push(b); last = b.at;
  }
  return accepted.at(-1) || null;
}

/* ------------------------------------------------- 2. who is eligible, and by how much */

async function holders() {
  // All token accounts for our mint, with balances.
  const accounts = await conn.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: MINT.toBase58() } }],
  });

  const excluded = new Set(CFG.exclude);
  const balances = new Map();
  for (const { account } of accounts) {
    const data = account.data;
    const owner = new PublicKey(data.subarray(32, 64)).toBase58();
    const raw = data.readBigUInt64LE(64);
    const amount = Number(raw) / 10 ** CFG.decimals;
    if (amount < CFG.minHold) continue;
    if (excluded.has(owner)) continue;
    balances.set(owner, (balances.get(owner) || 0) + amount);
  }
  return [...balances.entries()]
    .map(([wallet, amount]) => ({ wallet, amount }))
    .filter((h) => h.amount >= CFG.minHold)
    .sort((a, b) => b.amount - a.amount);
}

/* ------------------------------------------------------------ 3. the swap */

async function swapSolToTarget(lamports, target, payer) {
  const quoteUrl =
    `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112` +
    `&outputMint=${target}&amount=${lamports}&slippageBps=${CFG.slippageBps}`;
  const quote = await (await fetch(quoteUrl)).json();
  if (!quote?.outAmount) throw new Error("no route to the current target");

  if (!EXECUTE) return { simulated: true, outAmount: quote.outAmount };

  const swapRes = await (await fetch("https://quote-api.jup.ag/v6/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: payer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  })).json();

  const tx = VersionedTransaction.deserialize(Buffer.from(swapRes.swapTransaction, "base64"));
  tx.sign([payer]);
  const sig = await conn.sendTransaction(tx, { maxRetries: 3 });
  await conn.confirmTransaction(sig, "confirmed");
  return { signature: sig, outAmount: quote.outAmount };
}

/* --------------------------------------------------------- 4. the payout */

async function payOut(targetMint, totalRaw, eligible, payer, decimals) {
  const totalHeld = eligible.reduce((a, h) => a + h.amount, 0);
  const plan = eligible.map((h) => ({
    ...h,
    share: h.amount / totalHeld,
    raw: BigInt(Math.floor((h.amount / totalHeld) * Number(totalRaw))),
  })).filter((p) => p.raw > 0n);

  if (!EXECUTE) return { simulated: true, plan, signatures: [] };

  const mint = new PublicKey(targetMint);
  const from = await getAssociatedTokenAddress(mint, payer.publicKey);
  const signatures = [];

  for (let i = 0; i < plan.length; i += CFG.maxTransfersPerTx) {
    const batch = plan.slice(i, i + CFG.maxTransfersPerTx);
    const tx = new Transaction();
    for (const p of batch) {
      const owner = new PublicKey(p.wallet);
      const ata = await getAssociatedTokenAddress(mint, owner);
      try {
        await getAccount(conn, ata);
      } catch {
        tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint));
      }
      tx.add(createTransferCheckedInstruction(from, mint, ata, payer.publicKey, p.raw, decimals));
    }
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(payer);
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    await conn.confirmTransaction(sig, "confirmed");
    signatures.push(sig);
    log(`  batch ${i / CFG.maxTransfersPerTx + 1}: ${batch.length} transfers · ${sig}`);
  }
  return { plan, signatures };
}

/* ------------------------------------------------------------------ main */

async function main() {
  log(EXECUTE ? "▶ EXECUTING" : "▷ DRY RUN — nothing will be signed or sent");

  const target = await currentTarget();
  if (!target) die("the crosshair has never been painted — nothing to distribute in.");
  log(`\ncurrent target : ${target.target}`);
  log(`painted by     : ${target.owner}`);
  log(`painted at     : ${new Date(target.at).toISOString()}`);

  const payer = CFG.keypairPath
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(CFG.keypairPath, "utf8"))))
    : Keypair.generate(); // dry run only — never used to sign
  log(`operator       : ${payer.publicKey.toBase58()}${CFG.keypairPath ? "" : " (ephemeral, dry run)"}`);

  const balSol = (await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL;
  const spendable = AMOUNT_OVERRIDE ?? Math.max(0, balSol - CFG.solReserve);
  const holderSol = spendable * (CFG.holderSharePct / 100);
  log(`\nwallet balance : ${usd(balSol)} SOL`);
  log(`distributable  : ${usd(spendable)} SOL (reserve ${CFG.solReserve})`);
  log(`holder share   : ${usd(holderSol)} SOL (${CFG.holderSharePct}%)`);
  if (holderSol <= 0) die("nothing to distribute.");

  const eligible = await holders();
  log(`\neligible wallets: ${eligible.length} (>= ${CFG.minHold.toLocaleString()} $TARGET)`);
  if (!eligible.length) die("no eligible holders.");

  const swap = await swapSolToTarget(Math.floor(holderSol * LAMPORTS_PER_SOL), target.target, payer);
  log(`swap           : ${swap.simulated ? "simulated" : swap.signature}`);
  log(`acquired       : ${swap.outAmount} raw units of the target`);

  // Target decimals, needed for transferChecked.
  const info = await conn.getParsedAccountInfo(new PublicKey(target.target));
  const decimals = info.value?.data?.parsed?.info?.decimals ?? 6;

  const result = await payOut(target.target, swap.outAmount, eligible, payer, decimals);
  log(`\ntop of the plan:`);
  result.plan.slice(0, 5).forEach((p) =>
    log(`  ${p.wallet.slice(0, 6)}… ${(p.share * 100).toFixed(3)}% → ${p.raw} raw`));

  const receipt = {
    at: new Date().toISOString(),
    executed: EXECUTE,
    target: target.target,
    paintedBy: target.owner,
    swapSignature: swap.signature ?? null,
    solDistributed: holderSol,
    recipients: result.plan.length,
    signatures: result.signatures,
  };
  const dir = path.join(process.cwd(), "receipts");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}${EXECUTE ? "" : "-dryrun"}.json`);
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
  log(`\nreceipt written: ${file}`);
  log(EXECUTE
    ? "✓ distribution complete — publish the receipt so holders can check it."
    : "▷ dry run complete — re-run with --execute when the plan looks right.");
}

main().catch((e) => die(e.message));

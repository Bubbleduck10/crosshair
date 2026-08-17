/* THE CROSSHAIR — render + the burn. */
(() => {
  const $ = (id) => document.getElementById(id);
  const num = (n) => (n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString());
  const short = (s) => (s ? s.slice(0, 4) + "…" + s.slice(-4) : "—");
  const ago = (ms) => {
    if (!ms) return "—";
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };
  const dur = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + "h " : "") + m + "m " + sec + "s";
  };

  /* ---------- static config into the page ---------- */
  const burnLabel = CONFIG.burnAmount.toLocaleString();
  ["d-amount", "h-amount", "s-cost"].forEach((id) => ($(id).textContent = burnLabel));
  $("dist-min").textContent = CONFIG.minHold.toLocaleString();
  $("p-split").textContent = `${CONFIG.feeSplit.holders} / ${CONFIG.feeSplit.operator}`;
  $("x").href = CONFIG.twitterUrl;
  if (CONFIG.operatorWallet) {
    const ops = $("ops-wallet");
    ops.textContent = CONFIG.operatorWallet;
    ops.href = "https://solscan.io/account/" + CONFIG.operatorWallet;
  }
  $("buy").href = CONFIG.mint ? "https://pump.fun/coin/" + CONFIG.mint : CONFIG.twitterUrl;
  if (!CONFIG.mint) $("buy").textContent = "FOLLOW THE LAUNCH ›";
  $("mint-line").textContent = CONFIG.mint ? "mint " + CONFIG.mint : "mint not yet announced";

  let state = null;
  let heldTimer = null;

  /* ---------- render ---------- */
  const renderTarget = (s) => {
    const cur = s?.current;
    if (!cur) {
      $("target-name").textContent = "— no target painted —";
      $("target-mint").textContent = "the crosshair is unassigned";
      $("held-for").textContent = "awaiting the first designation";
      return;
    }
    $("target-name").textContent = short(cur.target);
    $("target-mint").textContent = cur.target;
    clearInterval(heldTimer);
    const tick = () =>
      ($("held-for").textContent =
        "painted for " + dur(Date.now() - cur.blockTime) + " · by " + short(cur.owner));
    tick();
    heldTimer = setInterval(tick, 1000);
    $("dist-asset").textContent = short(cur.target);
  };

  const renderStats = (s) => {
    $("s-burned").textContent = num(s?.roundsExpended);
    $("s-switches").textContent = num(s?.history?.length);
    const supply = 1_000_000_000;
    $("s-pct").textContent = s?.roundsExpended
      ? ((s.roundsExpended / supply) * 100).toFixed(3) + "%"
      : "—";
  };

  const renderArchive = (s) => {
    const el = $("archive");
    if (!s?.history?.length) return;
    el.innerHTML = "";
    s.history.slice(0, 12).forEach((h, i) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <span class="sym">${short(h.target)}</span>
        ${i === 0 ? '<span class="cur">CURRENT</span>' : ""}
        <span class="addr">by ${short(h.owner)}</span>
        <span class="when">${ago(h.blockTime)}</span>`;
      el.appendChild(row);
    });
  };

  const renderBoard = (s) => {
    const el = $("board");
    if (!s?.leaderboard?.length) return;
    el.innerHTML = "";
    s.leaderboard.slice(0, 10).forEach((b, i) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <span class="rank">${i + 1}</span>
        <span class="burn">${num(b.burned)}</span>
        <span class="addr">${short(b.wallet)} · ${b.switches} designation${b.switches === 1 ? "" : "s"}</span>
        <span class="when">${b.lastAt ? ago(b.lastAt) : ""}</span>`;
      el.appendChild(row);
    });
  };

  const renderCooldown = (s) => {
    if (!CONFIG.mint) {
      $("cooldown").textContent = "the crosshair has not been mounted yet";
      return;
    }
    const until = s?.cooldownUntil || 0;
    const left = until - Date.now();
    $("cooldown").textContent =
      left > 0
        ? `cooldown active — ${dur(left)} until the crosshair can move again`
        : "no cooldown — the crosshair can be moved now";
  };

  /* ---------- load ---------- */
  const load = async () => {
    if (!CONFIG.mint) {
      $("rpc-state").textContent = "PRE-LAUNCH — NO MINT";
      $("cooldown").textContent = "the crosshair has not been mounted yet";
      return;
    }
    try {
      $("rpc-state").textContent = "READING CHAIN…";
      state = await Chain.load();
      renderTarget(state);
      renderStats(state);
      renderArchive(state);
      renderBoard(state);
      renderCooldown(state);
      $("rpc-state").textContent = "LIVE — DERIVED FROM CHAIN";
      $("rpc-state").className = "state live";
    } catch (e) {
      $("rpc-state").textContent = "RPC UNAVAILABLE — RETRYING";
      $("rpc-state").className = "state err";
    }
  };

  /* ---------- the burn ---------- */
  const wallet = () => window.solana?.isPhantom ? window.solana : window.solana || null;

  const setFire = (msg) => ($("fire-state").textContent = msg);

  $("fire").addEventListener("click", async () => {
    const candidate = $("candidate").value.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(candidate)) {
      setFire("that does not look like a mint address");
      return;
    }
    if (!CONFIG.mint) { setFire("no mint configured yet"); return; }
    const w = wallet();
    if (!w) { setFire("no Solana wallet found — install Phantom"); return; }

    try {
      setFire("connecting…");
      await w.connect();
      setFire("building the burn…");

      // web3.js + spl-token are loaded on demand so the page stays fast for readers.
      const [{ Connection, PublicKey, Transaction, TransactionInstruction },
             { getAssociatedTokenAddress, createBurnCheckedInstruction }] = await Promise.all([
        import("https://esm.sh/@solana/web3.js@1.95.3"),
        import("https://esm.sh/@solana/spl-token@0.4.8"),
      ]);

      const conn = new Connection(CONFIG.rpcUrl, "confirmed");
      const owner = new PublicKey(w.publicKey.toString());
      const mint = new PublicKey(CONFIG.mint);
      const ata = await getAssociatedTokenAddress(mint, owner);
      const amount = BigInt(CONFIG.burnAmount) * BigInt(10 ** CONFIG.decimals);

      const tx = new Transaction()
        .add(createBurnCheckedInstruction(ata, mint, owner, amount, CONFIG.decimals))
        .add(new TransactionInstruction({
          keys: [{ pubkey: owner, isSigner: true, isWritable: false }],
          programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
          data: new TextEncoder().encode(candidate),
        }));

      tx.feePayer = owner;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

      setFire("approve in your wallet…");
      const { signature } = await w.signAndSendTransaction(tx);
      setFire("confirming " + signature.slice(0, 8) + "…");
      await conn.confirmTransaction(signature, "confirmed");
      setFire("target painted — reloading the board");
      setTimeout(load, 1500);
    } catch (e) {
      setFire(e?.message ? "failed: " + e.message.slice(0, 80) : "transaction failed");
    }
  });

  if (window.solana) {
    window.solana.on?.("connect", () => setFire("wallet connected"));
    setFire("wallet detected — not connected");
  }

  load();
  setInterval(load, CONFIG.pollMs);
  setInterval(() => renderCooldown(state), 1000);
})();

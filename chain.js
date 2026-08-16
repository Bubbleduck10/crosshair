/* THE CROSSHAIR — chain reader.
   The current target is not stored anywhere. It is derived from on-chain
   history: the memo of the most recent qualifying burn. This file is the
   whole trust model, so it is written to be readable. */

const Chain = (() => {
  const MEMO_PROGRAMS = new Set([
    "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
  ]);

  const rpc = async (method, params) => {
    const res = await fetch(CONFIG.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "rpc error");
    return json.result;
  };

  /** Signatures that touched the mint, newest first. */
  const signatures = (mint, limit = 200) =>
    rpc("getSignaturesForAddress", [mint, { limit }]);

  const transaction = (sig) =>
    rpc("getTransaction", [
      sig,
      { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" },
    ]);

  /** Pull the burn (amount + who) and the memo (the named target) out of one tx. */
  const readBurn = (tx) => {
    if (!tx || tx.meta?.err) return null;
    const msg = tx.transaction.message;
    const instructions = [
      ...(msg.instructions || []),
      ...(tx.meta?.innerInstructions || []).flatMap((i) => i.instructions || []),
    ];

    let burned = 0;
    let owner = null;
    let memo = null;

    for (const ix of instructions) {
      const type = ix.parsed?.type;
      if (ix.program === "spl-token" && (type === "burn" || type === "burnChecked")) {
        const info = ix.parsed.info || {};
        if (info.mint && info.mint !== CONFIG.mint) continue;
        const raw = info.tokenAmount?.uiAmount ?? null;
        burned += raw != null ? raw : Number(info.amount || 0) / 10 ** CONFIG.decimals;
        owner = info.authority || info.owner || owner;
      }
      if (MEMO_PROGRAMS.has(ix.programId) && typeof ix.parsed === "string") {
        memo = ix.parsed.trim();
      }
    }

    if (!burned || !memo) return null;
    // A memo only counts if it is a plausible mint address.
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(memo)) return null;

    return {
      burned,
      owner,
      target: memo,
      signature: tx.transaction.signatures[0],
      blockTime: (tx.blockTime || 0) * 1000,
    };
  };

  /** Fold raw burns into game state. Cooldown is enforced here, not by a server. */
  const foldState = (burns) => {
    const accepted = [];
    let last = 0;
    // oldest first so the cooldown reads forwards in time
    for (const b of [...burns].sort((a, z) => a.blockTime - z.blockTime)) {
      if (b.burned + 1e-9 < CONFIG.burnAmount) continue;
      if (last && b.blockTime - last < CONFIG.cooldownMs) continue;
      accepted.push(b);
      last = b.blockTime;
    }

    const burners = {};
    let roundsExpended = 0;
    for (const b of burns) {
      roundsExpended += b.burned;
      if (!b.owner) continue;
      burners[b.owner] = burners[b.owner] || { wallet: b.owner, burned: 0, switches: 0, lastAt: 0 };
      burners[b.owner].burned += b.burned;
    }
    for (const a of accepted) {
      if (!a.owner || !burners[a.owner]) continue;
      burners[a.owner].switches += 1;
      burners[a.owner].lastAt = Math.max(burners[a.owner].lastAt, a.blockTime);
    }

    const history = [...accepted].reverse(); // newest first
    return {
      current: history[0] || null,
      history,
      roundsExpended,
      leaderboard: Object.values(burners).sort((a, b) => b.burned - a.burned),
      cooldownUntil: history[0] ? history[0].blockTime + CONFIG.cooldownMs : 0,
    };
  };

  /** Read everything. Returns null when there is no mint configured yet. */
  const load = async () => {
    if (!CONFIG.mint) return null;
    const sigs = await signatures(CONFIG.mint);
    const burns = [];
    // Sequential on purpose: public RPCs punish bursts.
    for (const s of sigs) {
      if (s.err) continue;
      try {
        const b = readBurn(await transaction(s.signature));
        if (b) burns.push(b);
      } catch { /* one unreadable tx should not blank the board */ }
    }
    return foldState(burns);
  };

  return { load, foldState, readBurn, rpc };
})();

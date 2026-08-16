// ============================================================
// THE CROSSHAIR — edit this block only.
// ============================================================
const CONFIG = {
  name: "The Crosshair",
  ticker: "TARGET",
  chain: "solana",

  // Our mint. Paste at launch; empty = pre-launch mode.
  mint: "",

  // Tokens burned in a single transaction to move the crosshair.
  burnAmount: 300000,
  decimals: 6,

  // Minimum time between accepted switches.
  cooldownMs: 120000,

  // Tokens a wallet must hold to receive distributions.
  minHold: 200000,

  // Fee split, published on the site because it should be.
  feeSplit: { operator: 20, holders: 80 },

  // Solana RPC. REQUIRED before launch — verified 2026-08-16 that the public
  // endpoint (api.mainnet-beta.solana.com) returns "Access forbidden" to browser
  // requests, so the read path cannot work without a keyed provider.
  // Use Helius/QuickNode/Triton and restrict the key to this domain, since a
  // browser key is public by definition.
  rpcUrl: "https://api.mainnet-beta.solana.com",

  twitterUrl: "https://x.com/yourhandle",
  loreUrl: "https://x.com/yourhandle",
  pollMs: 30000,
};

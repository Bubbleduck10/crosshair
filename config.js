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

  // The wallet that receives fees and sends distributions. Published so anyone
  // can watch what goes in and what comes out. MUST also be listed in the bot's
  // EXCLUDE_WALLETS, or it pays itself.
  operatorWallet: "HWPkgVaZm7YJMqGTxri4AmQFjEmiN5sr3tWfC9mcxkKF",

  // Solana RPC. REQUIRED before launch — verified 2026-08-16 that the public
  // endpoint (api.mainnet-beta.solana.com) returns "Access forbidden" to browser
  // requests, so the read path cannot work without a keyed provider.
  // Use Helius/QuickNode/Triton and restrict the key to this domain, since a
  // browser key is public by definition.
  rpcUrl: "https://api.mainnet-beta.solana.com",

  twitterUrl: "https://x.com/crosshairsol",
  loreUrl: "https://x.com/crosshairsol/status/2089230599978647699",
  pollMs: 30000,
};

// Some people sign in with more than one Google account but expect to see and
// edit ONE shared review dataset. Map each secondary account id to the canonical
// account that actually owns the data. Because every server query and write is
// keyed by currentUser().id (all through the service-role admin client), aliasing
// here makes both logins operate on the same rows — no per-table changes needed.
//
// Optional ACCOUNT_ALIASES env var overrides / extends the built-in map:
//   "secondaryUserId=canonicalUserId,secondaryUserId2=canonicalUserId"
const BUILT_IN_ALIASES: Record<string, string> = {
  // xinjiangzuiqiang@gmail.com -> langli0728@gmail.com (same person, one dataset)
  "dcdbf378-db5d-4e97-9a66-11007565e12e": "eab1e2f7-68a5-4eca-91ae-02d967bedf1b",
};

function parseEnvAliases(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const [from, to] = pair.split("=").map((value) => value.trim());
    if (from && to) map[from] = to;
  }
  return map;
}

const ALIASES = { ...BUILT_IN_ALIASES, ...parseEnvAliases(process.env.ACCOUNT_ALIASES) };

/** Resolve a possibly-secondary account id to the canonical data-owning id. */
export function resolveAccountId(userId: string): string {
  return ALIASES[userId] ?? userId;
}

/** Normalize Owner / name for 1:1 matching (trim, collapse spaces, lowercase). */
export function normalizeOwnerName(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Ledger "Owner" string to match for this account.
 * `financeOwnerLabel` overrides `name` when set (admin-configured 1:1 with spreadsheet Owner).
 */
export function ledgerOwnerLabelFromUserDoc(user) {
  if (!user) return "";
  const override = typeof user.financeOwnerLabel === "string" ? user.financeOwnerLabel.trim() : "";
  if (override) return override;
  return typeof user.name === "string" ? user.name.trim() : "";
}

export function transactionOwnerMatchesUser(ownerField, userDoc) {
  const a = normalizeOwnerName(ownerField);
  const b = normalizeOwnerName(ledgerOwnerLabelFromUserDoc(userDoc));
  return a.length > 0 && b.length > 0 && a === b;
}

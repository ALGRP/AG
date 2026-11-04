/** Single source for application party IDs and the generated DB supplier-ID validator. */
export const PARTY_ID_PATTERN = "^[a-z0-9_-]{1,64}$";
const PARTY_ID = new RegExp(PARTY_ID_PATTERN);

export function isPartyId(value: string): boolean {
  // JS $ also matches before a final newline; require the entire ID, as PostgreSQL does.
  return PARTY_ID.exec(value)?.[0] === value;
}

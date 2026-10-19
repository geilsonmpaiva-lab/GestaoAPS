export const OFFLINE_AUTHORIZATION_KEY = "__authorization_v1";
export const RESTRICTED_OFFLINE_ORGANIZATION = "362db1a9-bfdd-4334-9436-46b1c0117eab";
export type OfflineAuthorization = { version: 1; userId: string; organizationId: string; digest: string };

export function isOfflineAuthorization(value: unknown): value is OfflineAuthorization {
  if (!value || typeof value !== "object") return false;
  const token = value as Partial<OfflineAuthorization>;
  return token.version === 1 && typeof token.userId === "string" && typeof token.organizationId === "string"
    && typeof token.digest === "string" && /^[a-f0-9]{64}$/.test(token.digest);
}

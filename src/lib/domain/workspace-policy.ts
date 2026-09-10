export type ScopeIdentity = { organizationId: string; unitId: string | null };
export type MembershipPermission = { organization_id: string; unit_id: string | null; domains: string[]; operations: string[] };

export function selectAuthorizedScope<T extends ScopeIdentity>(scopes: T[], cookieValue?: string): T | undefined {
  let preference: ScopeIdentity | undefined;
  try { preference = JSON.parse(cookieValue ?? "{}"); } catch { /* Preferences never grant authorization. */ }
  return scopes.find((scope) => scope.organizationId === preference?.organizationId && scope.unitId === preference?.unitId) ?? scopes[0];
}

export function scopePermissions(memberships: MembershipPermission[], scope: ScopeIdentity) {
  const permissions = new Map<string, Set<string>>();
  for (const member of memberships.filter((item) => item.organization_id === scope.organizationId && (item.unit_id === null || item.unit_id === scope.unitId))) {
    for (const domain of member.domains) {
      const operations = permissions.get(domain) ?? new Set<string>();
      member.operations.forEach((operation) => operations.add(operation));
      permissions.set(domain, operations);
    }
  }
  return [...permissions].map(([domain, operations]) => ({ domain, operations: [...operations] }));
}

export function modulePagination(value?: string) {
  const pageSize = 25;
  const page = Math.max(1, Math.min(100000, Number.parseInt(value ?? "1", 10) || 1));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}

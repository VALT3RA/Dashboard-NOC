const CONTRACTED_HOSTS: Record<string, number> = {
  // Ajuste os nomes exatamente como aparecem na lista de host groups.
  cap: 293,
};

export function sumContractedHostsByName(groupNames: string[]): number | null {
  if (!groupNames.length) return null;
  let total = 0;
  let matched = 0;
  const normalizedEntries = Object.entries(CONTRACTED_HOSTS).map(
    ([name, value]) => [name.toLowerCase(), value] as const
  );

  for (const name of groupNames) {
    const normalized = name.toLowerCase();
    const entry = normalizedEntries.find(([key]) => key === normalized);
    if (entry) {
      matched += 1;
      total += entry[1];
    }
  }

  return matched ? total : null;
}

export function listConfiguredContracts() {
  return { ...CONTRACTED_HOSTS };
}

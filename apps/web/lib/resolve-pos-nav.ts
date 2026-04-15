/**
 * Central POS entry href from resolved behavior hints (no industry string checks).
 */
export const resolvePrimaryPosHref = (params: {
  readonly menuDefaultHref: string
  readonly posShellRoute?: string | null
  readonly defaultPosMode?: string | null
}): string => {
  const shell = params.posShellRoute?.trim()
  if (shell) return shell
  if (params.defaultPosMode === "high_volume") return "/pos/grocery"
  return params.menuDefaultHref
}

export const applyPosBehaviorToNav = <T extends { id: string; label: string; href: string }>(
  items: readonly T[],
  hints: { posShellRoute?: string | null; defaultPosMode?: string | null } | null | undefined,
  menuPosHref = "/pos",
): T[] => {
  const target = resolvePrimaryPosHref({
    menuDefaultHref: menuPosHref,
    posShellRoute: hints?.posShellRoute,
    defaultPosMode: hints?.defaultPosMode,
  })
  return items.map((item) => (item.id === "pos" ? { ...item, href: target } : item))
}

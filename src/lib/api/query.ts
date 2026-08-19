export function withArchived(path: string, options?: { includeArchived?: boolean }) {
  return options?.includeArchived ? `${path}?includeArchived=true` : path
}

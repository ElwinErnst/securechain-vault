export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/[^a-z0-9]+/g, '-') // no alfanum -> "-"
    .replace(/^-+|-+$/g, '') // trim "-"
    .replace(/-{2,}/g, '-'); // colapsa
}

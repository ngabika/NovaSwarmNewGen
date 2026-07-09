/**
 * A self-modifying mechanizmus SOHA nem férhet hozzá ezekhez (8.5. pont):
 *  (a) a saját git-rollback mechanizmusának kódjához,
 *  (b) bármilyen titkos kulcsot tartalmazó fájlhoz (.env, .config.json),
 *  (c) a systemd szolgáltatás-fájlhoz,
 *  (d) a .gitignore fájlhoz.
 *
 * Ez egy explicit, KÓDBAN definiált lista — nem egy futásidőben
 * módosítható beállítás —, hogy az önmódosító mechanizmus soha ne tudja
 * saját magát "kikapcsolni" egy módosítással.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  /^server\/selfmod\//, // (a) — a self-mod/rollback motor saját kódja
  /(^|\/)\.env(\..*)?$/, // (b) — titkos kulcsok
  /(^|\/)\.config\.json$/, // (b)
  /(^|\/)[\w.-]+\.service$/, // (c) — systemd unit fájl, pl. novaswarm.service
  /(^|\/)\.gitignore$/, // (d)
];

export class ForbiddenZoneError extends Error {
  constructor(public readonly path: string) {
    super(
      `Tiltott módosítási zóna: "${path}" nem módosítható az önmódosító mechanizmus által ` +
        `(8.5. pont) — semmilyen fájl nem került írásra ebből a kérésből.`
    );
    this.name = "ForbiddenZoneError";
  }
}

export function isForbiddenPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/^\.?\/+/, "");
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function assertAllowed(relativePath: string): void {
  if (isForbiddenPath(relativePath)) {
    throw new ForbiddenZoneError(relativePath);
  }
}

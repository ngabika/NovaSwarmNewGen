/**
 * Feldolgozza a terminálba beírt, nyers (billentyűnkénti) adatfolyamot, és
 * csak a TÉNYLEGESEN lezárt (Enterrel befejezett) parancssorokat adja
 * vissza — sose minden egyes billentyűleütést (9.5. pont).
 */
export class CommandLineBuffer {
  private buffer = "";

  push(chunk: string): string[] {
    const completedLines: string[] = [];

    for (const ch of chunk) {
      const code = ch.charCodeAt(0);

      if (ch === "\r" || ch === "\n") {
        if (this.buffer.length > 0) {
          completedLines.push(this.buffer);
          this.buffer = "";
        }
        continue;
      }

      if (ch === "\u007f" || ch === "\b") {
        // Backspace/Delete: az utolsó karaktert töröljük a pufferből.
        this.buffer = this.buffer.slice(0, -1);
        continue;
      }

      if (code < 0x20) {
        // Egyéb vezérlő-karakter (pl. Ctrl+C) — nem része a parancs-szövegnek.
        continue;
      }

      this.buffer += ch;
    }

    return completedLines;
  }

  /** Az aktuálisan még nem lezárt, félben lévő sor (diagnosztikához). */
  peekPending(): string {
    return this.buffer;
  }
}

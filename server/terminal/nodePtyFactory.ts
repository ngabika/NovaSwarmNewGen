import type { IPtyProcess, PtyFactory, PtySpawnOptions } from "./ptyTypes.js";

/**
 * A produkciós PtyFactory. A `node-pty` natív binárisát SZÁNDÉKOSAN csak
 * itt, dinamikus importtal töltjük be — kizárólag akkor, amikor tényleg
 * terminál-sessiont kell indítani. Így a szerver indulása, a típusellenőrzés
 * és az egységtesztek sosem függenek a natív build meglététől; csak a
 * tényleges terminál-megnyitás pillanatában van rá szükség (ami a célgépen,
 * a telepítő futása után, mindig rendelkezésre áll).
 */
export class NodePtyFactory implements PtyFactory {
  async spawn(shellPath: string, args: string[], options: PtySpawnOptions): Promise<IPtyProcess> {
    const nodePty = await import("node-pty");
    const proc = nodePty.spawn(shellPath, args, {
      cwd: options.cwd,
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      env: options.env ?? (process.env as Record<string, string>),
    });

    return {
      pid: proc.pid,
      write: (data: string) => proc.write(data),
      resize: (cols: number, rows: number) => proc.resize(cols, rows),
      kill: (signal?: string) => proc.kill(signal),
      onData: (listener) => proc.onData(listener),
      onExit: (listener) => proc.onExit((e) => listener({ exitCode: e.exitCode, signal: e.signal })),
    };
  }
}

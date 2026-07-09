export interface PtySpawnOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

/** A node-pty IPty felületének az a szelete, amire itt szükségünk van. */
export interface IPtyProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
}

export interface PtyFactory {
  spawn(shellPath: string, args: string[], options: PtySpawnOptions): Promise<IPtyProcess>;
}

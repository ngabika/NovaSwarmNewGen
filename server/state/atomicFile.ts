import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Atomikus fájlírás: ideiglenes fájlba ír, majd egy atomikus `rename`
 * hívással helyezi a végleges helyére. Soha nem írja felül direktben a
 * célfájlt, így egy áramszünet vagy folyamat-összeomlás közben a korábbi
 * állapot mindig sértetlen marad (lásd specifikáció 17.3. pont).
 */
export async function atomicWriteFile(targetPath: string, contents: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });

  const tmpName = `.${path.basename(targetPath)}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const tmpPath = path.join(dir, tmpName);

  const fileHandle = await fs.open(tmpPath, "w");
  try {
    await fileHandle.writeFile(contents, "utf8");
    await fileHandle.sync(); // fsync, hogy a tartalom biztosan lemezre kerüljön rename előtt
  } finally {
    await fileHandle.close();
  }

  await fs.rename(tmpPath, targetPath); // POSIX-on atomikus ugyanazon a fájlrendszeren belül
}

export async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  await atomicWriteFile(targetPath, JSON.stringify(value, null, 2));
}

export async function readJsonIfExists<T>(targetPath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

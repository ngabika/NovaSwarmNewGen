import { describe, expect, it } from "vitest";
import { CommandLineBuffer } from "../commandLineBuffer.js";

describe("CommandLineBuffer", () => {
  it("csak Enterrel lezárt sort ad vissza, billentyűnkénti bevitelt nem", () => {
    const buf = new CommandLineBuffer();
    expect(buf.push("l")).toEqual([]);
    expect(buf.push("s")).toEqual([]);
    expect(buf.push(" ")).toEqual([]);
    expect(buf.push("-")).toEqual([]);
    expect(buf.push("l")).toEqual([]);
    expect(buf.push("\r")).toEqual(["ls -l"]);
  });

  it("egy chunkban érkező teljes sort egyben is felismeri", () => {
    const buf = new CommandLineBuffer();
    expect(buf.push("npm test\n")).toEqual(["npm test"]);
  });

  it("több, egy chunkban érkező sort sorrendben ad visszaad", () => {
    const buf = new CommandLineBuffer();
    expect(buf.push("ls\npwd\n")).toEqual(["ls", "pwd"]);
  });

  it("a backspace törli az utolsó karaktert a még nyitott sorból", () => {
    const buf = new CommandLineBuffer();
    buf.push("lsx");
    buf.push("\u007f"); // backspace
    expect(buf.push("\n")).toEqual(["ls"]);
  });

  it("vezérlő-karaktereket (pl. Ctrl+C) NEM von be a parancs-szövegbe", () => {
    const buf = new CommandLineBuffer();
    buf.push("ls\u0003"); // Ctrl+C
    expect(buf.push("\n")).toEqual(["ls"]);
  });

  it("üres sorra (csak Enter) nem ad vissza semmit", () => {
    const buf = new CommandLineBuffer();
    expect(buf.push("\n")).toEqual([]);
  });
});

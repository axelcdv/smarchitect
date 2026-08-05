#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { stdin, stderr, stdout } from "node:process";
import { runCli } from "./cli.js";

async function readStandardInput(): Promise<string> {
  stdin.setEncoding("utf8");
  let source = "";

  for await (const chunk of stdin) {
    source += chunk;
  }

  return source;
}

const exitCode = await runCli(process.argv.slice(2), {
  readFile: (path) => readFile(path, "utf8"),
  readStdin: readStandardInput,
  writeFile: (path, value) => writeFile(path, value, "utf8"),
  stdout: (value) => stdout.write(value),
  stderr: (value) => stderr.write(value)
});

process.exitCode = exitCode;

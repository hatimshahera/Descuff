#!/usr/bin/env node
import { runCli } from "./cli.js";

const result = await runCli(process.argv);

if (result.stdout.length > 0) {
  process.stdout.write(result.stdout);
}

if (result.stderr.length > 0) {
  process.stderr.write(result.stderr);
}

process.exitCode = result.exitCode;

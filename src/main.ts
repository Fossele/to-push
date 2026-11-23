#!/usr/bin/env -S node --experimental-strip-types

import {  parse, resolve } from "node:path";
import { parseArgs } from "node:util";


import findRepositories from "./utils/findRepo.js"
import { Colors } from "./utils/interfaces.js";
import { hasRemote } from "./utils/common.js";
import  printRepository  from "./utils/printRepoStatus.js";
import readRepositoryStatus from "./utils/readRepoStatus.js";



const USAGE = `to-push — list local git branches that are not in sync with their upstream

Usage:
  to-push [dir] [options]

A branch is unsynced when it has commits the upstream does not (ahead),
the upstream has commits it does not (behind), both (diverged), it has
no upstream, or its upstream branch was deleted. The command recursively
scans the filesystem for local repositories and does not contact GitHub
or any other remote unless --fetch is used.

Options:
  -f, --fetch      Run git fetch --prune in every discovered repository
  -s, --synced     Also list branches that match their upstream
  -d, --scan       Compatibility option; scanning is enabled by default
  -r, --no-remote  Only include repositories with no configured remote
  -h, --help       Show this help

Exit status:
  0   every local branch is in sync with its upstream
  1   at least one local branch is unsynced
  2   invalid usage or no repository could be inspected`;



function main(): number {
    /**
     * main function of the program
     */
    let values;
    let positionals: string[];
    try {
        ({ values, positionals } = parseArgs({
            options: {
                fetch: { type: "boolean", short: "f", default: false },
                synced: { type: "boolean", short: "s", default: false },
                scan: { type: "boolean", short: "d", default: false },
                "no-remote": { type: "boolean", short: "r", default: false },
                help: { type: "boolean", short: "h", default: false },
            },
            allowPositionals: true,
            strict: true,
        }));
    } catch (error) {
        console.error(`to-push: ${error instanceof Error ? error.message : String(error)}`);
        console.error("Try 'to-push --help'.");
        return 2;
    }

    if (values.help) {
        console.log(USAGE);
        return 0;
    }
    if (positionals.length > 1) {
        console.error("to-push accepts at most one directory");
        return 2;
    }

    const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
    const c: Colors = {
        bold: useColor ? "\x1b[1m" : "",
        dim: useColor ? "\x1b[2m" : "",
        red: useColor ? "\x1b[31m" : "",
        yellow: useColor ? "\x1b[33m" : "",
        green: useColor ? "\x1b[32m" : "",
        cyan: useColor ? "\x1b[36m" : "",
        reset: useColor ? "\x1b[0m" : "",
    };

    const scanRoot = resolve(positionals[0] ?? parse(process.cwd()).root);
    const repositories = findRepositories(scanRoot).filter(
        (root) => !values["no-remote"] || !hasRemote(root),
    );
    if (repositories.length === 0) {
        console.error(`to-push: no git repositories found under ${scanRoot}`);
        return 2;
    }

    let unsynced = 0;
    let inspected = 0;
    let unverified = 0;
    for (const root of repositories) {
        const status = readRepositoryStatus(root, values.fetch);
        if (!status) {
            console.error(`to-push: unable to inspect ${root}`);
            continue;
        }
      //This line seems useless  if (inspected > 0) console.log();
        if (status.fetchError) unverified++;
        unsynced += printRepository(status, values.synced, c);
        inspected++;
    }
    return inspected === 0 || unverified > 0 ? 2 : unsynced === 0 ? 0 : 1;
}

process.exit(main());

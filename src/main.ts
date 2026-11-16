#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

interface BranchStatus {
    marker: string;
    name: string;
    detail: string;
    upstream: string;
}

type BucketKey = "push" | "diverged" | "behind" | "missing" | "synced";

const USAGE = `to-push — list local git branches that are not in sync with their upstream

Usage:
  to-push [options]

A branch is unsynced when it has commits the upstream does not (ahead),
the upstream has commits it does not (behind), both (diverged), it has
no upstream, or its upstream branch was deleted.

Options:
  -f, --fetch      Run git fetch --prune before comparing
  -s, --synced     Also list branches that match their upstream
  -h, --help       Show this help

Exit status:
  0   every local branch is in sync with an upstream
  1   at least one local branch is unsynced
  2   not a git repository, or invalid usage`;

function runGit(...args: string[]): { status: number; stdout: string; stderr: string } {
    const res = spawnSync("git", args, { encoding: "utf8" });
    return {
        status: res.status ?? 2,
        stdout: res.stdout ?? "",
        stderr: res.stderr ?? "",
    };
}

function main(): number {
    let values: { fetch?: boolean; synced?: boolean; help?: boolean };

    try {
        ({ values } = parseArgs({
            options: {
                fetch: { type: "boolean", short: "f", default: false },
                synced: { type: "boolean", short: "s", default: false },
                help: { type: "boolean", short: "h", default: false },
            },
            strict: true,
        }));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`to-push: ${message}`);
        console.error("Try 'to-push --help'.");
        return 2;
    }

    if (values.help) {
        console.log(USAGE);
        return 0;
    }

    if (runGit("rev-parse", "--is-inside-work-tree").status !== 0) {
        console.error("to-push: not inside a git repository");
        return 2;
    }

    if (values.fetch) {
        if (runGit("fetch", "--prune", "--quiet").status !== 0) {
            return 2;
        }
    }

    const root = runGit("rev-parse", "--show-toplevel").stdout.trim();
    const headRes = runGit("symbolic-ref", "--quiet", "--short", "HEAD");
    const current = headRes.status === 0 ? headRes.stdout.trim() : "";

    const useColor = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
    const c = {
        bold: useColor ? "\x1b[1m" : "",
        dim: useColor ? "\x1b[2m" : "",
        red: useColor ? "\x1b[31m" : "",
        yellow: useColor ? "\x1b[33m" : "",
        green: useColor ? "\x1b[32m" : "",
        cyan: useColor ? "\x1b[36m" : "",
        reset: useColor ? "\x1b[0m" : "",
    };

    const refsRes = runGit(
        "for-each-ref",
        "--format=%(HEAD)%1f%(refname:short)%1f%(upstream:short)%1f%(upstream:track)",
        "refs/heads",
    );
    if (refsRes.status !== 0) {
        return 2;
    }

    const buckets: Record<BucketKey, BranchStatus[]> = {
        push: [],
        diverged: [],
        behind: [],
        missing: [],
        synced: [],
    };
    let nameWidth = 0;

    for (const record of refsRes.stdout.split(/\r?\n/)) {
        if (!record) continue;

        const [head = "", name = "", upstream = "", track = ""] = record.split("\x1f");
        if (name.length > nameWidth) {
            nameWidth = name.length;
        }

        let bucket: BucketKey = "synced";
        let detail = "in sync";
        let match: RegExpMatchArray | null;

        if (!upstream) {
            bucket = "missing";
            detail = "no upstream";
        } else if (track.includes("gone")) {
            bucket = "missing";
            detail = "upstream deleted";
        } else if ((match = track.match(/ahead\s+(\d+).*behind\s+(\d+)/))) {
            bucket = "diverged";
            detail = `ahead ${match[1]}, behind ${match[2]}`;
        } else if ((match = track.match(/ahead\s+(\d+)/))) {
            bucket = "push";
            detail = `ahead ${match[1]}`;
        } else if ((match = track.match(/behind\s+(\d+)/))) {
            bucket = "behind";
            detail = `behind ${match[1]}`;
        }

        const marker = head === "*" || name === current ? "*" : " ";
        buckets[bucket].push({ marker, name, detail, upstream });
    }

    const where = current || "detached HEAD";
    console.log(`${c.bold}${root}${c.reset} ${c.dim}(${where})${c.reset}`);

    const printSection = (title: string, color: string, items: BranchStatus[]) => {
        if (items.length === 0) return;

        console.log();
        console.log(`${color}${c.bold}${title}${c.reset} ${c.dim}(${items.length})${c.reset}`);

        for (const item of items) {
            const arrow =
                item.upstream && item.detail !== "no upstream" ? `→ ${item.upstream}` : "";
            let line = `  ${item.marker} ${item.name.padEnd(nameWidth)}  ${item.detail}`;
            if (arrow) {
                line += `  ${c.dim}${arrow}${c.reset}`;
            }
            console.log(line);
        }
    };

    printSection("To push", c.yellow, buckets.push);
    printSection("Diverged", c.red, buckets.diverged);
    printSection("No upstream", c.cyan, buckets.missing);
    printSection("Behind", c.dim, buckets.behind);

    if (values.synced) {
        printSection("In sync", c.green, buckets.synced);
    }

    const syncedCount = buckets.synced.length;
    const unsyncedCount =
        buckets.push.length +
        buckets.diverged.length +
        buckets.behind.length +
        buckets.missing.length;

    console.log();
    if (unsyncedCount === 0) {
        if (syncedCount === 0) {
            console.log("No local branches.");
        } else if (syncedCount === 1) {
            console.log(`${c.green}1 local branch is in sync with its upstream.${c.reset}`);
        } else {
            console.log(
                `${c.green}${syncedCount} local branches are in sync with their upstreams.${c.reset}`,
            );
        }
        return 0;
    }

    if (!values.synced && syncedCount > 0) {
        if (syncedCount === 1) {
            console.log(`${c.dim}1 branch in sync hidden. Pass --synced to show it.${c.reset}`);
        } else {
            console.log(
                `${c.dim}${syncedCount} branches in sync hidden. Pass --synced to show them.${c.reset}`,
            );
        }
    }

    return 1;
}

process.exit(main());
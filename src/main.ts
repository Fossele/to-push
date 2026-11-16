#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, parse, resolve } from "node:path";
import { parseArgs } from "node:util";

interface BranchStatus {
    marker: string;
    name: string;
    detail: string;
    upstream: string;
}

type BucketKey = "push" | "diverged" | "behind" | "missing" | "synced";

interface RepositoryStatus {
    root: string;
    current: string;
    branches: Record<BucketKey, BranchStatus[]>;
}

interface Colors {
    bold: string;
    dim: string;
    red: string;
    yellow: string;
    green: string;
    cyan: string;
    reset: string;
}

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

function runGit(args: string[], cwd?: string) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    return {
        status: result.status ?? 2,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}

function emptyBuckets(): Record<BucketKey, BranchStatus[]> {
    return { push: [], diverged: [], behind: [], missing: [], synced: [] };
}

function isGitRepository(directory: string): boolean {
    return runGit(["rev-parse", "--show-toplevel"], directory).status === 0;
}

function hasRemote(root: string): boolean {
    return runGit(["config", "--get-regexp", "^remote\\..*\\.url$"], root).status === 0;
}

function findRepositories(start: string): string[] {
    const repositories: string[] = [];
    const ignoredDirectories = new Set([
        "/dev",
        "/proc",
        "/run",
        "/sys",
        "/snap",
        "System Volume Information",
        "$Recycle.Bin",
    ]);

    function visit(directory: string): void {
        let entries;
        try {
            entries = readdirSync(directory, { withFileTypes: true });
        } catch {
            return;
        }

        if (entries.some((entry) => entry.name === ".git") && isGitRepository(directory)) {
            const root = runGit(["rev-parse", "--show-toplevel"], directory).stdout.trim();
            repositories.push(root || directory);
        }

        for (const entry of entries) {
            if (
                entry.isDirectory() &&
                entry.name !== ".git" &&
                !ignoredDirectories.has(entry.name) &&
                !(directory === parse(directory).root &&
                    ignoredDirectories.has(join(directory, entry.name)))
            ) {
                visit(join(directory, entry.name));
            }
        }
    }

    visit(start);
    return [...new Set(repositories)].sort();
}

function readRepositoryStatus(root: string, shouldFetch: boolean): RepositoryStatus | null {
    if (shouldFetch && runGit(["fetch", "--prune", "--quiet"], root).status !== 0) {
        console.error(`to-push: fetch failed for ${root}`);
    }

    const head = runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], root);
    const refs = runGit(
        [
            "for-each-ref",
            "--format=%(HEAD)%1f%(refname:short)%1f%(upstream:short)%1f%(upstream:track)",
            "refs/heads",
        ],
        root,
    );
    if (refs.status !== 0) return null;

    const current = head.status === 0 ? head.stdout.trim() : "";
    const branches = emptyBuckets();
    for (const record of refs.stdout.split(/\r?\n/)) {
        if (!record) continue;
        const [marker = "", name = "", upstream = "", track = ""] = record.split("\x1f");
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

        branches[bucket].push({
            marker: marker === "*" || name === current ? "*" : " ",
            name,
            detail,
            upstream,
        });
    }
    return { root, current, branches };
}

function printRepository(status: RepositoryStatus, showSynced: boolean, c: Colors): number {
    const all = Object.values(status.branches).flat();
    const width = Math.max(0, ...all.map((branch) => branch.name.length));
    console.log(`${c.bold}${status.root}${c.reset} ${c.dim}(${status.current || "detached HEAD"})${c.reset}`);

    const section = (title: string, color: string, items: BranchStatus[]) => {
        if (items.length === 0) return;
        console.log(`\n${color}${c.bold}${title}${c.reset} ${c.dim}(${items.length})${c.reset}`);
        for (const item of items) {
            const arrow = item.upstream && item.detail !== "no upstream" ? `  ${c.dim}→ ${item.upstream}${c.reset}` : "";
            console.log(`  ${item.marker} ${item.name.padEnd(width)}  ${item.detail}${arrow}`);
        }
    };

    section("To push", c.yellow, status.branches.push);
    section("Diverged", c.red, status.branches.diverged);
    section("No upstream", c.cyan, status.branches.missing);
    section("Behind", c.dim, status.branches.behind);
    if (showSynced) section("In sync", c.green, status.branches.synced);

    const unsynced =
        status.branches.push.length +
        status.branches.diverged.length +
        status.branches.behind.length +
        status.branches.missing.length;
    const synced = status.branches.synced.length;
    if (unsynced === 0) {
        console.log(
            synced === 0
                ? "\nNo local branches."
                : `\n${c.green}${synced} local branch${synced === 1 ? "" : "es"} ${
                      synced === 1 ? "is" : "are"
                  } in sync with its upstream${synced === 1 ? "" : "s"}.${c.reset}`,
        );
    } else if (!showSynced && synced > 0) {
        console.log(`\n${c.dim}${synced} branch${synced === 1 ? "" : "es"} in sync hidden. Pass --synced to show them.${c.reset}`);
    }
    return unsynced;
}

function main(): number {
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
    for (const root of repositories) {
        const status = readRepositoryStatus(root, values.fetch);
        if (!status) {
            console.error(`to-push: unable to inspect ${root}`);
            continue;
        }
        if (inspected > 0) console.log();
        unsynced += printRepository(status, values.synced, c);
        inspected++;
    }
    return inspected === 0 ? 2 : unsynced === 0 ? 0 : 1;
}

process.exit(main());

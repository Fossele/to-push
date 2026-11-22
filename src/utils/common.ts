import { spawnSync } from "node:child_process";

export function runGit(args: string[], cwd?: string) {
    /**  runs git command */
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    return {
        status: result.status ?? 2,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}

export function isGitRepository(directory: string): boolean {
    /*checks if the directory is a git repository */
    return runGit(["rev-parse", "--show-toplevel"], directory).status === 0;
}


export function hasRemote(root: string): boolean {
    /* checks if the directory has a remote branch*/
    return runGit(["config", "--get-regexp", "^remote\\..*\\.url$"], root).status === 0;
}


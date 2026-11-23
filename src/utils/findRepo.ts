import { readdirSync } from "node:fs";
import { join, parse } from "node:path";
import { isGitRepository, runGit } from "./common.js";

export default function findRepositories(start: string): string[] {
    /** finds all repository from the current directory and subs included */
    const repositories: string[] = [];
    const ignoredDirectories = new Set([
        "/var",
        "/boot",
        "/etc",
        "/tmp",
        "/media",
        "/opt",
        "/lost+found",
        "/root",    
        "/dev",
        "/proc",
        "/run",
        "/sys",
        "/snap",
        "System Volume Information",
        "$Recycle.Bin",
    ]);


    function visit(directory: string): void {
        /* visits recursively the directory */
        let entries;
        try {
            entries = readdirSync(directory, { withFileTypes: true });
        } catch(error) {
            console.log("an error happened while visiting the file", error);
            
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
                !(directory === parse(directory).root && ignoredDirectories.has(join(directory, entry.name)))
            ) {
                visit(join(directory, entry.name));
            }
        }
    }

    visit(start);
    return [...new Set(repositories)].sort();
}
import { runGit } from "./common.js";
import {RepositoryStatus} from "./interfaces.js";
import { BucketKey, BranchStatus } from "./interfaces.js";


function emptyBuckets(): Record<BucketKey, BranchStatus[]> {
    /** 
     *  returns an empty bucket
     * */
    return { push: [], diverged: [], behind: [], missing: [], synced: [] };
}

export default function readRepositoryStatus(root: string, shouldFetch: boolean): RepositoryStatus | null {
    /** 
     * reads the status of the repository and returns it
     */


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
        root );
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

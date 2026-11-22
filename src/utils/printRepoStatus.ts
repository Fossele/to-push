import { Colors, RepositoryStatus, BranchStatus } from "./interfaces.js";

export default function printRepository(status: RepositoryStatus, showSynced: boolean, c: Colors): number {
    /**
     * prints the status of the repository
     */
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

    const unsynced = status.branches.push.length +
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
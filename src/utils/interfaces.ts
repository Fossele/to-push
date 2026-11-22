export interface RepositoryStatus {
    root: string;
    current: string;
    branches: Record<BucketKey, BranchStatus[]>;
}

export interface BranchStatus {
    marker: string;
    name: string;
    detail: string;
    upstream: string;
}

export type BucketKey = "push" | "diverged" | "behind" | "missing" | "synced";



export interface Colors {
    bold: string;
    dim: string;
    red: string;
    yellow: string;
    green: string;
    cyan: string;
    reset: string;
}


function emptyBuckets(): Record<BucketKey, BranchStatus[]> {
    /** 
     *  returns an empty bucket
     * */
    return { push: [], diverged: [], behind: [], missing: [], synced: [] };
}
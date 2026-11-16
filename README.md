# to-push

`to-push` recursively scans local folders for Git repositories and reports
branches that are ahead of, behind, diverged from, or missing an upstream
branch.

Scanning is local by default. It does not contact GitHub or any other remote
unless `--fetch` is explicitly used.

## Requirements

- Node.js 18.3 or newer
- Git

## Install

```bash
npm install
npm run build
npm install --global .
```

## Usage

```bash
# Scan the filesystem root
to-push

# Scan a specific directory and all subdirectories
to-push ~/projects

# Include branches that are already in sync
to-push --synced

# Fetch remote updates before checking each repository
to-push --fetch

# Only show repositories without a configured remote URL
to-push --no-remote

# Combine options and limit the scan
to-push --no-remote --synced ~/projects
```

`--scan` is retained as a compatibility option; recursive scanning is already
enabled by default.

## Options

| Option | Description |
| --- | --- |
| `-f`, `--fetch` | Run `git fetch --prune` in each discovered repository. |
| `-s`, `--synced` | Show branches that match their upstream. |
| `-d`, `--scan` | Compatibility option; scanning is enabled by default. |
| `-r`, `--no-remote` | Only include repositories with no configured remote URL. |
| `-h`, `--help` | Show help. |

The scanner skips inaccessible directories and virtual system directories such
as `/proc`, `/sys`, `/dev`, and `/run`. Nested repositories are included.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | All inspected branches are in sync. |
| `1` | At least one branch needs attention. |
| `2` | Invalid usage or no repository could be inspected. |


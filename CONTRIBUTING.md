# Contributing to Taskmanager

Thanks for helping improve Taskmanager.

## Before You Start

- Search existing issues and pull requests before opening a duplicate.
- Use an issue to discuss large features or changes to persisted data first.
- Never include credentials, personal notes, database dumps, or uploaded files in a report or commit.

## Development Workflow

1. Fork and clone the repository.
2. Follow the development setup in [README.md](README.md#development).
3. Create a focused branch from `main`.
4. Update `server/db/schema.ts` and test it with `bun run db:push` when changing the database.
5. Run `bun run lint`, `bun run typecheck`, and `bun run build`.
6. Open a pull request explaining the behavior change and how it was tested.

Keep changes focused and preserve compatibility with existing persisted notes. Do not commit generated SQL, snapshots, or migration metadata.

## Releases

`scripts/bump-version.mjs` is the one place that changes the version. Pick the kind of change by what it means:

- `patch`: a bugfix, nothing new. x.y.Z+1.
- `feature`: a new feature was added. x.Y+1.0.
- `breaking`: compatibility breaks; a major bump in kind. X+1.0.0 once the major is 1 or more.

We are in beta. While the major is 0 the number is held at 0, so `breaking` bumps the minor (0.y+1.0) exactly like `feature`. The output then says `(breaking, held at 0.x: beta)`, and the kind is kept in the tag message, because feature and breaking give the same number in beta. The owner moves to 1.0.0 by hand in `package.json` when he calls it release-worthy; from then on `breaking` is a real major bump with no change to the script.

The publisher writes the kind in the commit message as `Version <old> -> <new> (<kind>[, held at 0.x: beta]).`. Tag mode reads that line, refuses it when its new version differs from `package.json`, and writes the tag message `Taskmanager <version> (<kind>)` followed by the commit subject. Without the line the tag message is `Taskmanager <version>` and the subject. It rewrites `package.json` and every literal copy of the old version it lists (the nix files and `SERVER_VERSION`), and it never touches a copy that holds another version. Add `--dry-run` to see the changes without writing.

```bash
node scripts/bump-version.mjs feature --dry-run
node scripts/bump-version.mjs feature
node scripts/bump-version.mjs tag --push   # annotated tag v<version> on a commit that is on origin/master
```

The tag mode fetches `origin master` first, refuses a tag that already exists and a commit that is not on `origin/master`, and pushes only that one tag, and only with `--push`. The tests are in `tests/bump-version.test.ts`.

The pipeline makes the release, not a person. Every pull request must raise the version above master's (the `version-bumped` check, so run the publish script above before you push). Once a commit is on master and its CI is green, the `tag` job runs the tag mode for it and creates the GitHub Release: a pre-release while the major is 0, its notes generated since the previous tag (the first release says so instead). Nothing is attached to it. A re-run on the same commit changes nothing; a version that was not raised fails the job.

## Bug Reports

Include the Taskmanager version, browser, deployment method, relevant sanitized logs, reproduction steps, expected behavior, and actual behavior. Do not post security vulnerabilities in public issues.

## License

By contributing, you agree that your contribution is licensed under the project's MIT License.

# jjvs Integration Test Workspace

This directory is the VSCode workspace used by the integration test runner
(`@vscode/test-electron`). It is intentionally an empty workspace — no `.jj/`
directory is committed here.

Integration tests that require an active jj repository initialise a fresh repo
at runtime using the `createTempJjRepo()` helper from `test/integration/helpers.ts`.
That helper runs `jj git init` in an OS temp directory (outside this workspace)
and cleans up after itself.

Tests that only validate the extension manifest, configuration schema, or
command registration do not need a jj repository and run against this empty
workspace directly.

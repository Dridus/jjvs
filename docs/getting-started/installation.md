# Installation

This guide walks you through installing jjvs and verifying that it is working correctly.

## Prerequisites

### VSCode or Cursor

jjvs requires **VSCode 1.105.0 or later**, or **Cursor 2.6.x or later** (which ships with
VSCode engine 1.105.1).

To check your VSCode version: **Help → About**.

### jj (Jujutsu)

jjvs requires **jj 0.25.0 or later**. Version 0.25.0 introduced the `json()` template
function that jjvs uses for structured output.

To check your installed version:

```
jj --version
```

If jj is not installed, follow the
[official installation instructions](https://martinvonz.github.io/jj/latest/install-and-setup/).

## Installation

### From the marketplace

Search for **"Jujutsu for VSCode"** in the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
and click **Install**.

Alternatively, install directly from the command line:

```
code --install-extension jjvs.jjvs
```

### From a .vsix file

If you have a `.vsix` package:

1. Open the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Click the `...` menu (top right of the Extensions panel)
3. Choose **Install from VSIX...**
4. Select the `.vsix` file

## Verifying activation

jjvs activates automatically when you open a folder containing a `.jj/` directory.

After opening a jj repository:

1. Look for the **Jujutsu** icon in the Activity Bar (left sidebar). It should be visible
   once the extension activates.
2. Open the **Output** panel (`View → Output`) and select **Jujutsu** from the dropdown.
   You should see a line like:
   ```
   Found jj 0.x.y
   jjvs activated — found 1 jj repository
   ```

If activation does not occur, check the [troubleshooting guide](../reference/troubleshooting.md).

## Configuring the jj binary path

By default, jjvs looks for `jj` on your `PATH`. If jj is installed in a non-standard location
(common with Nix, Homebrew, or custom installs), set the path explicitly:

1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for `jjvs.jjPath`
3. Set the value to the full path to your jj binary (e.g., `/home/user/.nix-profile/bin/jj`)

Alternatively, add this to your `settings.json`:

```json
{
  "jjvs.jjPath": "/path/to/jj"
}
```

For a full list of available settings, see the [Settings reference](../reference/settings.md).

## What's next

- [First steps](first-steps.md) — learn the UI layout and what each panel shows
- [Basic workflow](basic-workflow.md) — a guided walkthrough of the most common workflow

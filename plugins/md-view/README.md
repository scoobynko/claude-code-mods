# md-view

Read Markdown files without leaving Claude Code.

- **Click**: when Claude mentions a `.md` file in a reply, the path becomes a link. A single click opens the file rendered in a pane docked on the right, the way `/diff` docks. Ctrl- or alt-click keeps your terminal's own behaviour.
- **`/md-view`**: opens the pane with every Markdown file that has come up in the session, newest first. Arrows and Enter pick one; the last file you viewed is marked and holds the focus.
- **`/md-view <path>`**: previews that file directly.

The pane shows the file the way a reply is drawn: headings, lists, tables, code fences. Scroll with the wheel, press Esc to close. If Claude edits the file you are looking at, the preview updates.

## Install

```
/plugin marketplace add scoobynko/claude-code-mods
/plugin install md-view@scoobynko-mods
```

## What counts as a file of the session

A path is listed, and linked in replies, once Claude has brought it up and the file exists:

- a file Claude read, wrote or edited,
- a `.md` path in a shell command Claude ran, including a file the command created,
- a `.md` path in Claude's own text.

Paths you type, tool output and URLs are left out. Relative paths resolve against the session's working directory. `/md-view <path>` previews any text file, but only Markdown files join the list.

## Limits

- Clicks reach the mod in the fullscreen terminal (`"tui": "fullscreen"`). Elsewhere the paths are ordinary `file://` links and `/md-view` still works.
- Links appear when a reply block finishes, not while it streams, and only in the block that opens a reply (the one with the bullet).
- Paths are read the macOS and Linux way; Windows paths are not recognised.
- A preview shows the first 60,000 characters of a file and says so when it cuts.
- A table wider than the pane is drawn as a list of `Header: value` rows; a very long table is drawn in parts, each with its header.
- A reply over 10,000 characters keeps its normal drawing, without links.

## Test

```
claude plugin test plugins/md-view
```

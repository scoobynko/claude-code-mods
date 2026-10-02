# image-preview

`/image-preview` opens a pane beside the conversation with the images of the session: the ones you pasted, the ones tools returned (screenshots, `Read` of an image, MCP results), in the main conversation and in subagents, and image files written during the session. Pick one to see it right under its row, with a few lines of the message it came with.

- Newest first. `1`–`9`, or the arrows and Enter, pick an image; Esc closes the pane.
- New images show up while the pane is open.
- Click the picture, or press `e`, to enlarge it across the terminal; click it again, or press `e` or Esc, to go back to the list. `o` opens it in your system's image viewer. While enlarged, closing the pane any other way also goes back to the list first.
- Pictures draw in terminals with the kitty graphics protocol (Ghostty, kitty). Other terminals show the image's name in its place, and the desktop app links to the image file.
- Needs macOS or Linux. Images that are not PNG are converted with `sips` (macOS) or ImageMagick.

## Install

```
/plugin marketplace add scoobynko/claude-code-mods
/plugin install image-preview@scoobynko-mods
```

## How it works

The list is read from the conversation itself, so nothing is copied until you look. The image you pick is written as a PNG to a temp folder for the session, where the terminal reads it, and the folder is removed when the session ends.

Image files on disk are found by name: a path that a shell command or an MCP tool was given, one a command printed, or one Claude mentioned, kept when the file exists and was written since the session began. Quoted or escaped paths with spaces work, and so does a relative path after a `cd`. A file that nothing names (a script that picks its own filename and prints nothing) is not found until Claude reads or mentions it.

Before a compaction the images are saved to the temp folder, so they stay in the list afterwards. SVG files are not shown.

## Test

```
claude plugin test plugins/image-preview
```

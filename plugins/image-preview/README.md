# image-preview

`/image-preview` opens a pane beside the conversation with the images of the session: the ones you pasted, the ones tools returned (screenshots, `Read` of an image, MCP results) and image files that shell commands or MCP tools named. Pick one to see it large, with a few lines of the message it came with.

- Newest first. `1`–`9`, or the arrows and Enter, pick an image; Esc closes the pane.
- New images show up while the pane is open.
- Pictures draw in terminals with the kitty graphics protocol (Ghostty, kitty). Other terminals show the image's name in its place, and the desktop app links to the image file.
- Needs macOS or Linux. Images that are not PNG are converted with `sips` (macOS) or ImageMagick.

## Install

```
/plugin marketplace add scoobynko/claude-code-mods
/plugin install image-preview@scoobynko-mods
```

## How it works

The list is read from the conversation itself, so nothing is copied until you look. The image you pick is written as a PNG to a temp folder for the session, where the terminal reads it, and the folder is removed when the session ends.

Images inside subagent conversations are not listed. After a compaction, images from before it stay in the list only if the pane had already listed them, and can be shown only if you had already looked at them.

## Test

```
claude plugin test plugins/image-preview
```

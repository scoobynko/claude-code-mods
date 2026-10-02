# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code): small plugins that draw inside the terminal and react to what Claude is doing.

## Install

Add the marketplace once:

```
/plugin marketplace add scoobynko/claude-code-mods
```

Then install the mods you want:

| Mod | What it does | Install |
| --- | --- | --- |
| [clawd-spinner](plugins/clawd-spinner) | Clawd types on a tiny laptop under the spinner. The code Claude writes floats out of the screen, input tokens float in, and he turns to face you while thinking. | `/plugin install clawd-spinner@scoobynko-mods` |
| [image-preview](plugins/image-preview) | `/image-preview` opens a pane with every image of the session, pasted or returned by a tool, and shows the one you pick. | `/plugin install image-preview@scoobynko-mods` |

## Contributing

Ideas and bug reports are welcome as [issues](https://github.com/scoobynko/claude-code-mods/issues), fixes and new mods as pull requests.

## License

MIT

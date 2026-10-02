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
| [md-view](plugins/md-view) | Click a Markdown file in Claude's reply to read it rendered in a side pane. `/md-view` lists every Markdown file the session has touched. | `/plugin install md-view@scoobynko-mods` |

## Contributing

Ideas and bug reports are welcome as [issues](https://github.com/scoobynko/claude-code-mods/issues), fixes and new mods as pull requests.

## License

MIT

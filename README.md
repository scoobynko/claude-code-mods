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
| [md-view](plugins/md-view) | Click a Markdown file in Claude's reply to read it rendered in a side pane. `/md-view` lists every Markdown file the session has touched. | `/plugin install md-view@scoobynko-mods` |

## Contributing

Ideas and bug reports are welcome as [issues](https://github.com/scoobynko/claude-code-mods/issues), fixes and new mods as pull requests.

Name the branch `<type>/<short-description>`, in lowercase. Each mod has its own version and its own releases, and the type decides how the version of every mod the pull request touches moves:

| Branch | Version of each mod it touches |
| --- | --- |
| `feat/…` | minor, `1.2.0` → `1.3.0` |
| `fix/…`, `perf/…` | patch, `1.2.0` → `1.2.1` |
| `breaking/…`, or a `!` after the type as in `feat!/…` | major, `1.2.0` → `2.0.0` |
| `chore/…`, `docs/…`, `ci/…`, `test/…`, `refactor/…`, `style/…`, `build/…` | unchanged |

Don't change a mod's version yourself. When the pull request is merged into `main`, the version is bumped for you and a release named after the mod, such as `image-preview 0.3.0`, is published with the pull requests that changed it. A new mod is released at the version it arrives with.

## License

MIT

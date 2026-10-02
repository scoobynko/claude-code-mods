# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code): small TypeScript plugins that draw inside the terminal, react to what Claude is doing, and hot-reload while you edit them.

## Install

```
/plugin marketplace add scoobynko/claude-code-mods
/plugin install <mod>@scoobynko-mods
```

## Mods

| Mod | What it does |
| --- | --- |
| [clawd-spinner](plugins/clawd-spinner) | Clawd types on a tiny laptop under the spinner. The code Claude writes floats out of the screen, input tokens float in, and he turns to face you while thinking. |

## Developing a mod

Each mod lives in `plugins/<name>/` with the standard layout:

```
plugins/<name>/
├── .claude-plugin/plugin.json
├── hooks/hooks.json        { "modules": ["./register.tsx"] }
├── hooks/register.tsx      export const register: Register = (on, options) => { ... }
├── tests/*.test.ts
└── tsconfig.json           { "extends": "./.claude-plugin/types/tsconfig.json" }
```

Claude Code writes the API typings into `.claude-plugin/types/` the first time it loads a mod, which is what `tsconfig.json` extends. Load one straight from disk while working on it:

```
claude --plugin-dir plugins/<name>
claude plugin validate plugins/<name>
claude plugin test plugins/<name>
```

Add the mod to `.claude-plugin/marketplace.json` when it's ready to share.

## License

MIT

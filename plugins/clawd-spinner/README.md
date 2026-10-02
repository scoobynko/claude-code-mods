# clawd-spinner

Clawd sits under the Claude Code spinner with a tiny laptop and works along with Claude.

- **Typing**: side view, his hand pressing the keys and the laptop bouncing under it. Every line of code Claude writes (file writes, edits, shell commands, and code blocks in replies) floats out of the screen and fades as it rises.
- **Thinking**: he turns to face you, arms out, bobbing gently while `hm...` floats above his head.
- **Input tokens**: each request's input (fresh plus cached) floats into the laptop from the right in blue, topped up to the exact count when the response ends.

Terminal only; other surfaces keep the normal spinner.

## Install

```
/plugin marketplace add scoobynko/claude-code-mods
/plugin install clawd-spinner@scoobynko-mods
```

## Change his look

The poses are text art at the top of `hooks/register.tsx`, two characters per terminal cell horizontally and two per row vertically (quarter blocks):

| Mark | Drawn as |
| --- | --- |
| `o` | body |
| `O` | body in shade (the pressing arm) |
| `#` | eye |
| `=` | laptop |
| `l` | thinking leg, a ⅝-width bar filling its whole cell |
| `.` | empty |

A terminal cell can show two colours, so every 2×2 block of marks may hold at most two different ones. Save the file and a running session reloads the mod.

## Test

```
claude plugin test plugins/clawd-spinner
```

# Claude-CodedLinesTracker

A Claude Code mod that counts the lines of code Claude writes. It runs inside the app and uses no model tokens: it watches Claude's Write and Edit actions and counts the lines itself.

Blank lines are always skipped. Every total is shown two ways: code only, and with comments. The pane also shows comment lines, files touched, writes and edits, pace per minute, totals for the session, today and all time, the top file types and the biggest files.

Where it shows up: a boxed band above the prompt box, a side pane, and a small animated face beside the working spinner.

The band has Clawd, a pixel crab who wears a different outfit each day, and a small stage where scenes play (a new one every 30 seconds, idle or working, a wake-up scene for the day's first chat, a night scene after 10 pm). A pile on the stage shows today's lines: a block per 100, a gold column per 1,000. The pane's two rings show code lines by model, today and all time.

Toggle with the slash command `/linecount`:

- `/linecount` shows the pane and a one-line summary
- `/linecount status on|off` band above the prompt
- `/linecount pane on|off` open the pane at session start
- `/linecount mascot on|off` the animated face on the spinner
- `/linecount reset` zeroes this session's counts (all-time totals stay)
- `/linecount style auto|random|classic|card|arcade|compact` the band's design (auto = card, or compact when the band is narrow; random = a different design per chat, kept for that whole chat)
- `/linecount outfit auto|none|<name>` Clawd's outfit (auto changes daily)
- `/linecount background <name>` the pane's background color
- `/linecount section <name> on|off` show or hide a pane section

The status and mascot toggles are also buttons in the pane.

Limits: only Write and Edit are counted (code made by shell commands is not). Comment detection is by file type and is a heuristic. Counting starts when the mod is turned on. Lines by model are tracked from 2026-11-03; a subagent's lines count under the chat's model.

Install globally: `claude plugin marketplace add Ben-Diehlci/Claude-CodedLinesTracker` then `claude plugin install lines-tracker@claude-codedlinestracker --scope user` (the repo is private, so sign in to GitHub as Ben-Diehlci first).

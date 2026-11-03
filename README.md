# Claude-CodedLinesTracker

A Claude Code mod that counts the lines of code Claude writes. It runs inside the app and uses no model tokens: it watches Claude's Write and Edit actions and counts the lines itself.

Blank lines are always skipped. Every total is shown two ways: code only, and with comments. The pane also shows comment lines, files touched, writes and edits, pace per minute, totals for the session, today and all time, the top file types and the biggest files.

Where it shows up: a status line entry, a side pane, and a small animated face beside the working spinner.

Toggle with the slash command `/linecount`:

- `/linecount` shows the pane and a one-line summary
- `/linecount status on|off` status line entry
- `/linecount pane on|off` open the pane at session start
- `/linecount mascot on|off` the animated face on the spinner
- `/linecount reset` zeroes this session's counts (all-time totals stay)

The status and mascot toggles are also buttons in the pane.

Limits: only Write and Edit are counted (code made by shell commands is not). Comment detection is by file type and is a heuristic. Counting starts when the mod is turned on.

Install globally: `claude plugin marketplace add Ben-Diehlci/Claude-CodedLinesTracker` then `claude plugin install lines-tracker@claude-codedlinestracker --scope user` (the repo is private, so sign in to GitHub as Ben-Diehlci first).

# Lines Tracker for Claude Code

A Claude Code mod that counts the lines of code Claude writes, and keeps you company while it does.

It runs inside Claude Code and uses **no model tokens**: it watches Claude's Write and Edit actions and counts the lines itself, on your computer. Blank lines are never counted; every total is shown two ways, code only and with comments.

![The band above the prompt: today's lines, Clawd, and his stage](docs/images/band-card.svg)

## What you get

**A band above the prompt box** with today's lines (every open chat added up), this chat's lines, the all-time total, and Clawd, a small pixel crab.

- **Clawd** blinks, types while Claude works, hops when lines are written, and does tricks when idle (wave, dance, spin, peek, sneeze and more). He wears a different outfit each day.
- **The stage** beside him plays a new little scene every 30 seconds: idle ones (a bug chase, a butterfly, juggling, a coffee break, sweeping, a paper airplane...) and working ones (code rain, an editor typing, a build bar, a hamster wheel...). The day's first chat opens with a wake-up scene, and after 10 pm a night scene.
- **The pile** at the stage's right end is today's work: a block per 100 code lines, a gold column per 1,000.
- After each write a green **+N** shows how many lines just landed; every 1,000 lifetime lines sets off confetti.

A busy day, with gold columns on the pile:

![A busy day: three gold columns](docs/images/band-card-busy.svg)

A few of the stage's scenes:

| | |
|---|---|
| ![Bug chase](docs/images/scene-bug-chase.svg) | ![Builder](docs/images/scene-builder.svg) |
| ![Butterfly](docs/images/scene-butterfly.svg) | ![Code rain](docs/images/scene-code-rain.svg) |
| ![Build bar](docs/images/scene-build-bar.svg) | ![Morning](docs/images/scene-morning.svg) |

Clawd's wardrobe (on "auto" he picks one a day, some days none, and a nightcap after 10 pm):

![Every outfit](docs/images/outfits.svg)

**A side pane** with the details: Clawd's level, this chat's split of code, comments and blank lines, two rings of code lines by model (today and all time), the last 4 weeks as a heat strip with your streak, the chats writing right now, file types, the biggest files, and badges. It can sit on the app's own background or a color of your choice, and every section can be switched off.

| App background | Night background |
|---|---|
| ![The pane](docs/images/pane.svg) | ![The pane on the Night background](docs/images/pane-night.svg) |

**Other band designs**, if you prefer them (`/linecount style <name>`):

![Classic](docs/images/band-classic.svg)
![Arcade](docs/images/band-arcade.svg)
![Compact](docs/images/band-compact.svg)

The pictures above are drawn by the mod itself with sample numbers (`design/preview/export.sh` makes them). They follow your system's light or dark setting, as the mod does.

## Install

You need Claude Code (the terminal `claude` command, or the Code tab of the Claude desktop app). The repository is private for now, so you also need access to it on GitHub and to be signed in to GitHub on your computer.

### The easy way

Run these two commands in a terminal:

```bash
claude plugin marketplace add Ben-Diehlci/Claude-CodedLinesTracker
```

```bash
claude plugin install lines-tracker@claude-codedlinestracker --scope user
```

Then, in any open Claude Code chat, type `/reload-plugins` (or start a new chat). The band shows up above the prompt after your next message, and `/linecount` opens the pane.

You can do the same from inside Claude Code instead of a terminal: type `/plugin`, add the marketplace `Ben-Diehlci/Claude-CodedLinesTracker`, and install `lines-tracker` from it.

#### Getting updates

New versions come out as [releases](https://github.com/Ben-Diehlci/Claude-CodedLinesTracker/releases). To get them on their own: type `/plugin` in Claude Code, open **Marketplaces**, pick `claude-codedlinestracker` and turn on **auto-update**. Claude Code then checks when it starts and tells you when it installed a newer version (run `/reload-plugins` or start a new chat to use it).

Or update by hand whenever you like:

```bash
claude plugin marketplace update claude-codedlinestracker
```

```bash
claude plugin update lines-tracker@claude-codedlinestracker
```

### The harder way (from your own copy)

Use this if you want to change the mod, or to run it without the GitHub marketplace. You keep a copy of the code on your computer and Claude Code loads it from there.

1. Get the code:

   ```bash
   git clone https://github.com/Ben-Diehlci/Claude-CodedLinesTracker.git
   ```

2. Check that it is sound (this reads the mod the way Claude Code will, and runs its tests):

   ```bash
   cd Claude-CodedLinesTracker && claude plugin validate . && claude plugin test .
   ```

3. Either try it in one session only:

   ```bash
   claude --plugin-dir /full/path/to/Claude-CodedLinesTracker
   ```

   or install it for good from your copy (the folder is its own marketplace):

   ```bash
   claude plugin marketplace add /full/path/to/Claude-CodedLinesTracker
   ```

   ```bash
   claude plugin install lines-tracker@claude-codedlinestracker --scope user
   ```

Installed this way, Claude Code reads the mod straight from your folder: after you edit a file, `/reload-plugins` in a chat picks up the change.

To remove it either way: `claude plugin uninstall lines-tracker@claude-codedlinestracker`.

## Using it

Everything is under one slash command, `/linecount`:

| Command | What it does |
|---|---|
| `/linecount` | Opens the pane and shows a one-line summary |
| `/linecount status on\|off` | The band above the prompt |
| `/linecount pane on\|off` | Open the pane when a chat starts |
| `/linecount mascot on\|off` | Clawd (and the little face on the working spinner) |
| `/linecount style auto\|card\|classic\|arcade\|compact` | The band's design ("auto" is card, or compact when the window is narrow) |
| `/linecount outfit auto\|none\|<name>` | Clawd's outfit: "auto" changes daily, or pick one (crown, tophat, cowboy, wizard, viking, ...) |
| `/linecount background <name>` | The pane's background: none (the app's own), paper, sand, blush, slate or night |
| `/linecount section <name> on\|off` | Show or hide a pane section: header, numbers, rings, heat, sessions, languages, files, badges |
| `/linecount reset` | Zeroes this chat's counts (today and all-time totals stay) |

Most of these are also buttons and pickers at the bottom of the pane (behind a Settings button when the pane has a background color).

## Good to know

- Only Claude's Write and Edit actions are counted; code made by shell commands is not.
- Comments are told apart by file type, which is a good guess rather than a perfect one.
- Counting starts when the mod is installed. Lines by model are known from 2026-11-03 on; older lines show as "earlier". A subagent's lines count under its chat's model.
- Totals live on each computer (Claude Code's plugin store). Counting across several computers is optional: see Two or more computers.
- Every number stays on your computer. Nothing is sent anywhere, and no model is asked anything.

## Two or more computers (optional)

By default each computer counts alone. To see each computer and a combined count, point every computer at one folder that something already syncs between them (Syncthing, iCloud Drive, Dropbox, OneDrive or a network share all work):

1. Make a folder inside a synced location, for example `~/Sync/lines-tracker` (with Syncthing: a folder inside one you already share, or a new shared folder).
2. On each computer run `/linecount sync ~/Sync/lines-tracker`, using the path that computer sees. The folder must exist, and it may sit at a different path on each computer.
3. Run `/linecount computers` to check. After the other computer has run it too, each shows up with its own color and the totals add up.

How it works: each computer writes only its own small file there (`totals-<computer name>.json`, line counts and the computer's model name, such as "MacBook Pro"; no file names or code) and reads the others. A computer never edits another's file, so the sync tool has nothing to conflict over. A computer that is off keeps its last numbers, shown with "last seen". Nothing is sent over the network by the mod itself; your sync tool moves the files.

- `/linecount count this` shows only this computer's numbers (the others are still listed); `/linecount count both` adds them up (the default once a folder is set).
- `/linecount sync off` stops writing and reading; `/linecount sync` shows the folder in use.
- Needs a Mac (the computer's name and model come from macOS commands). If a computer cannot run them, it counts alone.

## For developers

- `hooks/register.tsx` wires it up (events, the store, timers); `hooks/model.ts` works out the numbers; designs only draw them.
- Band designs: `hooks/styles/` (one file each). The desktop band is one SVG, which the app caps at 128 KB.
- Clawd: `hooks/clawd.ts` (sprite, outfits, tricks). The stage: `hooks/stage.ts` and `hooks/scenes.ts`. The desktop pane: `hooks/panesvg.ts`; the terminal pane: `hooks/panes.tsx`.
- Tests: `claude plugin test .`. Design mockups are in `design/`; `design/preview/preview.sh` draws every design into a page to compare, and `design/preview/export.sh` remakes the pictures in this README.
- Releases: `scripts/release.sh 0.2.0` checks and tests the mod, writes the version into `.claude-plugin/plugin.json`, tags it `v0.2.0`, pushes, and makes a GitHub release listing the commits since the last one. Add `--dry-run` to only check. Claude Code offers an update only when that version number goes up, so pushing without a release reaches nobody else.

License: see [LICENSE](LICENSE).

# Outpost

Learn opening theory move by move, drill it until it sticks, and see *why* moves are good. Stockfish 19 runs entirely in your browser (WASM), so it needs no server or API key.

```bash
npm install
npm run dev
```

## Openings

There are 73 opening repertoires. They range from mainstream (Ruy Lopez, Najdorf, Dragon, Queen's Gambit, London) through aggressive gambits (Muzio, Max Lange, Marshall, Milner-Barry, Blackmar-Diemer) to dubious, trappy and meme lines (Halloween, Jerome, Englund, Latvian, Stafford, Traxler, Grob, Bongcloud, Colorado, Fajarowicz), plus solid lifetime repertoires (French, Caro-Kann, Petrov, Pirc, Philidor, King's Indian, Grünfeld, Nimzo-/Queen's Indian, QGD, Slav, English, Catalan) and club systems (Colle & Stonewall, Réti, King's Fianchetto, Bishop's Opening, Nimzo-Larsen, and a Black setup against offbeat first moves).

The Openings page shows each opening as a small board of its main-line position. Openings you've studied are grouped under **Your repertoire**, due ones first, and the rest under **Explore**. You can filter by status, style and White's first move, search, sort, and switch between cards and a list. A featured **opening of the week** earns 1.5× XP.

- **Repertoire coverage** checks your studied openings against the first moves you'll meet ("as Black you have no answer to 1.Nc3") and suggests what to learn next. As White it does the same for Black's common replies.
- **Opening finder**: play or paste moves and see every opening that reaches that position, by any move order, with the book's next moves.

Every opening can be trained from either side. Use **Play it** to learn the opening itself, or **Face it** to learn how to meet it. Moves marked `?` or `??` are traps: Learn shows them in red so you can see how the punishment works, and Practice warns you if you fall for one. Where your side has two book moves, Practice nudges you toward the one you've practiced less.

## Modes

- **Learn**: walk an opening's tree. On your turn, green arrows show the book move. On the opponent's turn, every reply in the repertoire is listed so you can explore each one. A note explains each key move, and a line tracker shows which lines you've studied.
- **Practice**: you play your side and the trainer plays book replies, steering toward lines you haven't mastered yet. If you play a wrong move, Stockfish grades it, shows the opponent's punishing reply, and explains why the book move is better. Mastery uses spaced repetition. Each position climbs New → Learning → Familiar → Mastered, one step per correct answer, but only after a waiting period (5 min, 1 h, 1 day, 3 days). A mistake drops a move back to Learning, and using Hint caps it there. The opponent steers toward new, weak and due positions.
- **Analysis**: a free board with the top 3 engine lines, an eval bar, and a "Why is this best?" button. You can also play any position out against Stockfish with adjustable strength, and it grades each of your moves. "Play it out" at the end of any book line opens that position here.
- **Premoves**: anywhere you play against an opponent (Practice, the Arena, Endgames, trap puzzles, mating patterns, Analysis vs Stockfish) you can queue up to 10 moves while it's thinking. Queued moves show on the board in purple as if already played and fire one per turn; if one becomes illegal, the rest are dropped. Right-click (or click an empty square) to cancel them all.
- **Endgames**: 22 positions to win or hold against full-strength Stockfish: checkmates (from queen mate up to bishop + knight and queen vs rook), pawn endings (opposition, rule of the square, breakthrough, outside passer), rook endings (Lucena, Philidor, Vančura, rook vs minor piece), minor pieces (right/wrong bishop, opposite-colored bishops) and queen vs pawn. Each has a technique guide and hints, and five short **courses** chain them in teaching order. Mating endgames are graded ★ to ★★★ against perfect play from the Lichess endgame database. `npm run audit` confirms with Stockfish that every "win" position is winning and every "hold" position is a draw.
- **Training (visualization)**: *Calculate it* narrates a line in words ("Knight to b4. Bishop to e2, check."), optionally read aloud, while the board stays frozen. You follow it in your head, then answer what's on which square. *Name the move* shows an arrow and you type the move, either as `Nb4` or as `knight b4`.
- **Arena**: *Opening Gauntlet* (Stockfish plays every book reply against you, traps included, then you must survive 8 moves on your own), *Boss fights* (a boss per opening that steers into your weakest lines; unlocks with a Bronze medal), *Blitz the book* (60 seconds of book positions) and *Sparring* (play out the end of one of your lines, graded).
- **Training (more)**: *Defend it* (you're the side being tricked — find the move that doesn't fall for the trap), *Guess the master's move* (8 famous games), *Pawn structures* (pick the plan for Carlsbad, IQP, Maróczy, Stonewall…), mating patterns (back-rank, smothered, Philidor's legacy, Arabian, Anastasia, Boden, Damiano, Epaulette, Greco, Opera; each position checked by Stockfish), Guess the eval, Plans & ideas, and Name that opening (with a pawns-only hard mode).
- **Training (timed)**: timed drills (find or name the square from either side, light or dark, knight routes, counting checks and captures in real opening positions) and **trap puzzles**, which are generated automatically from every `?`/`??` move in the opening data.
- **Blindfold**: available in Practice, Endgames and Analysis. Pieces are hidden; type moves (`Nf3`, `exd5`, `O-O`) or click squares. Hold 👁 to peek (but you lose the bonus).

## Themes & settings

Open ⚙ for 20 themes: 14 dark and 6 light. Five are minimal luxury themes with a single accent (Onyx, Obsidian, Noir Rouge, Mono, and the light Ivory). Others have more character: Synthwave (neon), Terminal (monospace green), Sand and Coffee (serif, warm) among them. You can also pick a board color (eight more boards are unlocked by playing), turn coordinates on or off, set the animation speed, choose auto-queen or a promotion picker, and switch off XP pop-ups. Theme colors are generated by `python3 scripts/gen-themes.py`, which writes `src/index.css`.

## Progress & gamification

XP pays for learning: new positions and reviews that come due are worth the most, repeating something you just answered is worth 1 XP, and grinding the same opening or drill all day pays less and less. XP feeds 100 levels with chess titles (Patzer I to World Champion).

- **Opening medals**: Bronze, Silver, Gold and Diamond per opening. Positions you leave overdue slowly fade, so medals can be lost and re-earned.
- **Daily quests**: three a day. Finishing all three earns a streak freeze, which covers a missed day.
- **Bosses, achievements (49) and a year-in-review card** on the Profile page.
- **Leaderboards** (optional, with a nickname): this week's XP, all-time XP, bosses, streaks and Gauntlet scores per opening, with a friends-only view.

## Your games

**My Games** imports your recent games from Lichess or chess.com (public APIs, no login) or from pasted PGN. Stockfish then analyzes every move in the background, and keeps going while you use other pages. You get:

- **A report on your habits**: accuracy, blunders per game, which pieces you hang most, what you miss (forks, free pieces, mates, discovered attacks), how you get hit (walking into forks, back-rank weaknesses, allowed mates), which phase of the game goes wrong, results by opening, and where you leave the theory you've studied.
- **Full game reviews**: an eval graph, every move classified, "Next mistake" jumping, and for each error the best move, why it works, and the punishing line.
- **Puzzles from your own mistakes**, which you can filter by mistake type, plus "train" buttons on every pattern.
- **Openings in your games**: every opening you've met, how you score, how long your games stay in book, and whether you've studied it, with a Learn / Practice / Find openings button for each. Matching follows transpositions.
- **Analysis only**: import someone else's games to analyze them without them counting towards your report or puzzles.

## Daily review, your own repertoire, and play-outs

- **Daily review** (badge in the sidebar) is a short mixed session: positions that are due for review from every opening you've started, on both sides, plus trap puzzles and puzzles from your own games.
- **My Repertoire** lets you build your own openings on the board, with notes and `?`/`??` trap annotations, or import PGN (comments become notes). You can also copy a built-in opening and change it. Your openings work everywhere a built-in one does.
- **Graded play-out**: "Play it out" at the end of a book line has you play 10 moves against Stockfish with hints off, then gives you an accuracy score and a list of your mistakes.
- **Clock**: Practice can give you 3–20 seconds per move. Running out counts as a miss.

## Sync

Outpost has no accounts. To use it on several devices, turn on **Sync** in Settings: you get a 12-character code to enter on your other devices. Progress from all of them is merged (XP adds up rather than overwriting), and the server only stores a compressed copy under a hash of the code. See [DEPLOY.md](DEPLOY.md) for the Cloudflare setup.

## Why is it the best move?

"Why is this best?" in the engine panel uses the built-in explainer (`src/lib/explain.ts`). It reads the position and Stockfish's line to find material wins, forks, discovered attacks, threats, rescued pieces, development, open files and forced mates. Everything runs in your browser, with no accounts or API keys.

## Adding or editing openings

Openings live in `src/data/openings.ts` as SAN lines with inline notes:

```ts
"e4 e5 f4{The King's Gambit…} exf4 Nf3{Stops …Qh4+.} g5 h4",
```

Lines that share moves merge into one tree. Suffixes like `?`, `!` and `??` are kept as annotations, which is handy for trap lines. After editing, run:

```bash
npm run validate
```

This checks every move for legality, flags positions where your side has more than one book move, and rejects endgame start positions where a king could be captured.

```bash
npm run audit            # every opening (takes several minutes)
npm run audit -- englund # just one
```

This has Stockfish check the theory: every `?`/`??` move must really lose ground, and any book move that throws away 2 pawns or more is listed for review.

Tests: `npm run test:explain` (explanation heuristics), `test:review` (daily review), `test:economy` (XP, levels, medals, quests), `test:sync` (device sync merging) and `test:openings` (matching games to openings, the finder and coverage).

## License & credits

Outpost is free software under the **GNU GPL v3.0 or later** (see `LICENSE`). That's required because it ships Stockfish (GPL-3.0). The engine files in `public/engine/` are unmodified, with their own `COPYING.txt` and a `README.txt` pointing to the upstream source. The app's **About & credits** page lists every dependency and service with its license.

Before publishing, set your repository URL so the About page links to the source (the GPL requires this):

```bash
cp .env.example .env   # then edit VITE_REPO_URL
```

For step-by-step hosting (Cloudflare Pages, GitHub Pages or a DigitalOcean droplet), see [DEPLOY.md](DEPLOY.md).

The About page also lets users download a backup of their data, restore it, or delete everything.

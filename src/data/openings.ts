// Opening repertoires. Each opening is a list of lines in SAN, written from the
// starting position. A `{note}` right after a move explains it; when several lines
// share a move, write its note once (the first non-empty note wins).
// `?` / `!` suffixes are kept as annotations (e.g. `Bxb4??` marks a blunder in a trap line).

export type Side = 'w' | 'b'

export interface OpeningDef {
  id: string
  name: string
  eco: string
  side: Side // the side YOU play
  tags: string[]
  summary: string
  ideas: string[]
  lines: string[]
  /** set on the mirrored copy used to practise facing this opening */
  flipped?: boolean
}

import { EXTRA_OPENINGS } from './openings-extra'
import { SOLID_OPENINGS } from './openings-solid'
import { MORE_OPENINGS } from './openings-more'

const CORE_OPENINGS: OpeningDef[] = [
  // ───────────────────────────── White gambits ─────────────────────────────
  {
    id: 'kings-gambit',
    name: "King's Gambit",
    eco: 'C30–C39',
    side: 'w',
    tags: ['gambit', 'e4', 'romantic'],
    summary:
      "White offers the f-pawn on move two to rip open the f-file and build a big center with d4. Sharp, old-school and very practical below master level.",
    ideas: [
      'Recapture or bypass f4 later — the pawn often comes back with Bxf4.',
      'Play d4 and Bc4 fast; the f-file and the f7 square are your targets.',
      'Be careful of ...Qh4+ ideas while your king is still on e1 — Nf3 stops them.',
      "Against ...g5 lines, hit the pawn chain with h4 to loosen Black's kingside.",
    ],
    lines: [
      "e4 e5 f4{The King's Gambit. White offers a wing pawn to deflect e5, open the f-file and grab the center with d4.} exf4{Accepting. Black takes the pawn and will often try to hold it with ...g5.} Nf3{The main move: develops and, crucially, stops ...Qh4+.} g5{Classical: Black defends f4 with the g-pawn and aims to keep the extra material.} h4{Undermining the pawn chain before Black can consolidate with ...Bg7 and ...h6.} g4 Ne5{The Kieseritzky Gambit. The knight jumps forward, eyeing f7 and g4.} Nf6{The Berlin Defence, Black's most respected reply: counterattacks e4.} d4{Building the center and opening the c1-bishop to recapture on f4.} d6 Nd3{Retreat, keeping the knight guarding f4 and e5.} Nxe4 Bxf4{White regains the pawn with active pieces; theory considers the position roughly balanced.}",
      "e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 d6{Black hits the knight immediately.} Nxg4{Taking back a pawn and keeping material balance.} Nf6 Nxf6+{Trading to simplify; Black's kingside pawns are broken.} Qxf6 Nc3{Developing and preparing Nd5 / d4. White has easy play against Black's loose position.}",
      "e4 e5 f4 exf4 Nf3 d6{The Fischer Defence: prevents Ne5 and prepares ...g5 under better circumstances.} d4{Take the center while Black spends time on pawns.} g5 h4{Same theme: undermine the g5 pawn.} g4 Ng1{The quirky but correct retreat — the knight was attacked and has no better square. White will recapture f4 with Bxf4 and develop with Ne2.}",
      "e4 e5 f4 exf4 Nf3 d5{The Modern Defence: Black gives back the pawn immediately for fast development.} exd5{Take it; the d5 pawn is now a target, but Black's f4 pawn is weak too.} Nf6 Nc3{Developing and defending d5.} Nxd5 Nxd5 Qxd5 d4{Grab the center; White will regain f4 with Bxf4 and has a comfortable game.}",
      "e4 e5 f4 exf4 Nf3 Nf6{The Schallopp Defence: counterattacks e4 straight away.} e5{Kick the knight; it has to go to the edge.} Nh5 d4{Building the center. Ideas like Qe2 and g4 to trap the h5-knight are in the air.}",
      "e4 e5 f4 exf4 Nf3 Be7{The Cunningham: Black eyes ...Bh4+ to annoy the white king.} Bc4{Develop with tempo toward f7. If ...Bh4+, White plays Kf1 — the king is safe enough and the rook comes to f1 naturally after g3.}",
      "e4 e5 f4 Bc5{King's Gambit Declined, Classical. The bishop on c5 stops White castling short and makes taking on e5 dangerous (…Qh4+).} Nf3{Develop and cover h4. Don't play fxe5?? because of ...Qh4+ winning material.} d6 Nc3{Calm development. White prepares Bc4, d3 and perhaps f5 or Na4 to trade the strong c5-bishop.} Nf6 Bc4{Aiming at f7. White keeps a pleasant, flexible position.} Nc6 d3{Solidly protecting e4; White can later castle and push f5.}",
      "e4 e5 f4 d5{The Falkbeer Countergambit: Black strikes back in the center immediately.} exd5{Take it.} e4{Black gives a pawn to cramp White.} d3{Challenge the e4 pawn right away.} Nf6 dxe4 Nxe4 Nf3 Bc5 Qe2{Pinning the e4-knight against the king. White is a pawn up and Black must play accurately.}",
      "e4 e5 f4 d5 exd5 exf4{Black transposes into a sort of Modern Defence.} Nf3{Stops ...Qh4+ and prepares to win f4 back with d4/Bxf4 or c4.}",
      "e4 e5 f4 Nc6{A quiet decline.} Nf3{Develop; e5 is attacked again and fxe5 is coming next.}",
      "e4 e5 f4 exf4 Nf3 Nc6{Developing instead of holding the pawn.} d4{Center first; Bxf4 regains the pawn.} g5 h4{The familiar lever against …g5.}",
      "e4 e5 f4 d6{A solid decline.} Nf3 Nc6 Bc4{Normal development with pressure on f7.}",
      "e4 e5 f4 Qh4+?!{An early queen check that just loses time.} g3 Qe7 Nc3{White develops with a nice lead.}",
    ],
  },
  {
    id: 'evans-gambit',
    name: 'Evans Gambit',
    eco: 'C51–C52',
    side: 'w',
    tags: ['gambit', 'e4', 'italian'],
    summary:
      'A gambit inside the Italian Game: White sacrifices the b-pawn to gain time on the c5-bishop, build a center with c3 and d4, and attack quickly.',
    ideas: [
      'Every tempo matters: c3 and d4 come with gain of time against the bishop.',
      'Your light-squared bishop on c4 and queen on b3 target f7.',
      'Ba3 is a typical way to stop Black castling kingside.',
      'If Black gives the pawn back cleanly, you still enjoy the freer position.',
    ],
    lines: [
      "e4 e5 Nf3 Nc6 Bc4{The Italian Game: the bishop eyes Black's weakest square, f7.} Bc5{Giuoco Piano — the cue for the Evans.} b4{The Evans Gambit! White offers a pawn to gain time with c3 and d4.} Bxb4{Accepted, the most common choice.} c3{Hits the bishop with tempo and prepares d4.} Ba5{The main retreat, keeping an eye on the c3 pawn and pinning it later with ...Bb6 ideas.} d4{Strike the center while Black's bishop is offside.} exd4 O-O{White castles first: development over material. d4 can wait.} Nge7{The modern main line: Black prepares ...d5 to return material and catch up in development.} cxd4 d5{Black returns the pawn to break White's center.} exd5 Nxd5 Ba3{Preventing Black from castling. White has active pieces and good compensation.}",
      "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 d6{Black holds the e5 pawn instead of taking.} Qb3{Pressure on f7 and b7 at the same time.} Qd7{The only good way to protect f7.} dxe5{Opening lines while Black's pieces are awkward.} Bb6 Nbd2{Development; White plans Bb5 / Ba3 / Nc4 with lasting initiative.}",
      "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Be7{The Lasker-style retreat: the bishop goes back to safety.} d4{Center again.} Na5{Hitting the c4-bishop.} Be2{Keeping the bishop (Kasparov's choice).} exd4 Qxd4{Centralized queen, hitting g7 and a7.} Nf6 e5{Gaining space with tempo.} Nc6 Qh4{White's queen swings toward the kingside; White has open lines for the pawn.}",
      "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Bc5{Retreating to the original square.} d4{The bishop gets hit again after dxe5 or cxd4.} exd4 O-O d6 cxd4 Bb6{The so-called Normal Position: White has a broad center for the pawn.} Nc3{Development; d5 and e5 pushes are in the air.}",
      "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bb6{Evans Gambit Declined.} a4{Threatening a5 to trap or harass the bishop.} a6 Nc3{Developing; Nd5 is a common follow-up to trade the bishop.}",
      "e4 e5 Nf3 Nc6 Bc4 Nf6{The Two Knights Defence — Black avoids the Evans entirely.} Ng5{Attacking f7 directly.} d5{The correct reply: block the bishop.} exd5 Na5{The main line: Black gives a pawn and hits the c4-bishop.} Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5{Black has activity for the pawn — a principled theoretical battle.}",
      "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5?!{A natural move, but it walks into the Fried Liver Attack.} Nxf7!{Sacrificing the knight to drag the king out.} Kxf7 Qf3+{Forking the king and the d5-knight.} Ke6 Nc3{Piling up on the pinned knight. White's attack is very dangerous in practice.}",
    ],
  },
  {
    id: 'danish-gambit',
    name: 'Danish Gambit',
    eco: 'C21',
    side: 'w',
    tags: ['gambit', 'e4', 'romantic'],
    summary:
      'White gives up to two pawns for two raking bishops aimed at f7 and g7. Lethal in fast games; the critical defence returns material with ...d5.',
    ideas: [
      'Bishops on c4 and b2 slice toward the black king.',
      'Know the Schlechter defence (…d5!) — it forces an equal endgame.',
      "Don't grab material back early; development and initiative are your compensation.",
    ],
    lines: [
      "e4 e5 d4{Opening the center immediately.} exd4 c3{The Danish Gambit: offering a second pawn.} dxc3 Bc4{Offering a third! White wants speed above everything.} cxb2 Bxb2{Two bishops aimed at f7 and g7, and Black is still undeveloped.} d5!{The Schlechter Defence — Black gives a pawn back to blunt the c4-bishop.} Bxd5{Recapture — the bishop keeps eyeing f7.} Nf6 Bxf7+{Forcing matters: White removes f7 and trades queens.} Kxf7 Qxd8 Bb4+{An important zwischenzug: Black blocks with check before recapturing.} Qd2{The only good block.} Bxd2+ Nxd2{An equal endgame. White has the safer king and easy development; it's still fun to play.}",
      "e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2 Nc6{Natural development, but it lets White's attack roll.} Nf3{Develop and prepare O-O, Qb3 or Nc3 with heavy pressure on f7.}",
      "e4 e5 d4 exd4 c3 dxc3 Bc4 cxb2 Bxb2 Bb4+{Black develops with check.} Nc3{Block with development.} Nf6 Ne2{Supporting c3 and keeping f2 flexible; White castles next with a strong initiative.}",
      "e4 e5 d4 exd4 c3 d5{The Sørensen Defence: declining with a central counterstrike.} exd5 Qxd5 cxd4{White has the isolated d-pawn but free development.} Nc6 Nf3 Bg4 Be2{Calm development, unpinning. Roughly equal.}",
    ],
  },
  {
    id: 'smith-morra',
    name: 'Smith-Morra Gambit',
    eco: 'B21',
    side: 'w',
    tags: ['gambit', 'e4', 'anti-sicilian'],
    summary:
      'An anti-Sicilian pawn sacrifice: White trades the d-pawn for quick development, half-open c- and d-files and attacking chances against the Sicilian.',
    ideas: [
      'Standard setup: Nc3, Nf3, Bc4, O-O, Qe2, Rd1 — then e5 or Nd5 breaks.',
      'The d-file pin against the d6 pawn/queen is a recurring weapon.',
      'Beware the Siberian Trap: after ...Qc7 and ...Nd4 ideas, never allow ...Qh2#.',
    ],
    lines: [
      "e4 c5 d4{Challenging the Sicilian head-on.} cxd4 c3{The Morra: offering the pawn for development.} dxc3 Nc3{White is a pawn down but has two pieces ready to develop and open files.} Nc6 Nf3 d6 Bc4{The bishop aims at f7 and the e6 square.} e6{Black blunts the bishop and prepares ...Nf6 and ...Be7.} O-O{King to safety, rook toward the center.} Nf6 Qe2{Connecting rooks; Rd1 is next to pressure d6.} Be7 Rd1{Classic Morra setup. White has full compensation and plans e5 or Bf4 ideas.}",
      "e4 c5 d4 cxd4 c3 dxc3 Nc3 e6 Nf3 Nc6 Bc4 a6{Black prepares ...b5 and ...Nge7 — the Scheveningen-style setup.} O-O Nge7 Bg5{Provoking ...f6 or ...h6 and pressing on e7.}",
      "e4 c5 d4 cxd4 c3 dxc3 Nc3 Nc6 Nf3 e6 Bc4 Qc7{The Siberian setup.} O-O Nf6 Qe2 Ng4{Eyeing h2 together with the queen.} h3??{The natural kick — and a famous blunder.} Nd4!{The Siberian Trap: …Nxe2+ and …Qh2# are both threatened.} Nxd4 Qh2#{Mate.}",
      "e4 c5 d4 cxd4 c3 dxc3 Nc3 Nc6 Nf3 e6 Bc4 Qc7 O-O Nf6 Qe2 Ng4 Rd1!{The right reply: the rook eyes d7 and f2 is covered by the queen.} Bc5 Nb5{Chasing the queen; Nd6+ is in the air. Roughly equal, full compensation.}",
      "e4 c5 d4 cxd4 c3 Nf6{Declining: Black hits e4 immediately.} e5{Kick the knight away.} Nd5 cxd4{Now it is a type of Alapin Sicilian with a full center for White.} d6 Nf3 Nc6 Bc4{Pressure on d5; White is comfortable.}",
      "e4 c5 d4 cxd4 c3 d3{Black returns the pawn awkwardly, blocking White's bishop momentarily.} Bxd3 Nc6 c4{A Maroczy-bind type setup with an easy space advantage.}",
      "e4 c5 d4 cxd4 c3 d5{Declining with a central break.} exd5 Qxd5 cxd4{Similar to a good Alapin: White's center and development are fine.}",
      "e4 c5 d4 d6{Some players skip ...cxd4.} dxc5{Taking is fine; after ...dxc5 Qxd8+ Kxd8, Black's king has lost castling rights.}",
    ],
  },
  {
    id: 'vienna-gambit',
    name: 'Vienna Gambit',
    eco: 'C25–C29',
    side: 'w',
    tags: ['gambit', 'e4'],
    summary:
      "A safer cousin of the King's Gambit: Nc3 first controls d5 and e4, then f4 opens the f-file with a strong e5 push.",
    ideas: [
      'After fxe5 the e5 pawn cramps Black and kicks the f6-knight.',
      'Play d3 or d4 to kick a knight that lands on e4.',
      'Castle quickly and use the half-open f-file.',
    ],
    lines: [
      "e4 e5 Nc3{The Vienna Game: guards e4 and d5 and keeps the f-pawn free to advance.} Nf6 f4{The Vienna Gambit.} d5!{The best reply: Black strikes in the center.} fxe5{Gaining space and kicking the f6-knight next.} Nxe4 Nf3{Develop, protect e5, prepare d3 or d4.} Be7 d4 O-O Bd3{Pressure on the e4-knight and the h7 square.} f5 exf6{En passant opens the f-file for both sides.} Bxf6 O-O{A healthy, balanced middlegame.}",
      "e4 e5 Nc3 Nf6 f4 exf4{Taking leaves Black cramped.} e5{Kicking the knight back home.} Ng8 Nf3{Developing; d4 and Bxf4 are coming. White has a great center.} d6 d4{Huge center, f4 will fall.}",
      "e4 e5 Nc3 Nf6 f4 d6{Solid, but passive.} Nf3{Develop. Bc4 and O-O come next with a King's-Gambit-Declined-style position.} Nc6 Bb5{Pinning the knight and pressuring e5.}",
      "e4 e5 Nc3 Nc6{Black mirrors.} Bc4{Aim at f7.} Nf6 d3{Solid Vienna: White keeps f4 in reserve for later.}",
      "e4 e5 Nc3 Bc5{Pre-empting f4 by eyeing g1.} Nf3{Develop; f4 is premature now.}",
    ],
  },
  {
    id: 'queens-gambit',
    name: "Queen's Gambit",
    eco: 'D06–D69',
    side: 'w',
    tags: ['gambit', 'd4', 'classical'],
    summary:
      'Not a true gambit — the c-pawn is hard to keep. White challenges d5 with c4 to win central control. A lifelong repertoire for White.',
    ideas: [
      'If Black takes on c4, play e3 / e4 and recapture with the bishop.',
      'Against the QGD, the Bg5 pin and minority attack (b4-b5) are main plans.',
      'Against the Slav, a4 stops ...b5 from holding the c4 pawn.',
    ],
    lines: [
      "d4 d5 c4{The Queen's Gambit: attack the d5 pawn's support from the side.} e6{The Queen's Gambit Declined: rock-solid support for d5.} Nc3 Nf6 Bg5{Pin the knight to increase pressure on d5.} Be7 e3 O-O Nf3 h6{Asking the bishop a question.} Bh4 b6{The Tartakower Variation, solving the problem of Black's light-squared bishop.}",
      "d4 d5 c4 dxc4{The Queen's Gambit Accepted. Black takes but cannot keep the pawn.} Nf3{Stops ...e5 first.} Nf6 e3{Opening the f1-bishop to recapture.} e6 Bxc4{White wins back the pawn with a nice center.} c5 O-O a6{Black prepares ...b5. White is slightly better with the easier development.}",
      "d4 d5 c4 dxc4 Nf3 b5?!{Trying to hold the pawn is dubious.} a4{Undermine the b5 pawn.} c6 e3{Bxc4 or axb5 will win the material back with a better position.}",
      "d4 d5 c4 c6{The Slav: supports d5 while keeping the c8-bishop free.} Nf3 Nf6 Nc3 dxc4 a4{Stops ...b5 holding the pawn.} Bf5 e3 e6 Bxc4 Bb4 O-O{The main line of the Slav. Balanced, but White has the center to play with.}",
      "d4 d5 c4 e5{The Albin Countergambit.} dxe5{Take it.} d4 Nf3{Defending against ...dxe3 tricks and preparing g3.} Nc6 g3{Fianchetto pressure on the long diagonal.} Be6 Nbd2 Qd7 Bg2{White plans O-O, a3 and b4 to attack Black's long-castled king.}",
      "d4 d5 c4 Nc6{The Chigorin Defence: Black gives up the center for piece play.} Nf3{Calmly stops ...e5.} Bg4 cxd5{Exploiting the pin-free moment.} Bxf3 gxf3{Bishop pair and center for White.}",
    ],
  },
  // ───────────────────────────── White solid ─────────────────────────────
  {
    id: 'italian',
    name: 'Italian Game',
    eco: 'C50–C54',
    side: 'w',
    tags: ['e4', 'classical', 'solid'],
    summary:
      'One of the oldest openings: develop quickly, aim the bishop at f7, then build slowly with c3, d3 and a well-timed d4.',
    ideas: [
      'The slow Giuoco Pianissimo (c3 + d3) is the modern main line.',
      'Re1, h3 and Nbd2-f1-g3 is a typical knight maneuver.',
      'a4 gains queenside space and makes a retreat square for the bishop.',
    ],
    lines: [
      "e4 e5 Nf3 Nc6 Bc4 Bc5{Giuoco Piano.} c3{Preparing d4 one day; also gives the bishop a retreat square on c2/b3 later.} Nf6 d3{The Pianissimo: White keeps everything protected and plays slowly.} d6 O-O O-O Re1{Supporting e4 and preparing Nbd2-f1.} a6 a4{Making space for the bishop on a2 and stopping ...b5.}",
      "e4 e5 Nf3 Nc6 Bc4 Nf6{Two Knights Defence.} d3{The solid approach: protect e4.} Be7 O-O O-O Re1 d6 c3{A classical setup, aiming for Nbd2-f1-g3 and d4 later.}",
      "e4 e5 Nf3 Nc6 Bc4 Be7{The Hungarian Defence: very solid.} d4{Strike while Black is passive.} d6 Nc3{White has easy development and a nice center.}",
      "e4 e5 Nf3 Nc6 Bc4 Nd4?!{The Blackburne Shilling Gambit: a cheap trap.} Nxe5?{Greedy — exactly what Black wants.} Qg5{Forking the knight and g2.} Nxf7??{Grabbing more…} Qxg2 Rf1 Qxe4+ Be2 Nf3#{Smothered! Know this so you never fall for it.}",
      "e4 e5 Nf3 Nc6 Bc4 Nd4 Nxd4{The simple answer.} exd4 O-O{White is comfortably better: Black wasted time with the knight.}",
    ],
  },
  {
    id: 'london',
    name: 'London System',
    eco: 'D02 / A46',
    side: 'w',
    tags: ['d4', 'system', 'solid'],
    summary:
      'A system opening: almost the same setup against everything — d4, Bf4, e3, Nf3, c3, Bd3, Nbd2. Low theory, solid structure, kingside attacking chances.',
    ideas: [
      'Get the bishop out to f4 before e3 locks it in.',
      'Answer ...Bd6 with Bg3 to keep your pawn structure intact.',
      'Ne5 + f4 and h4-h5 are typical attacking plans.',
      'Beware ...c5 + ...Qb6 hitting b2 — know the Nc3!? gambit or Qb3.',
    ],
    lines: [
      "d4 d5 Bf4{The London: develop the dark-squared bishop before e3.} Nf6 e3 c5{The most testing setup: Black hits d4.} c3{Solidly supporting d4.} Nc6 Nd2{Keeping f3 for the other knight and covering e4 and c4.} e6 Ngf3 Bd6 Bg3{Avoiding the trade on bad terms; if ...Bxg3 hxg3 opens the h-file.} O-O Bd3{The full London setup. White plans Ne5, Qe2 or a kingside attack.}",
      "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3{Same structure by a different move order. Learn the setup, not just the moves.}",
      "d4 d5 Bf4 c5 e3 Qb6{Immediately hitting b2.} Nc3!?{A gambit: if ...Qxb2, Nb5 threatens Nc7+.} Qxb2?{Greedy — Stockfish says this already costs Black a lot.} Nb5{Threatening Nc7+ forking king and rook. Black's queen is in real danger after Rb1 too.}",
      "d4 Nf6 Bf4{The London works against ...Nf6 too.} g6{A King's Indian setup.} e3 Bg7 Nf3 O-O Be2 d6 h3{Giving the bishop a retreat square on h2 against ...Nh5.}",
    ],
  },
  // ───────────────────────────── Black gambits ─────────────────────────────
  {
    id: 'budapest',
    name: 'Budapest Gambit',
    eco: 'A51–A52',
    side: 'b',
    tags: ['gambit', 'vs-d4', 'trappy'],
    summary:
      'A counter-gambit against 1.d4 2.c4: Black offers the e-pawn for rapid development and usually wins it back on e5 with ...Ng4 and ...Nc6.',
    ideas: [
      'Hit e5 with ...Ng4, ...Nc6 and ...Qe7 to regain the pawn.',
      '...Bb4+ develops with tempo and often provokes Nbd2.',
      "Know the famous trap: after a3 Ngxe5, axb4?? Nd3 is checkmate!",
    ],
    lines: [
      "d4 Nf6 c4 e5{The Budapest Gambit: an immediate counterpunch.} dxe5 Ng4{Attacking e5; Black will win it back.} Bf4{The main line, defending the pawn.} Nc6{Adding a second attacker.} Nf3 Bb4+{Developing with tempo before White can play Nc3 comfortably.} Nbd2 Qe7{A third attacker on e5 — the pawn is falling.} e3 Ngxe5 Nxe5 Nxe5 Be2 O-O O-O{Material is level and Black has active pieces. Ideas like ...a5-a4 and ...Ra6-h6 make it fun.}",
      "d4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 a3?!{Natural, but it loses to a trap if White is careless.} Ngxe5 axb4??{Grabbing the bishop...} Nd3#{Smothered! The e2 pawn is pinned by the queen on e7, so it cannot take on d3.}",
      "d4 Nf6 c4 e5 dxe5 Ng4 Nf3{Defending e5 with the knight instead.} Bc5{Attacking f2.} e3 Nc6 Be2 Ngxe5 Nxe5 Nxe5 O-O O-O{Again material is level with a comfortable game for Black.}",
      "d4 Nf6 c4 e5 dxe5 Ng4 e4{The Alekhine Variation: White gives back the pawn for a big center.} Nxe5 f4{Chasing the knight.} Nec6{The knight heads back but keeps pressure on d4/e5.} Be3 Bb4+ Nc3{Black will play ...Qe7 / ...O-O and strike with ...f5 or ...d6.}",
      "d4 Nf6 c4 e5 d5{Declining by closing the center.} Bc5{An active post; Black plays ...d6, ...O-O and ...a5 like a Czech Benoni.} Nc3 O-O",
      "d4 Nf6 c4 e5 dxe5 Ne4!?{The Fajarowicz Variation: the knight jumps in and eyes f2 and c3.} Nf3 Nc6{Hitting e5.} a3 d6{Opening the d-file for the queen.} exd6 Bxd6 g3?{Natural, but it walks into a trap.} Nxf2!{A knight sacrifice on f2…} Kxf2 Bxg3+!{…and a bishop sacrifice that deflects the h2-pawn (or the king) from the defence.} hxg3 Qxd1{The d-file is open — Black wins the queen. A reverse ICBM!}",
      "d4 Nf6 c4 e5 dxe5 Ne4 Nf3 Nc6 a3 d6 exd6 Bxd6 Nbd2{The careful move: challenging the e4-knight.} Bf5{Supporting the knight; Black has active pieces for the pawn.}",
      "d4 Nf6 c4 e5 dxe5 Ne4 Qc2{Attacking the knight immediately.} Bb4+ Nd2 d5{Defending the knight with a pawn and opening lines.} exd6 Bf5{Black has rapid development for the pawn.}",
    ],
  },
  {
    id: 'albin',
    name: 'Albin Countergambit',
    eco: 'D08–D09',
    side: 'b',
    tags: ['gambit', 'vs-d4', 'trappy'],
    summary:
      "An aggressive reply to the Queen's Gambit: ...e5 offers a pawn, then the d4 wedge cramps White. Home of the Lasker Trap, featuring an underpromotion to a knight.",
    ideas: [
      'The d4 pawn is a bone in White\'s throat — support it with ...Nc6 and ...Bg4/...Be6.',
      'Long castling with ...O-O-O and a kingside pawn storm is typical.',
      'If White plays e3 too early, ...Bb4+ and ...dxe3 sets up the Lasker Trap.',
    ],
    lines: [
      "d4 d5 c4 e5{The Albin Countergambit.} dxe5 d4{The wedge: it cramps White and controls e3 and c3.} Nf3 Nc6{Defending d4 and planning ...Bg4 / ...Be6 / ...Qd7 / ...O-O-O.} g3 Be6{Hitting c4 and preparing ...Qd7 and long castling.} Nbd2 Qd7 Bg2 O-O-O{Opposite-side castling: Black will attack with ...h5-h4 or ...Bh3.}",
      "d4 d5 c4 e5 dxe5 d4 e3?{A natural-looking mistake.} Bb4+{Checking with tempo.} Bd2 dxe3{The d-pawn crashes in.} Bxb4??{The decisive error...} exf2+ Ke2 fxg1=N+!{The Lasker Trap: underpromoting to a knight with check. A queen would allow Rxg1.} Rxg1 Bg4+{Skewering the king and queen. Black wins material.}",
      "d4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 fxe3 Qh4+{Exploiting the weak dark squares.} g3 Qe4{Forking the e3 pawn and the h1 rook. Black regains material with a good game.}",
      "d4 d5 c4 e5 dxe5 d4 Nf3 Nc6 g3 Bg4{An alternative to ...Be6: pin and pressure on f3.} Bg2 Qd7 O-O O-O-O{Same plans as the main line.}",
    ],
  },
  {
    id: 'benko',
    name: 'Benko Gambit',
    eco: 'A57–A59',
    side: 'b',
    tags: ['gambit', 'vs-d4', 'positional'],
    summary:
      "A positional gambit: Black gives a queenside pawn for long-term pressure along the a- and b-files and the long diagonal. The compensation doesn't evaporate in the endgame.",
    ideas: [
      'Fianchetto with ...g6/...Bg7 — the long diagonal is your best piece.',
      'Rooks on a8 and b8, queen on a5/b6: lean on a2 and b2.',
      'Trading pieces often helps Black; the pressure persists into the endgame.',
    ],
    lines: [
      "d4 Nf6 c4 c5{Challenging the center.} d5{White grabs space; now the Benko is possible.} b5{The Benko Gambit.} cxb5 a6{Offering a second pawn to open the a-file.} bxa6 Bxa6{Black's bishop now pressures White's kingside from a6.} Nc3 d6 e4{The main line: White gives up castling to grab the center.} Bxf1{Trading off White's good bishop.} Kxf1 g6 g3 Bg7 Kg2 O-O Nf3{Typical Benko: Black plays ...Nbd7, ...Qa5 / ...Qb6 and ...Rfb8 with long-term pressure.}",
      "d4 Nf6 c4 c5 d5 b5 Nf3{Declining with development.} bxc4{Taking the pawn back; Black has a free game.} Nc3 d6{Solid; ...g6 and ...Bg7 follow.}",
      "d4 Nf6 c4 c5 d5 b5 cxb5 a6 b6{Returning the pawn to keep the queenside closed.} d6{Black will win b6 back later with ...Nbd7xb6 or ...Qxb6.} Nc3 g6{Normal development; the b6 pawn is weak.}",
      "d4 Nf6 c4 c5 d5 b5 a4{Attacking the b5 pawn from the side.} b4{Gaining space and keeping the queenside closed.} Nd2 e6{Black challenges d5 immediately.}",
      "d4 Nf6 c4 c5 Nf3{Not allowing d5 immediately.} cxd4 Nxd4 e5{Kicking the knight; Black has fine play.}",
    ],
  },
  {
    id: 'stafford',
    name: 'Stafford Gambit',
    eco: 'C42',
    side: 'b',
    tags: ['gambit', 'vs-e4', 'trappy', 'offbeat'],
    summary:
      "A trappy blitz weapon from the Petrov move order. Objectively dubious, but full of traps that catch even strong players. Know the traps and the sound replies.",
    ideas: [
      "After ...Nxc6 dxc6, Black's pieces fly out to c5, g4 and h4 aiming at f2.",
      'The famous trap: Bg5?? Nxe4! Bxd8 Bxf2+ Ke2 Bg4#.',
      '...h5 supports ...Ng4 and stops Bg5. Beware: objectively White is better.',
    ],
    lines: [
      "e4 e5 Nf3 Nf6{The Petrov move order.} Nxe5{White takes; now the Stafford.} Nc6{The Stafford Gambit: offering a pawn.} Nxc6 dxc6{Opening lines for the queen and c8-bishop.} d3{The calm, best reply: protect e4.} Bc5{Aiming at f2.} Be2{Simple development, avoiding Bg5.} h5{Preparing ...Ng4 and preventing Bg5. The play is double-edged.}",
      "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 d3 Bc5 Bg5??{The natural pin is a blunder.} Nxe4!{Sacrificing the queen.} Bxd8 Bxf2+ Ke2 Bg4#{Checkmate! The bishops and knight cover every escape square.}",
      "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 e5{Kicking the knight.} Ne4 d4{White's best move — but Black has a trick ready.} Qh4{Threatening …Qxf2#.} g3?{The natural defence loses material.} Nxg3{The knight sac opens the h1-rook.} fxg3 Qe4+{Forking the king and the h1 rook.}",
      "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 e5 Ne4 d4 Qh4 Qf3{The correct defence: f2 is covered and g3 stays safe. White is clearly better.}",
      "e4 e5 Nf3 Nf6 Nxe5 Nc6 Nxc6 dxc6 Nc3{Natural development.} Bc5 Be2 h5{The same plan as before: ...Ng4 and kingside play.}",
      "e4 e5 Nf3 Nf6 Nc3{White avoids the gambit — Four Knights.} Nc6{Simply develop; a normal game.}",
      "e4 e5 Nf3 Nf6 d4{The Steinitz attack of the Petrov.} Nxe4{Take the central pawn.} dxe5 d5{Supporting the e4-knight.}",
    ],
  },
  // ───────────────────────────── Black solid ─────────────────────────────
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defence',
    eco: 'B10–B19',
    side: 'b',
    tags: ['vs-e4', 'solid'],
    summary:
      "A solid reply to 1.e4: ...c6 supports ...d5 while keeping the c8-bishop free. Fewer weaknesses than the French, less theory than the Sicilian.",
    ideas: [
      'Develop the light-squared bishop to f5 or g4 before ...e6.',
      'In the Advance, strike back with ...c5.',
      'In the Classical, answer h4-h5 with ...h6 and ...Bh7.',
    ],
    lines: [
      "e4 c6{The Caro-Kann.} d4 d5{Challenge the center.} Nc3{The Classical.} dxe4 Nxe4 Bf5{Developing the bishop with tempo.} Ng3 Bg6 h4{Threatening h5 to trap the bishop.} h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3{The main line: Black continues ...e6, ...Ngf6, ...Qc7 and often long castling.}",
      "e4 c6 d4 d5 e5{The Advance Variation: grabbing space.} Bf5{Develop the bishop outside the pawn chain before ...e6.} Nf3 e6 Be2 c5{Striking at the base of White's chain.} Be3{The Short Variation; Black has comfortable play.}",
      "e4 c6 d4 d5 e5 Bf5 Nc3 e6 g4{The aggressive Bayonet.} Bg6 Nge2 c5{Counterattack in the center is the antidote to wing attacks.}",
      "e4 c6 d4 d5 exd5{The Exchange Variation.} cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4{Developing the bishop actively before ...e6.} Qb3{Hitting b7; Black defends with ...Qd7 or ...Qc8.}",
      "e4 c6 d4 d5 exd5 cxd5 c4{The Panov-Botvinnik Attack: an isolated queen's pawn fight.} Nf6 Nc3 e6 Nf3 Be7{Solid; Black aims to blockade d5.}",
      "e4 c6 Nc3{The Two Knights.} d5 Nf3 Bg4{Pin and develop.}",
      "e4 c6 c4{The Accelerated Panov.} d5{Hit back in the center.}",
      "e4 c6 d4 d5 f3{The Fantasy Variation: holding e4 with a pawn.} e6{Solid; …c5 and …Bb4 follow.} Nc3 Bb4{Pinning the knight and pressuring e4.}",
      "e4 c6 d4 d5 Nd2{The Classical by another move order.} dxe4 Nxe4 Bf5 Ng3 Bg6{Same structure as the main line.}",
    ],
  },
]

export const OPENINGS: OpeningDef[] = [...CORE_OPENINGS, ...EXTRA_OPENINGS, ...SOLID_OPENINGS, ...MORE_OPENINGS]

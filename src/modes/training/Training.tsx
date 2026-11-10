import { useState } from 'react'
import { useProfile } from '../../lib/game'
import { PUZZLES } from '../../lib/puzzles'
import { TrapPuzzles } from './Puzzles'
import { ColorsDrill, CoordinatesDrill, CountingDrill, KnightDrill } from './Vision'
import { CalculationDrill, NotationDrill } from './Visualize'
import { MatingPatterns } from './Mates'
import { MATES } from '../../data/mates'
import { MASTER_GAMES } from '../../data/masters'
import { EvalGuess, NameOpening, PlanQuiz } from './Quizzes'
import { DefendIt } from './Defend'
import { MasterGames } from './Masters'
import { StructureQuiz } from './Structures'

type Group = 'Vision' | 'Tactics' | 'Judgment'
const GROUPS: { id: Group; blurb: string }[] = [
  { id: 'Vision', blurb: 'See the board in your head: name squares, follow lines, count forcing moves.' },
  { id: 'Tactics', blurb: 'Patterns that win games.' },
  { id: 'Judgment', blurb: 'Know who is better, and why.' },
]

type Drill = 'coords' | 'colours' | 'knight' | 'count' | 'puzzles' | 'notation' | 'calc' | 'mates' | 'plans' | 'evalguess' | 'nameopening' | 'defend' | 'masters' | 'structures'

const DRILLS: { id: Drill; group: Group; name: string; desc: string; bestKey?: string }[] = [
  { id: 'puzzles', group: 'Tactics', name: 'Trap puzzles', desc: 'Punish the blunders from the opening traps you studied.' },
  { id: 'calc', group: 'Vision', name: 'Calculate it', desc: 'Follow a narrated line in your head — "knight b4, bishop e2 check" — then say what\'s where.', bestKey: 'calc' },
  { id: 'notation', group: 'Vision', name: 'Name the move', desc: 'An arrow appears; type the move by its squares. Builds fluent notation.', bestKey: 'notation' },
  { id: 'defend', group: 'Tactics', name: 'Defend it', desc: 'The reverse of trap puzzles: you are the one being tricked. Find the move that does not walk into it.' },
  { id: 'masters', group: 'Judgment', name: "Guess the master's move", desc: 'Play through famous games — the Opera Game, the Immortal, Fischer\'s Game of the Century — and guess each move.' },
  { id: 'structures', group: 'Judgment', name: 'Pawn structures', desc: 'Carlsbad, IQP, Maróczy, Stonewall… recognize the structure, pick the plan.', bestKey: 'structures' },
  { id: 'mates', group: 'Tactics', name: 'Mating patterns', desc: 'Back-rank, smothered, Arabian, Anastasia, Boden and more — learn them on the board.' },
  { id: 'evalguess', group: 'Judgment', name: 'Guess the eval', desc: "Who's better, and by how much? Uses your own games when you've imported some.", bestKey: 'evalguess' },
  { id: 'plans', group: 'Judgment', name: 'Plans & ideas', desc: 'Match each opening to its plans — understanding, not just memory.', bestKey: 'plans' },
  { id: 'nameopening', group: 'Judgment', name: 'Name that opening', desc: 'Recognize openings from the position or just the pawns.', bestKey: 'nameopening' },
  { id: 'coords', group: 'Vision', name: 'Coordinates', desc: 'Find or name squares against the clock, from either side.', bestKey: 'coords' },
  { id: 'colours', group: 'Vision', name: 'Light or dark', desc: 'Name square colors without a board — pure visualization.', bestKey: 'colours' },
  { id: 'knight', group: 'Vision', name: 'Knight routes', desc: 'Shortest knight paths. Builds fork vision.', bestKey: 'knight' },
  { id: 'count', group: 'Vision', name: 'Checks & captures', desc: 'Count the forcing moves in real opening positions.', bestKey: 'count' },
]

export function Training({ onBlindfold, initial }: { onBlindfold: () => void; initial?: string }) {
  const [drill, setDrill] = useState<Drill | null>(() => (DRILLS.some((d) => d.id === initial) ? (initial as Drill) : null))
  const profile = useProfile()

  if (drill)
    return (
      <div className="space-y-4">
        <button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setDrill(null)}>
          ← All training
        </button>
        {drill === 'coords' && <CoordinatesDrill />}
        {drill === 'colours' && <ColorsDrill />}
        {drill === 'knight' && <KnightDrill />}
        {drill === 'count' && <CountingDrill />}
        {drill === 'puzzles' && <TrapPuzzles />}
        {drill === 'notation' && <NotationDrill />}
        {drill === 'calc' && <CalculationDrill />}
        {drill === 'mates' && <MatingPatterns />}
        {drill === 'plans' && <PlanQuiz />}
        {drill === 'evalguess' && <EvalGuess />}
        {drill === 'nameopening' && <NameOpening />}
        {drill === 'defend' && <DefendIt />}
        {drill === 'masters' && <MasterGames />}
        {drill === 'structures' && <StructureQuiz />}
      </div>
    )

  const stat = (d: (typeof DRILLS)[number]) =>
    d.id === 'puzzles' ? `${(profile.sets.puzzles ?? []).length}/${PUZZLES.length}` : d.id === 'defend' ? `${(profile.sets.defended ?? []).length} held` : d.id === 'masters' ? `${(profile.sets.mastersPassed ?? []).length}/${MASTER_GAMES.length}` : d.id === 'mates' ? `${(profile.sets.mates ?? []).length}/${MATES.length}` : profile.bests[d.bestKey!] ? `best ${profile.bests[d.bestKey!]}` : ''
  const row = (key: string, name: string, desc: string, onClick: () => void, right = '') => (
    <button key={key} onClick={onClick} className="group flex w-full flex-wrap items-baseline gap-x-6 gap-y-1 py-4 text-left sm:flex-nowrap">
      <span className="w-full text-lg text-zinc-100 group-hover:text-brand-300 sm:w-48 sm:shrink-0">{name}</span>
      <span className="min-w-0 flex-1 text-sm text-zinc-500 group-hover:text-zinc-300">{desc}</span>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-500">{right}</span>
      <span className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-brand-400">→</span>
    </button>
  )

  return (
    <div className="max-w-4xl space-y-12">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-brand-400">Training</p>
        <h1 className="mt-1 text-3xl font-bold text-zinc-50">Drills</h1>
        <p className="mt-1 text-sm text-zinc-500">Short sessions. Personal bests earn bonus XP.</p>
      </header>
      {GROUPS.map((g) => (
        <section key={g.id}>
          <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-400">{g.id}</h2>
            <p className="hidden text-xs text-zinc-600 sm:block">{g.blurb}</p>
          </div>
          <div className="divide-y divide-white/5">{DRILLS.filter((d) => d.group === g.id).map((d) => row(d.id, d.name, d.desc, () => setDrill(d.id), stat(d)))}</div>
        </section>
      ))}
      <section>
        <div className="border-b border-white/10 pb-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-400">Blindfold</h2>
        </div>
        {row('blind', 'Blindfold play', 'Play Stockfish without seeing the pieces — type moves or click squares. Also available in Practice and Endgames, for double XP.', onBlindfold)}
      </section>
    </div>
  )
}

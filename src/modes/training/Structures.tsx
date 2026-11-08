import { useMemo, useState } from 'react'
import { STRUCTURES } from '../../data/structures'
import { Mini, RoundShell } from './Quizzes'
import { shuffle } from './shared'

/** Pawn structures: pick the right plan. Understanding beats memory. */
export function StructureQuiz() {
  return (
    <RoundShell id="structures" title="Pawn structures" blurb="Kings and pawns only — the skeleton of the middlegame. Pick the plan that fits the structure." rounds={8} xpPer={6}>
      {({ answer, round }) => <Round round={round} answer={answer} />}
    </RoundShell>
  )
}

function Round({ round, answer }: { round: number; answer: (points: number) => void }) {
  const s = useMemo(() => shuffle(STRUCTURES)[0], [round]) // eslint-disable-line react-hooks/exhaustive-deps
  const options = useMemo(() => shuffle([s.answer, ...s.wrong]), [s])
  const [picked, setPicked] = useState<string | null>(null)
  const toMove = s.fen.split(' ')[1]
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      <Mini fen={s.fen} orientation={toMove === 'w' ? 'white' : 'black'} />
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-widest text-zinc-500">{s.name}</p>
        <p className="text-lg text-zinc-100">{s.question}</p>
        <div className="space-y-2">
          {options.map((o) => {
            const right = o === s.answer
            const tone = !picked ? 'ring-white/10 hover:ring-brand-500/50' : right ? 'ring-emerald-500 bg-emerald-500/10' : o === picked ? 'ring-red-500 bg-red-500/10' : 'ring-white/5 opacity-50'
            return (
              <button
                key={o}
                disabled={!!picked}
                onClick={() => {
                  setPicked(o)
                  answer(right ? 1 : 0)
                }}
                className={`block w-full rounded-lg p-3 text-left text-sm text-zinc-200 ring-1 transition ${tone}`}
              >
                {o}
              </button>
            )
          })}
        </div>
        {picked && <p className="text-sm text-zinc-400">{s.why}</p>}
      </div>
    </div>
  )
}

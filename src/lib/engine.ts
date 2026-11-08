import { Chess } from 'chess.js'

// Stockfish 19 (lite, single-threaded WASM) running in a Web Worker. No server, no API key.
const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`

export interface EngineLine {
  multipv: number
  depth: number
  /** centipawns from White's point of view (undefined when mate is set) */
  cp?: number
  /** mate in N from White's point of view (+ = White mates) */
  mate?: number
  pv: string[] // UCI moves
}

export interface Analysis {
  fen: string
  depth: number
  lines: EngineLine[]
  bestmove: string
}

interface Job {
  fen: string
  go: string
  multipv: number
  onUpdate?: (a: Analysis) => void
  resolve: (a: Analysis) => void
  lines: Map<number, EngineLine>
  depth: number
}

export class Engine {
  private worker: Worker
  private ready: Promise<void>
  private job: Job | null = null
  private pending: Job | null = null
  private stopping = false
  private multipv = 1

  constructor(options: Record<string, string | number> = {}) {
    this.worker = new Worker(ENGINE_URL)
    let markReady!: () => void
    this.ready = new Promise((r) => (markReady = r))
    this.worker.onmessage = (e: MessageEvent<string>) => {
      const line = String(e.data)
      if (line === 'readyok') markReady()
      else if (line.startsWith('info ')) this.onInfo(line)
      else if (line.startsWith('bestmove')) this.onBestmove(line)
    }
    this.send('uci')
    for (const [k, v] of Object.entries(options)) this.send(`setoption name ${k} value ${v}`)
    this.send('isready')
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  setOption(name: string, value: string | number) {
    this.send(`setoption name ${name} value ${value}`)
  }

  /** Analyze a position. Starting a new analysis cancels the previous one (it resolves with partial results). */
  analyze(fen: string, opts: { depth?: number; movetime?: number; multipv?: number } = {}, onUpdate?: (a: Analysis) => void): Promise<Analysis> {
    return new Promise((resolve) => {
      const go = opts.movetime ? `go movetime ${opts.movetime}` : `go depth ${opts.depth ?? 16}`
      const job: Job = { fen, go, multipv: opts.multipv ?? 1, onUpdate, resolve, lines: new Map(), depth: 0 }
      if (this.pending) this.pending.resolve(this.snapshot(this.pending, ''))
      this.pending = job
      if (this.job) {
        if (!this.stopping) {
          this.stopping = true
          this.send('stop')
        }
      } else {
        void this.startNext()
      }
    })
  }

  stop() {
    if (this.pending) {
      this.pending.resolve(this.snapshot(this.pending, ''))
      this.pending = null
    }
    if (this.job && !this.stopping) {
      this.stopping = true
      this.send('stop')
    }
  }

  private async startNext() {
    const job = this.pending
    if (!job) return
    this.pending = null
    this.job = job
    await this.ready
    if (job.multipv !== this.multipv) {
      this.multipv = job.multipv
      this.send(`setoption name MultiPV value ${job.multipv}`)
    }
    this.send(`position fen ${job.fen}`)
    this.send(job.go)
  }

  private onInfo(line: string) {
    const job = this.job
    if (!job || this.stopping) return
    const t = line.split(' ')
    const pvAt = t.indexOf('pv')
    const scoreAt = t.indexOf('score')
    if (pvAt < 0 || scoreAt < 0) return
    const depth = Number(t[t.indexOf('depth') + 1])
    const mpIdx = t.indexOf('multipv')
    const multipv = mpIdx >= 0 ? Number(t[mpIdx + 1]) : 1
    const kind = t[scoreAt + 1]
    let val = Number(t[scoreAt + 2])
    // UCI scores are from the side to move; normalize to White's perspective.
    if (job.fen.split(' ')[1] === 'b') val = -val
    const entry: EngineLine = { multipv, depth, pv: t.slice(pvAt + 1) }
    if (kind === 'mate') entry.mate = val
    else entry.cp = val
    job.lines.set(multipv, entry)
    if (multipv === 1) job.depth = depth
    job.onUpdate?.(this.snapshot(job, ''))
  }

  private onBestmove(line: string) {
    const job = this.job
    this.job = null
    this.stopping = false
    if (job) job.resolve(this.snapshot(job, line.split(' ')[1] ?? ''))
    void this.startNext()
  }

  private snapshot(job: Job, bestmove: string): Analysis {
    const lines = [...job.lines.values()].sort((a, b) => a.multipv - b.multipv)
    return { fen: job.fen, depth: job.depth, lines, bestmove: bestmove || lines[0]?.pv[0] || '' }
  }

  terminate() {
    this.worker.terminate()
  }
}

let analysisEngine: Engine | null = null
let playEngine: Engine | null = null

/** Shared engine for analysis panels and move explanations. */
export function getAnalysisEngine() {
  return (analysisEngine ??= new Engine())
}

/** Separate engine that plays moves as your opponent (so it never fights the analysis panel). */
export function getPlayEngine() {
  return (playEngine ??= new Engine())
}

let batchEngine: Engine | null = null
/** Engine for long background jobs (analyzing your imported games). */
export function getBatchEngine() {
  return (batchEngine ??= new Engine())
}

let checkEngine: Engine | null = null
/** Engine used to judge the trainee's moves in the background. */
export function getCheckEngine() {
  return (checkEngine ??= new Engine())
}

// ───────────────────────── helpers ─────────────────────────

export function uciToSan(fen: string, uci: string[]): string[] {
  const chess = new Chess(fen)
  const out: string[] = []
  for (const u of uci) {
    try {
      out.push(chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
    } catch {
      break
    }
  }
  return out
}

/** SAN line with move numbers, e.g. "12.Nxe5 dxe5 13.Qh5+" */
export function formatPv(fen: string, uci: string[], max = 8): string {
  const sans = uciToSan(fen, uci.slice(0, max))
  const parts = fen.split(' ')
  let moveNo = Number(parts[5])
  let white = parts[1] === 'w'
  const out: string[] = []
  sans.forEach((san, i) => {
    if (white) out.push(`${moveNo}.${san}`)
    else out.push(i === 0 ? `${moveNo}…${san}` : san)
    if (!white) moveNo++
    white = !white
  })
  return out.join(' ')
}

export function formatScore(line?: Pick<EngineLine, 'cp' | 'mate'>): string {
  if (!line) return '…'
  if (line.mate !== undefined) return line.mate === 0 ? '#' : `${line.mate > 0 ? '' : '-'}M${Math.abs(line.mate)}`
  const v = (line.cp ?? 0) / 100
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`
}

/** Score as a single comparable number (White POV, pawns), mates mapped to ±100. */
export function scoreValue(line?: Pick<EngineLine, 'cp' | 'mate'>): number {
  if (!line) return 0
  if (line.mate !== undefined) return line.mate > 0 ? 100 - line.mate / 100 : line.mate < 0 ? -100 - line.mate / 100 : 0
  return (line.cp ?? 0) / 100
}

/** Rough win probability for White (0..1), lichess-style logistic. */
export function winProb(line?: Pick<EngineLine, 'cp' | 'mate'>): number {
  if (!line) return 0.5
  if (line.mate !== undefined) return line.mate > 0 ? 1 : line.mate < 0 ? 0 : 0.5
  return 1 / (1 + Math.exp(-0.00368208 * (line.cp ?? 0)))
}

// Pawn structures and their plans: the bones of the middlegame.
export interface Structure {
  id: string
  name: string
  fen: string // kings + pawns only
  question: string
  answer: string
  wrong: [string, string]
  why: string
}

export const STRUCTURES: Structure[] = [
  {
    id: 'carlsbad',
    name: 'Carlsbad',
    fen: '6k1/pp3ppp/2p5/3p4/3P4/4P3/PP3PPP/6K1 w - - 0 1',
    question: "White's classic plan in this Queen's Gambit Exchange structure?",
    answer: 'The minority attack: b4–b5 to leave Black with a weak c-pawn',
    wrong: ['Push the e-pawn to e5 at once', 'Trade everything for a pawn endgame'],
    why: 'Two queenside pawns attack three. After b5xc6, Black is left with a backward c6-pawn or an isolated d5-pawn to target.',
  },
  {
    id: 'iqp-white',
    name: 'Isolated queen pawn (with it)',
    fen: '6k1/pp3ppp/4p3/8/3P4/8/PP3PPP/6K1 w - - 0 1',
    question: 'You have the isolated d-pawn. What should you aim for?',
    answer: 'Active pieces, a kingside attack and the d4–d5 break',
    wrong: ['Trade pieces to reach an endgame', 'Defend d4 passively with every piece'],
    why: 'The IQP gives open files and outposts on e5/c5. It gets weaker as pieces come off, so play for activity and the d5 break.',
  },
  {
    id: 'iqp-black',
    name: 'Isolated queen pawn (against it)',
    fen: '6k1/pp3ppp/4p3/8/3P4/8/PP3PPP/6K1 b - - 0 1',
    question: "You're playing against the isolated pawn. The plan?",
    answer: 'Blockade d5, trade pieces, then win the pawn in the endgame',
    wrong: ['Open the kingside with …g5', 'Allow d4–d5 and recapture with a pawn'],
    why: 'The square in front of an isolani is the perfect outpost. Every trade brings you closer to an endgame where d4 just falls.',
  },
  {
    id: 'hanging',
    name: 'Hanging pawns',
    fen: '6k1/p4ppp/8/2pp4/8/4P3/PP3PPP/6K1 w - - 0 1',
    question: 'Black has hanging pawns on c5 and d5. How does White play?',
    answer: 'Pressure them with pieces and force one to advance, then attack the other',
    wrong: ['Leave them alone and attack the king', 'Exchange your e-pawn for one of them'],
    why: 'Side by side they control a lot; once one pushes, the other becomes isolated or backward and the squares in front go weak.',
  },
  {
    id: 'maroczy',
    name: 'Maróczy Bind',
    fen: '6k1/pp2pp1p/3p2p1/8/2P1P3/8/PP3PPP/6K1 b - - 0 1',
    question: 'White has the c4/e4 bind against your Sicilian. Your approach?',
    answer: 'Be patient: trade a few pieces and prepare …b5 or …f5',
    wrong: ['Break with …d5 at once', 'Push …e5 and …f5 together on move one'],
    why: '…d5 is impossible against the bind. Black has less space, so trades help, and the …b5 or …f5 breaks come later.',
  },
  {
    id: 'french-chain',
    name: 'French Advance chain',
    fen: '6k1/pp3ppp/4p3/2ppP3/3P4/2P5/PP3PPP/6K1 b - - 0 1',
    question: "Black's plan against White's pawn chain?",
    answer: 'Hit the base: pressure d4 (…Nc6, …Qb6) and break with …f6',
    wrong: ['Attack the head of the chain on e5 only', 'Castle long and push the h-pawn'],
    why: 'A chain is attacked at its base. Pressure on d4 and the …f6 break undermine e5.',
  },
  {
    id: 'kid-white',
    name: "King's Indian, closed center (White)",
    fen: '6k1/ppp2p1p/3p2p1/3Pp3/2P1P3/8/PP3PPP/6K1 w - - 0 1',
    question: 'The center is locked. Where does White play?',
    answer: 'On the queenside, with c4–c5 and b4',
    wrong: ['On the kingside with g4', 'In the center with f4 straight away'],
    why: 'With a closed center you play where your pawns point. White\'s chain aims at the queenside, so c5 opens lines there.',
  },
  {
    id: 'kid-black',
    name: "King's Indian, closed center (Black)",
    fen: '6k1/ppp2p1p/3p2p1/3Pp3/2P1P3/8/PP3PPP/6K1 b - - 0 1',
    question: 'And Black?',
    answer: 'A kingside storm: …f5, …f4 and …g5',
    wrong: ['…c6 to open the c-file', '…b5 to fight on the queenside'],
    why: "Black's pawns point at the kingside. The race is on: …f5–f4–g5–g4 against White's queenside play.",
  },
  {
    id: 'stonewall',
    name: 'Stonewall',
    fen: '6k1/pp4pp/2p1p3/3p1p2/2PP4/4P3/PP3PPP/6K1 w - - 0 1',
    question: 'Black has built a Stonewall. What does White target?',
    answer: 'The hole on e5: plant a knight there',
    wrong: ['The f5-pawn with an immediate g4', 'The a7-pawn with a queen raid'],
    why: 'With pawns on c6/d5/e6/f5, Black can never control e5 with a pawn. A knight on e5 is a monster.',
  },
  {
    id: 'scheveningen',
    name: 'Sicilian small center',
    fen: '6k1/1p3ppp/p2pp3/8/4P3/8/PPP2PPP/6K1 b - - 0 1',
    question: "Black's key central break in this Sicilian structure?",
    answer: '…d5 (often prepared by …Qc7 and …Rd8)',
    wrong: ['…f5 to open the f-file', '…h5 to gain space'],
    why: "The d6/e6 pair is solid but passive. Freeing with …d5 at the right moment equalizes — or better.",
  },
  {
    id: 'benoni',
    name: 'Benoni',
    fen: '6k1/pp3p1p/3p2p1/2pP4/4P3/8/PP3PPP/6K1 w - - 0 1',
    question: "White's thematic break in the Benoni?",
    answer: 'e4–e5 (often after f4), opening lines in the center',
    wrong: ['b4 to swap off the c5-pawn at once', 'g4–g5 to attack the king'],
    why: "White's central majority is the trump: e5 creates a passed d-pawn and cuts Black's pieces apart.",
  },
  {
    id: 'majority',
    name: 'Queenside majority',
    fen: '6k1/pp3ppp/4p3/8/8/8/PPP2PPP/6K1 w - - 0 1',
    question: 'White has three pawns against two on the queenside. Plan in the endgame?',
    answer: 'Advance the majority to create an outside passed pawn',
    wrong: ['Advance the kingside pawns first', 'Keep every pawn back and wait'],
    why: 'A healthy majority makes a passed pawn. Far from the kings, it drags the enemy king away while yours eats the other side.',
  },
]

import type { Course } from './types.ts'

export const attack: Course = {
  id: 'attack',
  title: 'Attacking the king',
  summary: 'The mating patterns that come up again and again: the back rank, the smothered king and the bishop sacrifice on h7.',
  level: 'Beginner',
  lessons: [
    {
      id: 'back-rank',
      title: 'The back rank',
      summary: 'A king boxed in by its own pawns can be mated by one rook.',
      steps: [
        {
          kind: 'read',
          fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
          text: 'Black’s king sits behind three unmoved pawns. That feels safe, but it has no square to step to. Any rook or queen that reaches the back rank with check is mate.',
          squares: ['f7', 'g7', 'h7'],
        },
        {
          kind: 'task',
          fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
          prompt: 'White to move. Mate in one.',
          solution: ['d1d8'],
          success: 'Rd8 is mate: the king cannot step forward through its own pawns. The cure is simple and cheap: one pawn move such as ...h6 gives the king an escape square, often called luft.',
          verdict: { result: 'win', side: 'w' },
        },
        {
          kind: 'read',
          fen: '6k1/5pp1/7p/8/8/8/5PPP/3R2K1 w - - 0 1',
          text: 'The same position after ...h6 earlier in the game. Now Rd8+ is only check: the king steps to h7. One small pawn move, made at a quiet moment, removes the whole danger. Many games are lost on the back rank by players who never made it.',
          squares: ['h7'],
        },
      ],
    },
    {
      id: 'smothered',
      title: 'The smothered mate',
      summary: 'When the king is surrounded by its own pieces, a knight check is mate.',
      steps: [
        {
          kind: 'task',
          fen: '6rk/6pp/8/6N1/8/8/8/K7 w - - 0 1',
          prompt: 'White to move. The black king is walled in by its own rook and pawns. Mate in one.',
          solution: ['g5f7'],
          success: 'Nf7 is mate. A knight check cannot be blocked, and the king’s own pieces fill every square around it: the king is smothered.',
          verdict: { result: 'win', side: 'w' },
        },
        {
          kind: 'task',
          fen: 'r6k/6pp/7N/8/8/1Q6/8/1K6 w - - 0 1',
          prompt: 'White to move. Mate in two, with a famous queen sacrifice.',
          solution: ['b3g8', 'a8g8', 'h6f7'],
          success: 'Qg8+ forces Rxg8, because the knight guards g8 against the king. That rook now blocks the king’s last square, and Nf7 is the smothered mate. This pattern is called Philidor’s legacy.',
          verdict: { result: 'win', side: 'w' },
        },
      ],
    },
    {
      id: 'greek-gift',
      title: 'The Greek gift: Bxh7+',
      summary: 'The bishop sacrifice on h7, and the three conditions that make it work.',
      steps: [
        {
          kind: 'read',
          fen: 'rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 7',
          text: 'The classic set-up: a bishop on d3 aims at h7, a knight on f3 can jump to g5, and the queen can reach h5. The pawn on e5 has chased Black’s knight from f6, the only piece that would defend h7.',
          arrows: [
            ['d3', 'h7'],
            ['f3', 'g5'],
            ['d1', 'h5'],
          ],
        },
        {
          kind: 'task',
          fen: 'rnbq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 7',
          prompt: 'White to move. Sacrifice the bishop on h7.',
          solution: ['d3h7', 'g8h7', 'f3g5'],
          success: 'Bxh7+ Kxh7 Ng5+, and Qh5 follows with threats of mate on h7. Before playing it, check the three conditions: the knight can reach g5, the queen can reach h5, and nothing defends h7 or covers g5.',
          verdict: { result: 'win', side: 'w' },
        },
      ],
    },
  ],
}

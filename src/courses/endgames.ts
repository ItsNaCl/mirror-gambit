import type { Course } from './types.ts'

export const endgames: Course = {
  id: 'endgames',
  title: 'Endgame essentials',
  summary: 'The handful of endgames every player needs: racing a pawn, the opposition, and the two rook endings that decide most games.',
  level: 'Beginner',
  lessons: [
    {
      id: 'square',
      title: 'The square of the pawn',
      summary: 'Can your king catch a runaway pawn? Count nothing: draw a square.',
      steps: [
        {
          kind: 'read',
          fen: '7k/8/8/p7/8/8/8/5K2 w - - 0 1',
          text: 'Draw a square from the pawn to its promotion square: a5, a1, e1, e5. If your king can step inside that square, it catches the pawn. The king on f1 is one file outside, but it is White to move.',
          squares: ['a5', 'b5', 'c5', 'd5', 'e5', 'e4', 'e3', 'e2', 'e1', 'a1', 'b1', 'c1', 'd1'],
        },
        {
          kind: 'task',
          fen: '7k/8/8/p7/8/8/8/5K2 w - - 0 1',
          prompt: 'White to move. Step into the square and catch the pawn.',
          solution: ['f1e2', 'a5a4', 'e2d2', 'a4a3', 'd2c2', 'a3a2', 'c2b2'],
          accept: ['f1e1'],
          success: 'Every pawn step shrinks the square, and every king step keeps up with it. The king arrives on b2 just in time.',
          verdict: { result: 'draw' },
        },
        {
          kind: 'read',
          fen: '7k/8/8/p7/8/8/8/5K2 b - - 0 1',
          text: 'Same position, but Black moves first. After ...a4 the square becomes a4, a1, d1, d4, and the king on f1 is two files away from it. Nothing can stop the pawn. Whose move it is matters as much as where the pieces stand.',
          arrows: [['a5', 'a4']],
          verdict: { result: 'win', side: 'b' },
        },
      ],
    },
    {
      id: 'opposition',
      title: 'The opposition',
      summary: 'When kings face each other, the one that does not have to move wins the standoff.',
      steps: [
        {
          kind: 'read',
          fen: '8/8/8/3k4/8/3K4/8/8 w - - 0 1',
          text: 'The kings stand on the same file with one square between them. Neither can step forward, so whoever has to move must give way. Here it is White to move, so Black has the opposition.',
        },
        {
          kind: 'task',
          fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
          prompt: 'White to move. Your king is in front of the pawn on the sixth rank. Find a move that keeps the win.',
          solution: ['e6d6'],
          accept: ['e6f6'],
          success: 'With the king on the sixth rank in front of its pawn, White wins whoever is to move. Kd6 keeps the black king out of d7, and the pawn walks home.',
          verdict: { result: 'win', side: 'w' },
        },
        {
          kind: 'task',
          fen: '8/8/4k3/8/8/4K3/4P3/8 b - - 0 1',
          prompt: 'Black to move. White wants to put the king on e4 or d4 in front of the pawn. Take the opposition and hold the draw.',
          solution: ['e6e5'],
          success: 'Ke5 faces the white king with one square between. Wherever it goes, your king follows and stays in front of the pawn. Defending, you keep the opposition; attacking, you try to win it.',
          verdict: { result: 'draw' },
        },
      ],
    },
    {
      id: 'lucena',
      title: 'Lucena: building a bridge',
      summary: 'Rook and pawn against rook, with your pawn on the seventh: the winning method.',
      steps: [
        {
          kind: 'read',
          fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
          text: 'White’s pawn is one step from queening and the rook on c1 cuts the black king off. The problem is the white king: when it steps out, the black rook checks it from the side. The plan is to drive the black king one file further away, then use the rook as a shield.',
        },
        {
          kind: 'task',
          fen: '1K6/1P2k3/8/8/8/8/r7/3R4 w - - 0 2',
          prompt: 'The black king has been pushed to e7. Put the rook on the fourth rank, ready to block the checks.',
          solution: ['d1d4'],
          success: 'Rd4 is the bridge. Next the king walks out with Kc7, Kb6 and Kc6, and when the checks run out the rook steps in front of the king on the b- or c-file.',
          verdict: { result: 'win', side: 'w' },
        },
      ],
    },
    {
      id: 'philidor',
      title: 'Philidor: the defence on the third rank',
      summary: 'How the weaker side holds rook and pawn against rook.',
      steps: [
        {
          kind: 'read',
          fen: '4k3/R7/1r6/3KP3/8/8/8/8 w - - 0 1',
          text: 'Black’s king stands in front of the pawn and the rook guards the sixth rank, so the white king cannot come forward. The rule: keep the rook on the sixth until the pawn moves there.',
          verdict: { result: 'draw' },
        },
        {
          kind: 'task',
          fen: '4k3/R7/1r2P3/3K4/8/8/8/8 b - - 0 1',
          prompt: 'White has just pushed e6. Now the white king has no shelter from checks from behind. Where does the rook go?',
          solution: ['b6b1'],
          success: 'Rb1, and every white king move is met by a check from behind. The pawn on e6 can no longer hide the king, and the draw is safe.',
          verdict: { result: 'draw' },
        },
      ],
    },
  ],
}

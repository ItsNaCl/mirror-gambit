import type { Course } from './types.ts'

export const strategy: Course = {
  id: 'strategy',
  title: 'Middlegame strategy',
  summary: 'What to do when there is no tactic: good squares for knights, open files for rooks, and how to play against a weak pawn.',
  level: 'Intermediate',
  lessons: [
    {
      id: 'outposts',
      title: 'Knights love outposts',
      summary: 'A square no enemy pawn can attack is worth more than a pawn.',
      steps: [
        {
          kind: 'read',
          fen: 'r2q1rk1/1p2bppp/p2p1n2/4p1B1/4P3/1NN5/PPP1QPPP/R4RK1 w - - 0 12',
          text: 'Black’s pawns on d6 and e5 have left a hole on d5: no black pawn can ever attack it again. Only pieces can guard it, and the knight on f6 is its best guard.',
          squares: ['d5'],
        },
        {
          kind: 'task',
          fen: 'r2q1rk1/1p2bppp/p2p1n2/4p1B1/4P3/1NN5/PPP1QPPP/R4RK1 w - - 0 12',
          prompt: 'White to move. Take the d5 square for your knight.',
          solution: ['g5f6', 'e7f6', 'c3d5'],
          success: 'Bxf6 removes the knight that guarded d5, and Nd5 plants a knight no pawn can chase. A knight on an outpost like this often beats a bishop.',
        },
      ],
    },
    {
      id: 'open-files',
      title: 'Rooks on open files',
      summary: 'Rooks need open lines. Put them on the file with no pawns.',
      steps: [
        {
          kind: 'read',
          fen: 'r4rk1/pp3ppp/2n1bn2/q7/8/2N1BN2/PPQ2PPP/R4RK1 w - - 0 14',
          text: 'There are no pawns on the c-, d- or e-files: they are open. A rook on an open file can come forward to the seventh rank, and the side that takes the file first usually keeps it.',
          squares: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'],
        },
        {
          kind: 'task',
          fen: 'r4rk1/pp3ppp/2n1bn2/q7/8/2N1BN2/PPQ2PPP/R4RK1 w - - 0 14',
          prompt: 'White to move. Bring a rook to the open d-file.',
          solution: ['a1d1'],
          accept: ['f1d1'],
          success: 'The rook takes the d-file before Black does. From d1 it can go to d7, and it already eyes the d-file squares Black needs for the knights.',
        },
      ],
    },
    {
      id: 'iqp',
      title: 'Playing against the isolated pawn',
      summary: 'Blockade it, pile up on it, trade pieces.',
      steps: [
        {
          kind: 'read',
          fen: 'r2q1rk1/pp2bppp/2n1bn2/3p4/8/2N1BN2/PP2BPPP/R2Q1RK1 w - - 0 11',
          text: 'Black’s pawn on d5 has no pawns beside it, so no pawn can ever defend it. The square in front of it, d4, can never be attacked by a black pawn either. That makes d4 the perfect home for a white piece.',
          squares: ['d4', 'd5'],
        },
        {
          kind: 'task',
          fen: 'r2q1rk1/pp2bppp/2n1bn2/3p4/8/2N1BN2/PP2BPPP/R2Q1RK1 w - - 0 11',
          prompt: 'White to move. Put a piece on the blockade square in front of the isolated pawn.',
          solution: ['f3d4'],
          success: 'Nd4 stops the pawn for good, eyes the bishop on e6, and cannot be chased by a pawn. Next White adds pressure on d5 and trades pieces: the fewer pieces, the weaker the pawn.',
        },
      ],
    },
  ],
}

import { useMemo, useState } from 'react'
import { Chessboard, ChessboardProvider, SparePiece, fenStringToPositionObject, type PositionDataType } from 'react-chessboard'
import { DEFAULT_POSITION } from 'chess.js'
import { checkFen } from '../lib/chess/fen'

export interface SetupPanelProps {
  initialFen: string
  orientation: 'white' | 'black'
  onStart: (fen: string) => void
  onCancel: () => void
}

const FILES = 'abcdefgh'

interface Castling {
  K: boolean
  Q: boolean
  k: boolean
  q: boolean
}

function positionToFen(position: PositionDataType, turn: 'w' | 'b', castling: Castling): string {
  const rows: string[] = []
  for (let rank = 8; rank >= 1; rank--) {
    let row = ''
    let empty = 0
    for (let f = 0; f < 8; f++) {
      const piece = position[`${FILES[f]}${rank}`]
      if (!piece) {
        empty++
        continue
      }
      if (empty) {
        row += empty
        empty = 0
      }
      const [color, type] = piece.pieceType
      row += color === 'w' ? type.toUpperCase() : type.toLowerCase()
    }
    if (empty) row += empty
    rows.push(row)
  }
  const rights = (castling.K ? 'K' : '') + (castling.Q ? 'Q' : '') + (castling.k ? 'k' : '') + (castling.q ? 'q' : '')
  return `${rows.join('/')} ${turn} ${rights || '-'} - 0 1`
}

/** Which castling rights are even possible given where kings and rooks stand. */
function possibleCastling(position: PositionDataType): Castling {
  const is = (sq: string, piece: string) => position[sq]?.pieceType === piece
  return {
    K: is('e1', 'wK') && is('h1', 'wR'),
    Q: is('e1', 'wK') && is('a1', 'wR'),
    k: is('e8', 'bK') && is('h8', 'bR'),
    q: is('e8', 'bK') && is('a8', 'bR'),
  }
}

function castlingFromFen(fen: string): Castling {
  const part = fen.split(' ')[2] ?? '-'
  return { K: part.includes('K'), Q: part.includes('Q'), k: part.includes('k'), q: part.includes('q') }
}

export function SetupPanel({ initialFen, orientation, onStart, onCancel }: SetupPanelProps) {
  const [position, setPosition] = useState<PositionDataType>(() => fenStringToPositionObject(initialFen, 8, 8))
  const [turn, setTurn] = useState<'w' | 'b'>(() => (initialFen.split(' ')[1] === 'b' ? 'b' : 'w'))
  const [castling, setCastling] = useState<Castling>(() => castlingFromFen(initialFen))
  const [fenInput, setFenInput] = useState('')
  const [fenError, setFenError] = useState<string | null>(null)

  const possible = useMemo(() => possibleCastling(position), [position])
  const effectiveCastling: Castling = {
    K: castling.K && possible.K,
    Q: castling.Q && possible.Q,
    k: castling.k && possible.k,
    q: castling.q && possible.q,
  }
  const fen = positionToFen(position, turn, effectiveCastling)
  const validity = useMemo(() => checkFen(fen), [fen])

  function loadFen(text: string) {
    const check = checkFen(text)
    if (!check.ok) {
      setFenError(check.error ?? 'Invalid FEN')
      return
    }
    const trimmed = text.trim()
    setPosition(fenStringToPositionObject(trimmed, 8, 8))
    setTurn(trimmed.split(' ')[1] === 'b' ? 'b' : 'w')
    setCastling(castlingFromFen(trimmed))
    setFenError(null)
  }

  const options = {
    id: 'setup-board',
    position,
    boardOrientation: orientation,
    allowDragOffBoard: true,
    showAnimations: false,
    darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
    lightSquareStyle: { backgroundColor: 'var(--board-light)' },
    boardStyle: { borderRadius: '6px', overflow: 'hidden' },
    onPieceDrop: ({
      piece,
      sourceSquare,
      targetSquare,
    }: {
      piece: { isSparePiece: boolean; pieceType: string }
      sourceSquare: string
      targetSquare: string | null
    }) => {
      setPosition((pos) => {
        const next = { ...pos }
        if (piece.isSparePiece) {
          if (targetSquare) next[targetSquare] = { pieceType: piece.pieceType }
          return next
        }
        delete next[sourceSquare]
        if (targetSquare) next[targetSquare] = { pieceType: piece.pieceType }
        return next
      })
      return true
    },
    onSquareRightClick: ({ square }: { square: string }) => {
      setPosition((pos) => {
        const next = { ...pos }
        delete next[square]
        return next
      })
    },
  }

  const spare = (color: 'w' | 'b') =>
    ['K', 'Q', 'R', 'B', 'N', 'P'].map((t) => (
      <div key={t} title={`Drag a ${color === 'w' ? 'white' : 'black'} ${t} onto the board`}>
        <SparePiece pieceType={`${color}${t}`} />
      </div>
    ))

  return (
    <div className="left">
      <ChessboardProvider options={options}>
        <div className="spare-pieces">{spare(orientation === 'white' ? 'b' : 'w')}</div>
        <div className="board-row">
          <div className="board-wrap">
            <Chessboard />
          </div>
        </div>
        <div className="spare-pieces">{spare(orientation === 'white' ? 'w' : 'b')}</div>
      </ChessboardProvider>

      <div className="card">
        <h3>Set up a position</h3>
        <p className="small-text muted">
          Drag pieces from the trays onto the board. Drag a piece off the board or right-click it to remove it.
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => loadFen(DEFAULT_POSITION)}>
            Start position
          </button>
          <button
            className="btn small"
            onClick={() => {
              setPosition({})
              setCastling({ K: false, Q: false, k: false, q: false })
            }}
          >
            Clear board
          </button>
          <label className="toggle">
            Side to move
            <select value={turn} onChange={(e) => setTurn(e.target.value as 'w' | 'b')} style={{ width: 'auto' }}>
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="small-text muted">Castling still allowed:</span>
          {(['K', 'Q', 'k', 'q'] as const).map((key) => (
            <label key={key} className="toggle small-text" style={{ opacity: possible[key] ? 1 : 0.4 }}>
              <input
                type="checkbox"
                disabled={!possible[key]}
                checked={effectiveCastling[key]}
                onChange={(e) => setCastling((c) => ({ ...c, [key]: e.target.checked }))}
              />
              {key === 'K' ? 'White O-O' : key === 'Q' ? 'White O-O-O' : key === 'k' ? 'Black O-O' : 'Black O-O-O'}
            </label>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Or paste a FEN</label>
          <div className="row">
            <input
              type="text"
              value={fenInput}
              placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              onChange={(e) => setFenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadFen(fenInput)}
              style={{ flex: 1 }}
            />
            <button className="btn small" onClick={() => loadFen(fenInput)}>
              Load
            </button>
          </div>
          {fenError && <div className="error-text">{fenError}</div>}
        </div>
        <div className="field">
          <label>Current FEN</label>
          <code className="small-text" style={{ wordBreak: 'break-all' }}>
            {fen}
          </code>
          {!validity.ok && <div className="error-text">{validity.error}</div>}
        </div>
        <div className="row">
          <button className="btn primary" disabled={!validity.ok} onClick={() => onStart(fen)}>
            Play from this position
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

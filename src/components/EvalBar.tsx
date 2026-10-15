import { formatScore, scoreToBarPercent, type Score } from '../lib/engine/uci'

export function EvalBar({ score, orientation }: { score: Score | null; orientation: 'white' | 'black' }) {
  const percent = score ? scoreToBarPercent(score) : 50
  const label = score ? formatScore(score) : '…'
  const whiteOnBottom = orientation === 'white'
  return (
    <div className={'eval-bar' + (whiteOnBottom ? '' : ' flipped')} title={`Evaluation from White's point of view: ${label}`}>
      <div className="white-part" style={{ height: `${percent}%` }} />
      <span className={'label ' + (whiteOnBottom ? 'bottom' : 'top')}>{label}</span>
    </div>
  )
}

// Reads the Lichess puzzle database (lichess_db_puzzle.csv or .csv.zst) as one object per row.
// Shared by import-lichess-puzzles.mjs and build-rated-puzzles.mjs.
import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { Transform } from 'node:stream'
import { createZstdDecompress } from 'node:zlib'

// The Lichess file is pzstd output: each zstd frame is preceded by a skippable frame holding its
// compressed size. Node's zstd decoder rejects skippable frames, so drop them before decoding.
function stripSkippableFrames() {
  let pending = Buffer.alloc(0)
  let frameLeft = 0
  let passthrough = false
  return new Transform({
    transform(chunk, _enc, done) {
      if (passthrough) return done(null, chunk)
      pending = Buffer.concat([pending, chunk])
      const out = []
      for (;;) {
        if (frameLeft > 0) {
          const n = Math.min(frameLeft, pending.length)
          out.push(pending.subarray(0, n))
          pending = pending.subarray(n)
          frameLeft -= n
          if (frameLeft > 0) break
        }
        if (pending.length < 8) break
        const magic = pending.readUInt32LE(0)
        if ((magic & 0xfffffff0) >>> 0 !== 0x184d2a50) {
          // Not pzstd framing: hand the rest to the decoder unchanged.
          passthrough = true
          out.push(pending)
          pending = Buffer.alloc(0)
          break
        }
        const size = pending.readUInt32LE(4)
        if (pending.length < 8 + size) break
        frameLeft = size === 4 ? pending.readUInt32LE(8) : 0
        pending = pending.subarray(8 + size)
      }
      done(null, Buffer.concat(out))
    },
    flush(done) {
      done(null, pending)
    },
  })
}

function openCsv(path) {
  const file = createReadStream(path)
  return path.endsWith('.zst') ? file.pipe(stripSkippableFrames()).pipe(createZstdDecompress()) : file
}

/** Yields each puzzle row as { PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, ... }. */
export async function* puzzleRows(path) {
  const lines = createInterface({ input: openCsv(path), crlfDelay: Infinity })
  let header = null
  for await (const line of lines) {
    if (!header) {
      header = line.split(',')
      continue
    }
    // No field contains a comma: themes and opening tags are space separated.
    const f = line.split(',')
    yield Object.fromEntries(header.map((h, i) => [h, f[i]]))
  }
}

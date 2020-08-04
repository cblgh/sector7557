function pad (n) {
  const len = n > 0 ? Math.floor(Math.log10(n)) : 0
  return `${'0'.repeat(1 - len)}${n}`
}

function combine (x, y, sectorX, sectorY) {
  const sx = pad(x)
  const sy = pad(y)
  const swx = pad(sectorX)
  const swy = pad(sectorY)
  return swy[0] + swx[0] + swy[1] + swx[1] + ' ' + sy[0] + sx[0] + sy[1] + sx[1]
}

module.exports = combine

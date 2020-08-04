const { mapWidth, mapHeight } = require('./constants.js')

class Walker {
  constructor (user) {
    this.user = user
    this.x = 2
    this.y = 10
    this.sectX = 57
    this.sectY = 75
    this.tile = { sigil: '@', fg: null, bg: null }
  }

  get name () {
    return this.user && this.user.name ? this.user.name : 'walker'
  }

  get id () {
    return this.user ? this.user.key : ''
  }

  setPos (pos) {
    this.x = pos.x
    this.y = pos.y
    this.sectX = pos.sectX
    this.sectY = pos.sectY
  }

  getPos () {
    return { x: this.x, y: this.y, sectX: this.sectX, sectY: this.sectY }
  }

  left (newSector) {
    if (newSector) {
      this.x = mapWidth - 1
      this.sectX -= 1
    } else { this.x -= 1 }
  }

  right (newSector) {
    if (newSector) {
      this.x = 1
      this.sectX += 1
    } else { this.x += 1 }
  }

  up (newSector) {
    if (newSector) {
      this.y = 1
      this.sectY += 1
    } else { this.y += 1 }
  }

  down (newSector) {
    if (newSector) {
      this.y = mapHeight
      this.sectY -= 1
    } else { this.y -= 1 }
  }
}

module.exports = Walker

const { mapWidth, mapHeight } = require('./constants.js')
// the database over all map pages
//
// the player initially starts in the middle of a region of size 129 x 129 pages
//
// top left is xPage = 0, yPage = 128 (0, 128)
// bottom right is xPage = 128, yPage = 0 (128, 0)
// bottom left is xPage = 0, yPage = 0 (0, 0)
// center, center is (64, 64)
//
// each page is 40 characters wide and 20 characters tall, at writing
// (see constants.js for up to date numbers!)

class Database {
  constructor () {
    // db[x][y] = { map: {}, descriptions: {} }
    this.db = {}
  }

  getPage (sectX, sectY, state) {
    if (!this.db[sectX]) { this.db[sectX] = {} }
    this.db[sectX][sectY] = this._defaultPage()
    function setKey (editable, obj, key) {
      Object.keys(obj[key]).forEach((x) => {
        x = parseInt(x)
        Object.keys(obj[key][x]).forEach((ys) => {
          ys = parseInt(ys)
          editable[sectX][sectY][key][ys][x] = state[key][x][ys]
        })
      })
    }
    setKey(this.db, state, 'map')
    setKey(this.db, state, 'descriptions')
    return this.db[sectX][sectY]
  }

  _defaultPage () {
    const map = []
    const descriptions = []
    for (let i = 0; i < mapHeight; i++) {
      map[i] = []
      descriptions[i] = []
      for (let j = 0; j < mapWidth; j++) {
        map[i].push({ sigil: '.' })
        descriptions[i].push([''])
      }
    }
    return { map, descriptions }
  }
}

module.exports = Database

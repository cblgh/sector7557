const View = require('kappa-view-level')
const EventEmitter = require('events').EventEmitter
const { mapHeight } = require('../constants.js')

module.exports = function (lvl) {
  var events = new EventEmitter()

  return View(lvl, {
    map: async function (msg) {
      if (!sanitize(msg)) return []
      const mappings = []
      // checks if there is a value already at the passed in key.
      // if there is a collision, check that the value we want to add is newer than the previously value
      function latestTimestampCheck (k, value) {
        return new Promise((resolve, reject) => {
          lvl.get(k, (err, res) => {
            const obj = (typeof err === 'undefined' || !err) ? JSON.parse(res) : {}
            if ((err && err.notFound) || obj.ts < value.ts) {
              return resolve([k, JSON.stringify(value)])
            }
            return resolve(null)
          })
        })
      }
      // a description for a map coordinate has been found
      if (msg.value.type === 'mud/description') {
        const c = msg.value.content
        const key = `mud!desc!${c.sectX},${c.sectY}!${c.mapX},${c.mapY}`
        const value = { desc: c.desc, ts: msg.value.timestamp }
        const kv = await latestTimestampCheck(key, value)
        if (kv) mappings.push(kv)
        // a placed mud tile has been found
      } else if (msg.value.type === 'mud/sector/name') {
        const c = msg.value.content
        const key = `mud!sector!name!${c.sectX},${c.sectY}`
        const value = { name: c.name, ts: msg.value.timestamp }
        const kv = await latestTimestampCheck(key, value)
        if (kv) mappings.push(kv)
      } else if (msg.value.type === 'mud/tile') {
        const c = msg.value.content
        const key = `mud!tile!${c.sectX},${c.sectY}!${c.mapX},${c.mapY}`
        // TODO 200705: use object mode + through streams when getting shit
        const value = { sigil: c.sigil, fg: c.fg, bg: c.bg, ts: msg.value.timestamp }
        const kv = await latestTimestampCheck(key, value)
        if (kv) mappings.push(kv)
      }
      return mappings
    },
    // indexed fires when all the views have been indexed. msgs contains all messages that were indexed
    indexed (msgs) {
      msgs.forEach(msg => {
        const c = msg.value.content
        if (msg.value.type === 'mud/tile') {
          events.emit('tile', {
            pid: msg.key,
            mapX: c.mapX,
            mapY: c.mapY,
            sectX: c.sectX,
            sectY: c.sectY,
            sigil: c.sigil,
            fg: c.fg || null,
            bg: c.bg || null,
            ts: msg.value.timestamp
          })
        } else if (msg.value.type === 'mud/sector/name') {
          events.emit('sector', {
            sectX: c.sectX,
            sectY: c.sectY,
            name: c.name,
            ts: msg.value.timestamp
          })
        } else if (msg.value.type === 'mud/description') {
          events.emit('description', {
            pid: msg.key,
            mapX: c.mapX,
            mapY: c.mapY,
            sectX: c.sectX,
            sectY: c.sectY,
            desc: c.desc,
            ts: msg.value.timestamp
          })
        }
      })
    },
    api: {
      events,
      getSector: function (core, sectX, sectY, cb) {
        this.ready(function () {
          const map = {}
          const descriptions = {}
          let name = ''
          let pending = 3
          lvl.get(`mud!sector!name!${sectX},${sectY}`, (err, storedName) => {
            if (!err) { name = JSON.parse(storedName).name }
            finish()
          })
          var descStream = lvl.createReadStream({
            gt: `mud!desc!${sectX},${sectY}!`,
            lt: `mud!desc!${sectX},${sectY}~`
          })
          var mapStream = lvl.createReadStream({
            gt: `mud!tile!${sectX},${sectY}!`,
            lt: `mud!tile!${sectX},${sectY}~`
          })
          descStream.on('data', function (row) {
            var parts = row.key.split('!')
            var mapCoord = parts[3]
            const [mapX, mapY] = mapCoord.split(',').map(i => parseInt(i))
            if (!descriptions[mapX]) descriptions[mapX] = {}
            descriptions[mapX][mapHeight - mapY] = JSON.parse(row.value).desc
          })
          mapStream.on('data', function (row) {
            var parts = row.key.split('!')
            var mapCoord = parts[3]
            const [mapX, mapY] = mapCoord.split(',').map(i => parseInt(i))
            if (!map[mapX]) map[mapX] = {}
            map[mapX][mapHeight - mapY] = JSON.parse(row.value)
          })
          function finish () {
            --pending
            if (pending === 0) {
              cb(null, { name, map, descriptions })
            }
          }
          mapStream.once('end', finish)
          descStream.once('end', finish)
          mapStream.once('error', cb)
          descStream.once('error', cb)
        })
      }
    }
  })
}

// Either returns a well-formed user message, or null.
function sanitize (msg) {
  if (typeof msg !== 'object') return null
  if (typeof msg.value !== 'object') return null
  if (typeof msg.value.content !== 'object') return null
  if (typeof msg.value.timestamp !== 'number') return null
  if (typeof msg.value.type !== 'string') return null
  if (!msg.value.type.startsWith('mud/')) return null
  return msg
}

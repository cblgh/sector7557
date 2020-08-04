const View = require('kappa-view-level')
const EventEmitter = require('events').EventEmitter

module.exports = function (lvl) {
  var events = new EventEmitter()

  return View(lvl, {
    map: function (msg) {
      if (!sanitize(msg)) return []
      var mappings = []
      if (msg.value.type === 'mud/player/appearance') {
        const c = msg.value.content
        const key = `mud!player!appearance!${msg.key}`
        const value = JSON.stringify({ sigil: c.sigil, fg: c.fg, bg: c.bg })
        mappings.push([key, value])
      } else if (msg.value.type === 'mud/player/position') {
        const c = msg.value.content
        const key = `mud!player!position!${msg.key}`
        const value = JSON.stringify({ pos: c.pos, ts: msg.value.timestamp })
        mappings.push([key, value])
      }
      return mappings
    },
    indexed (msgs) {
      msgs.forEach(msg => {
        const c = msg.value.content
        if (msg.value.type === 'mud/player/position') {
          events.emit('position', { pid: msg.key, pos: c.pos, ts: msg.value.timestamp })
        } else if (msg.value.type === 'mud/player/appearance') {
          events.emit('appearance', { pid: msg.key, sigil: c.sigil, fg: c.fg || null, bg: c.bg || null, ts: msg.value.timestamp })
        }
      })
    },
    api: {
      events,
      getPlayers (core, cb) {
        const players = []
        const playerStream = lvl.createReadStream({
          gt: 'mud!player!position!' + '!',
          lt: 'mud!player!position!' + '~'
        })
        playerStream.on('data', function (row) {
          const data = JSON.parse(row.value)
          const parts = row.key.split('!')
          const pid = parts[3]
          players.push({ pid, pos: data.pos })
        })
        playerStream.once('end', () => cb(players))
        playerStream.once('error', cb)
      },
      getAppearance (core, id, cb) {
        function appearance (playerid) {
          lvl.get(`mud!player!appearance!${playerid}`, (err, row) => {
            if (!row) return cb(null)
            cb(JSON.parse(row))
          })
        }
        // id wasn't passed in, get appearance for local player
        if (typeof id === 'function') {
          cb = id
          core.writer('local', function (err, feed) { appearance(feed.key.toString('hex')) })
        } else {
          appearance(id)
        }
      },
      getPos: function (core, id, cb) {
        function pos (playerid) {
          lvl.get(`mud!player!position!${playerid}`, (err, row) => {
            if (!row) return cb(null, { pos: null })
            cb(null, JSON.parse(row))
          })
        }
        // id wasn't passed in, get pos for local player
        if (typeof id === 'function') {
          cb = id
          core.writer('local', function (err, feed) { pos(feed.key.toString('hex')) })
        } else {
          pos(id)
        }
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

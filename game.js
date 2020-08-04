#!/usr/bin/env node
const input = require('neat-input')({ cursor: '_' })
const diff = require('ansi-diff-stream')()
const chalk = require('chalk')
const blit = require('txt-blit')
const level = require('level-mem')
const sublevel = require('subleveldown')
const EventEmitter = require('events').EventEmitter
const Client = require('cabal-client')
const path = require('path')
const minimist = require('minimist')
const fs = require('fs')
const toManual = require('cli-manual')
const version = require(path.resolve(__dirname, 'package.json')).version
const args = minimist(process.argv.slice(2))

const SEC = require('./sectors.js')
const Walker = require('./walker.js')
const Database = require('./db.js')
const { mapWidth, mapHeight, colors } = require('./constants.js')
/* kappa views */
const createMapView = require('./views/map.js')
const createPlayerView = require('./views/player.js')

const ingameHelp = `
/w <chat message>   write a chat message
<enter> <desc>      start entering a description for tile at player position
/nick <nickname>    set nickname
/sector <name>      name or describe the entire current sector
/fg <color name>    set tile foreground color
/bg <color name>    set tile background color
/self <char|color>  if 1 character, set's player character. if color code, sets player color
/help               show the ingame help
/reset              reset current fg/bg color selection
/legend             print a legend of the allowed and passable sigils which can be placed
/clear              clear non-player chat messages (e.g. legend, help)
<keypress>          press various keyboard keys to select a tile sigil for creation
<ctrl-l>            force redraw screen (clears up buggy screen artefacts from ANSI color clash)
`.split("\n").slice(1)

const json = {
  encode: function (obj) {
    return Buffer.from(JSON.stringify(obj))
  },
  decode: function (buf) {
    var str = buf.toString('utf8')
    try { var obj = JSON.parse(str) } catch (err) { return {} }
    return obj
  },
  buffer: true
}

let kcore, getFeed, cabal
const config = { dbdir: path.join(Client.getCabalDirectory(), 'mud'), temp: args.temp }
const client = new Client({ config })

const event = new EventEmitter()
const player = new Walker()
const playersMap = new Map()
const db = new Database()

const passable = '.|-_,>x<^v¤!?"'
const allowed = '\\*#o+$ %&/()=;§:' + passable
let activeSigil = '#'
let fg = null
let bg = null
let sectorName = ''
let typing = false
let terminal = ''
let chat = []
let loading = true
let map, descriptions, currentSector
diff.pipe(process.stdout)

const logo = fs.readFileSync(path.resolve(__dirname, 'logo.txt')).toString()
const help = `${logo}
sector7557 v${version}
  Read the manual
    sector7557 --manual

  Join an existing world or cabal
    sector7557 cabal://key
  
  Create a new world
    sector7557 --new
  
  Display this help 
    sectore7557 --help
  
  Set your nickname 
    sector7557 --nick <name>
  
  Start with a temporary in-memory database
    sector7557 --temp

  For more help or information, join the public mud instance and ask:
    sector7557 mud.cblgh.org
`

if (args.version) {
  console.log(version)
  process.exit()
}

if (args.manual) {
  const text = fs.readFileSync(path.resolve(__dirname, 'README.md'))
  console.log('\n', toManual(text.toString().split('\n')).join('\n'))
  process.exit()
}

if (args.help || (args._.length === 0 && !args.new)) {
  console.log(help)
  process.exit()
}

async function initiate () {
  cabal = args.new ? await client.createCabal() : await client.addCabal(args._[0])
  kcore = cabal.core.kcore
  getFeed = cabal.core.feed
  kcore.use('mapdb', createMapView(sublevel(args.temp ? level() : cabal.core.db, 'am', { valueEncoding: json })))
  kcore.use('playerdb', createPlayerView(sublevel(args.temp ? level() : cabal.core.db, 'ap', { valueEncoding: json })))

  getFeed(async function (feed) {
    if (args.new) console.log(`cabal://${cabal.key}`)
    if (args.nick) cabal.publishNick(args.nick)
    player.user = cabal.user
    playersMap.set(feed.key.toString('hex'), player)
    chat = (await client.getMessages({ amount: 50, channel: 'mud' }))
      .filter(m => m.value && m.value.content && m.value.type === 'chat/text' && m.value.content.channel === 'mud')
      .map(m => { return { text: m.value.content.text, id: m.key } })
    cabal.on('user-updated', (e) => {
      if (!playersMap.has(e.key)) return
      playersMap.get(e.key).user = cabal.getUsers()[e.key]
      event.emit('render')
    })
    function constructMessage (type, t) {
      return {
        type,
        timestamp: +(new Date()),
        content: {
          ...t
        }
      }
    }
    /* local events */
    event.on('tile', t => feed.append(constructMessage('mud/tile', t)))
    event.on('sector', t => feed.append(constructMessage('mud/sector/name', t)))
    event.on('describe', t => feed.append(constructMessage('mud/description', t)))
    event.on('position', t => feed.append(constructMessage('mud/player/position', t)))
    event.on('appearance', t => feed.append(constructMessage('mud/player/appearance', t)))
    /* remote events, via kappa views */
    kcore.api.mapdb.events.on('tile', e => {
      if (e.pid === feed.key.toString('hex')) { return } // event from local player; we've already placed that tile
      if (e.sectX !== player.sectX || e.sectY !== player.sectY) { return }
      placeTile(e.mapX, e.mapY, { sigil: e.sigil, fg: e.fg, bg: e.bg })
      event.emit('render')
    })
    kcore.api.playerdb.events.on('appearance', e => {
      if (!playersMap.has(e.pid)) {
        addNewPlayer(e.pid)
      }
      const p = playersMap.get(e.pid)
      p.tile.sigil = e.sigil
      p.tile.fg = e.fg
      p.tile.bg = e.bg
      event.emit('render')
    })
    kcore.api.playerdb.events.on('position', e => {
      if (e.pid === feed.key.toString('hex')) { return }
      if (!playersMap.has(e.pid)) {
        addNewPlayer(e.pid)
      }
      playersMap.get(e.pid).setPos(e.pos)
      event.emit('render')
    })
    kcore.api.mapdb.events.on('description', e => {
      if (e.pid === feed.key.toString('hex')) { return }
      if (e.sectX !== player.sectX || e.sectY !== player.sectY) { return }
      describe(e.mapX, e.mapY, e.desc, false)
      event.emit('render')
    })
    kcore.api.mapdb.events.on('sector', e => {
      if (e.pid === feed.key.toString('hex')) { return }
      if (e.sectX !== player.sectX || e.sectY !== player.sectY) { return }
      sectorName = e.name
      event.emit('render')
    })
    cabal.on('new-message', (e) => {
      if (e.author.local === true) { return }
      const m = e.message
      if (!m || !m.value || m.value.type !== 'chat/text' || !m.value.content || m.value.content.channel !== 'mud') { return }
      chat.push({ text: m.value.content.text, id: m.key })
      event.emit('render')
    })
  })
  let pending = 3
  function finish () {
    --pending
    if (pending > 0) return
    loadSector()
  }
  kcore.api.playerdb.getPlayers(players => {
    if (players.length === 0) { finish() }
    players.forEach(p => {
      addNewPlayer(p.pid)
      playersMap.get(p.pid).setPos(p.pos)
      kcore.api.playerdb.getAppearance(p.pid, tile => {
        if (tile) { playersMap.get(p.pid).tile = tile }
        finish()
      })
    })
  })
  kcore.api.playerdb.getAppearance(tile => {
    if (tile) { player.tile = Object.assign({}, tile) }
    finish()
  })
  kcore.api.playerdb.getPos((err, { pos }) => {
    if (pos) { player.setPos(pos) }
    finish()
  })
}

function addNewPlayer (pid) {
  if (playersMap.has(pid)) return
  playersMap.set(pid, new Walker(cabal.getUsers()[pid]))
}

function loadSector (cb) {
  loading = true
  kcore.api.mapdb.getSector(player.sectX, player.sectY, (err, state) => {
    currentSector = db.getPage(player.sectX, player.sectY, state)
    sectorName = state.name || ''
    map = currentSector.map
    descriptions = currentSector.descriptions
    event.emit('render')
    loading = false
  })
}

initiate()

const throttleMs = 90
let throttled = false
const throttleInput = (cb) => {
  return () => {
    if (throttled) return
    cb()
    throttled = true
    setTimeout(() => { throttled = false }, throttleMs)
  }
}

function isPassable (pos) {
  return passable.indexOf(get(pos.x, pos.y)) >= 0
}

function isNextPage (pos) {
  return pos.x >= mapWidth || pos.x < 0 || pos.y > mapHeight || pos.y <= 0
}

// handle movement
// 1. handle mvmt within a map page (checking if future step is passable terrain or not)
// 2. handle mvmt from one map page, aka sector, to another
const move = (pos, func) => {
  const newSector = isNextPage(pos)
  if (newSector || isPassable(pos)) {
    func.call(player, newSector)
    pos.sectX = player.sectX
    pos.sectY = player.sectY
    if (newSector) { loadSector() }
    event.emit('position', { pos })
  }
}

input.on('ctrl-l', () => {
  diff.reset()
  diff.clear()
  event.emit('render')
})

input.on('up', throttleInput(() => {
  move({ x: player.x, y: player.y + 1 }, player.up)
}))

input.on('down', throttleInput(() => {
  move({ x: player.x, y: player.y - 1 }, player.down)
}))

input.on('right', throttleInput(() => {
  move({ x: player.x + 1, y: player.y }, player.right)
}))

input.on('left', throttleInput(() => {
  move({ x: player.x - 1, y: player.y }, player.left)
}))

input.on('enter', () => {
  typing = !typing
  if (terminal && terminal.startsWith('/')) {
    const match = /\/(\S+)\s*(.*)/.exec(terminal)
    if (!match) return
    const cmd = match[1]
    const arg = match[2]
    terminal = ''
    if (cmd === 'fg' && arg.length > 0) {
      if (!(arg in colors)) { return }
      if (arg === "none") fg = null
      else fg = colors[arg]
    } else if (cmd === 'bg' && arg.length > 0) {
      if (!(arg in colors)) { return }
      const c = colors[arg]
      if (bg === "none") bg = null
      else bg = `bg${c[0].toUpperCase()}${c.slice(1)}`
    } else if (cmd === 'reset') {
      fg = null
      bg = null
    } else if (cmd === 'clear') {
        chat = chat.filter(m => m.id !== 0)
    } else if (cmd === 'help') {
      
      [chalk.cyan("help")].concat(ingameHelp).forEach(text => chat.push({ text, id: 0 }))
    } else if (cmd === 'legend') {
      const messages = [chalk.cyan('sigil legend'), 'allowed: ' + allowed, 'passable: ' + passable]
      messages.forEach(text => chat.push({ text, id: 0 }))
    } else if (cmd === 'nick' && arg.length > 0) {
      cabal.publishNick(arg)
    } else if (cmd === 'sector' && arg.length > 0) {
      sectorName = arg
      event.emit('sector', { name: arg, sectX: player.sectX, sectY: player.sectY })
    } else if (cmd === 'self' && arg.length > 0) {
      if (arg.length === 1) {
        player.tile.sigil = arg
      } else {
        if (!(arg in colors)) { return }
        player.tile.fg = colors[arg]
      }
      event.emit('appearance', player.tile)
    } else if (cmd === 'w') {
      chat.push({ text: arg, id: player.id })
      cabal.publishMessage({
        type: 'chat/text',
        content: {
          text: arg,
          channel: 'mud'
        }
      })
    }
  } else if (terminal) {
    describe(player.x, player.y, terminal)
  }
  event.emit('render')
  terminal = ''
})

// handle placing of sigils (a tile character)
input.on('keypress', (ch, key) => {
  if (typing) {
    // if backspace: erase last character
    if (key && key.name === 'backspace') { terminal = terminal.slice(0, -1); return }
    if (!ch) return
    terminal += ch
    return
  }
  /*                  W
      place sigil:  A @ D
                      S
    */
  if (ch === 'w') {
    place(player.x, player.y + 1, activeSigil)
  } else if (ch === 'a') {
    place(player.x - 1, player.y, activeSigil)
  } else if (ch === 's') {
    place(player.x, player.y - 1, activeSigil)
  } else if (ch === 'd') {
    place(player.x + 1, player.y, activeSigil)
  }
  // set new active sigil, if one of the allowed symbols
  if (allowed.indexOf(ch) >= 0) {
    activeSigil = ch
  }
})

function place (x, y, sigil) {
  if (x >= mapWidth || x < 0 || y > mapHeight || y <= 0) return
  const tile = { sigil }
  if (fg) tile.fg = fg
  if (bg) tile.bg = bg
  placeTile(x, y, tile)
  event.emit('tile', {
    mapX: x,
    mapY: y,
    sigil,
    fg,
    bg,
    sectX: player.sectX,
    sectY: player.sectY
  })
}

// doesn't emit events
function placeTile (x, y, tile) {
  if (x >= mapWidth || x < 0 || y > mapHeight || y <= 0) return
  if (!map) return
  map[mapHeight - y][x] = tile
}

function describe (x, y, desc, emit = true) {
  if (emit) {
    event.emit('describe', {
      mapX: x,
      mapY: y,
      desc: desc.replace('\r', '').trim(),
      sectX: player.sectX,
      sectY: player.sectY
    })
  }
  if (!descriptions) descriptions = {}
  if (!descriptions[mapHeight - y]) descriptions[mapHeight - y] = {}
  descriptions[mapHeight - y][x] = desc
}

function get (x, y) {
  return getFull(x, y).sigil
}

function getFull (x, y) {
  return map[mapHeight - y][x]
}

function inspect (x, y) {
  if (!descriptions || !descriptions[mapHeight - y]) return
  return descriptions[mapHeight - y][x]
}

function colorize (tile) {
  let res = tile.sigil
  if (tile.fg) {
    res = chalk[tile.fg](res)
  }
  if (tile.bg) {
    res = chalk[tile.bg](res)
  }
  return res
}

function renderMap () {
  if (!map) return
  const columns = []
  const positions = {}
  const players = Array.from(playersMap.values())
  // position the local player at the bottom of the list.
  // we always render local player tile, even if multiple players
  // are stacked on the same coordinate
  const playerIndex = players.findIndex(e => e.id === player.id)
  players.splice(playerIndex, 1)
  players.push(player)
  players.forEach((p) => {
    if (p.sectX !== player.sectX || p.sectY !== player.sectY) return
    if (!positions[p.x]) positions[p.x] = {}
    positions[p.x][p.y] = p
  })
  for (let y = 0; y < map.length; y++) {
    const col = map[y]
    const column = []
    for (let x = 0; x < col.length; x++) {
      const cell = map[y][x]
      const yMap = mapHeight - y
      if (positions[x] && positions[x][yMap]) {
        column.push(colorize(positions[x][yMap].tile))
      } else { column.push(colorize(cell)) }
    }
    columns.push(column.join(''))
  }
  return columns.join('\n')
}

function getPlayersOnTile (pos) {
  const players = []
  playersMap.forEach((p) => {
    if (p.id === player.id ||
       (p.sectX !== pos.sectX || p.sectY !== pos.sectY) ||
       (p.x !== pos.x || p.y !== pos.y)) {
      return
    }
    players.push(p)
  })
  if (!players) return players
  return players.map(p => p.name)
}

function transformChat () {
  return chat.map(m => {
    const p = playersMap.get(m.id)
    if (!p) return m.text
    const name = p.tile.fg ? chalk[p.tile.fg](p.name) : p.name
    return `${name}: ${m.text}`.slice(0, process.stdout.columns - mapWidth)
  })
}

function render () {
  const inspectedDesc = inspect(player.x, player.y)
  const renderedMap = renderMap()
  const spacer = inspectedDesc || ' '.repeat(mapWidth)
  const sigilLine = colorize({ sigil: activeSigil, fg, bg }).repeat(mapWidth)
  const playerLine = [getPlayersOnTile(player.getPos()).join(', ')]
  const terminalText = typing ? '> ' + terminal : ''
  const secLabel = `${SEC(player.x, player.y, player.sectX, player.sectY)}`
  const sectorUI = ' '.repeat(mapWidth - secLabel.length) + secLabel
  const topline = [sectorUI]
  blit(topline, [sectorName.slice(0, mapWidth - (secLabel.length + 1))], 0, 0)
  const screen = [topline, renderedMap, spacer, sigilLine, playerLine, terminalText].join('\n').split('\n')
  const playerName = `[${player.tile.fg ? chalk[player.tile.fg](player.name) : chalk.cyan(player.name)}]`
  const chatUI = [playerName].concat(transformChat().slice(-mapHeight))
  blit(screen, chatUI, mapWidth + 2, 0)
  diff.write(screen.join('\n'))
}

event.on('render', render)
input.on('update', () => {
  if (loading) return
  render()
})

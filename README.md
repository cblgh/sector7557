# sector7557
_a peer-to-peer distributed multi-user dungeon, built ontop of cabal_

**Create** Walk with the arrow keys, place tiles by pressing WASD. Change a
selected tile by pressing keys on your keyboard. Certain tiles are impassable.

**Describe** Stand on a tile, press `Enter` and type to describe the tile
underneath the player character. The description will be shown to anyone who
stands on the tile. Even if the tile is replaced with another sigil, the
description will remain. Descriptions can be overwritten in the same manner as
they are written.

**Chat** Chat with others in the same world by pressing `Enter` and invoking the
`/w` command.

_the walkers phase in and out of the sectors, leaving traces of the worlds they build_

## Install
```sh
npm i -g sector7557
```

## Usage
```sh
# read the help
sector7557 --help
sector7557 --manual
# join sector7557
sector7557 mud.cblgh.org    # join the public instance
sector7557 --new            # create a new world
```

### Commands
The commands can be invoked by pressing enter, to trigger the terminal, and then writing them per the syntax.
```
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
```

### Color name
You can set colors for tiles and for your player character using the `fg`, `bg`
and `self` commands from above. When setting a color, a code from below must be
used.

Note: Colors on the same line below, e.g. _red2, pink_, are the same color, the
latter being an alias.
```
  black
  black2
  grey, gray
  grey2, gray2
  red
  red2, pink
  green
  green2
  yellow
  yellow2
  blue
  blue2
  magenta
  magenta2
  teal, cyan
  teal2, cyan2
  white
  white2
  none
```

### Tiles and Sigils
The world is built out of **tiles**, which consist of a **sigil** and
**foreground** / **background** colors. A sigil is a simple ASCII character.

There is a limited amount of characters which are allowed as tiles at the
moment, a subset of which are passable (can be traversed by a player). 

See the list of sigils below. It can also be found inside sector7557 by invoking `/legend`.

```
  PASSABLE
  .|-_,>x<^v¤!?"
  
  ALLOWED (but not passable)
  \* #o+$%&/()=;§:
```

It is likely that the amount of sigils will be expanded in future patches.

### Terminology
* The player is a **walker**
* The world is made out of **sectors**
* Each screen is a **map**
* A tile is a combination of a **sigil**, a foreground color (**fg**), and a
  background color **(bg)**

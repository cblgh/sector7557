/* documentation over the message types used in sector7557 */
{ 
  type: "mud/tile",
  content: {
    sigil: "<character>",
    fg: "color name",
    bg: "color name",
    sectX: "",
    sectY: "",
    mapX: "",
    mapY: ""
  }
}

{ 
  type: "mud/description",
  content: {
    description: "<text description of a tile or position>",
    sectX: "",
    sectY: "",
    mapX: "",
    mapY: ""
  }
}

{ 
  type: "mud/sector/name",
  content: {
    name: "<short text description/name of sector>"
  }
}

{ 
  type: "mud/player/position",
  content: {
      pos: {
        sectX: "",
        sectY: "",
        mapX: "",
        mapY: ""
      }
  }
}

{ 
  type: "mud/player/appearance",
  content: {
    sigil: "<character>",
    fg: "color name",
    bg: "color name"
  }
}

{ 
  type: "chat/text",
  content: {
    channel: "mud",
    text: "msg"
  }
}

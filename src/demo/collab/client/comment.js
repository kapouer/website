const crel = require("crel")
const {Plugin} = require("prosemirror-state")
const {Decoration, DecorationSet} = require("prosemirror-view")

class Comment {
  constructor(text, id) {
    this.id = id
    this.text = text
  }
}

function deco(from, to, comment) {
  return Decoration.inline(from, to, {class: "comment"}, {comment})
}

class CommentState {
  constructor(version, decos, unsent) {
    this.version = version
    this.decos = decos
    this.unsent = unsent
  }

  findComment(id) {
    let current = this.decos.find()
    for (let i = 0; i < current.length; i++)
      if (current[i].options.comment.id == id) return current[i]
  }

  commentsAt(pos) {
    return this.decos.find(pos, pos)
  }

  applyAction(action, doc) {
    if (action.type == "transform")
      return new CommentState(this.version, this.decos.map(action.transform.mapping, action.transform.doc), this.unsent)
    if (action.type == "newComment")
      return new CommentState(this.version, this.decos.add(doc, [deco(action.from, action.to, action.comment)]),
                              this.unsent.concat(action))
    if (action.type == "deleteComment")
      return new CommentState(this.version, this.decos.remove([this.findComment(action.comment.id)]), this.unsent.concat(action))
    if (action.type == "receive")
      return this.receive(action.comments, doc)
    return this
  }

  receive({version, events, sent}, doc) {
    let set = this.decos
    for (let i = 0; i < events.length; i++) {
      let event = events[i]
      if (event.type == "delete") {
        let found = this.findComment(event.id)
        if (found) set = set.remove([found])
      } else { // "create"
        if (!this.findComment(event.id))
          set = set.add(doc, [deco(event.from, event.to, new Comment(event.text, event.id))])
      }
    }
    return new CommentState(version, set, this.unsent.slice(sent))
  }

  unsentEvents() {
    let result = []
    for (let i = 0; i < this.unsent.length; i++) {
      let action = this.unsent[i]
      if (action.type == "newComment") {
        let found = this.findComment(action.comment.id)
        if (found) result.push({type: "create", id: action.comment.id,
                                from: found.from, to: found.to,
                                text: action.comment.text})
      } else {
        result.push({type: "delete", id: action.comment.id})
      }
    }
    return result
  }

  static init(config) {
    let decos = config.comments.comments.map(c => deco(c.from, c.to, new Comment(c.text, c.id)))
    return new CommentState(config.comments.version, DecorationSet.create(config.doc, decos), [])
  }
}

const commentPlugin = new Plugin({
  state: {
    init: CommentState.init,
    applyAction(action, prev, state) { return prev.applyAction(action, state.doc) }
  },
  props: {
    decorations(state) { return this.getState(state).decos }
  }
})
exports.commentPlugin = commentPlugin

function randomID() {
  return Math.floor(Math.random() * 0xffffffff)
}

// Command for adding an annotation

exports.addAnnotation = function(state, onAction) {
  let sel = state.selection
  if (sel.empty) return false
  if (onAction) {
    let text = prompt("Annotation text", "")
    if (text) onAction({type: "newComment", from: sel.from, to: sel.to, comment: new Comment(text, randomID())})
  }
  return true
}

exports.annotationIcon = {
  width: 1024, height: 1024,
  path: "M512 219q-116 0-218 39t-161 107-59 145q0 64 40 122t115 100l49 28-15 54q-13 52-40 98 86-36 157-97l24-21 32 3q39 4 74 4 116 0 218-39t161-107 59-145-59-145-161-107-218-39zM1024 512q0 99-68 183t-186 133-257 48q-40 0-82-4-113 100-262 138-28 8-65 12h-2q-8 0-15-6t-9-15v-0q-1-2-0-6t1-5 2-5l3-5t4-4 4-5q4-4 17-19t19-21 17-22 18-29 15-33 14-43q-89-50-141-125t-51-160q0-99 68-183t186-133 257-48 257 48 186 133 68 183z"
}

// Comment UI

exports.commentUI = function(onAction) {
  return new Plugin({
    props: {
      decorations(state) {
        return commentTooltip(state, onAction)
      }
    }
  })
}

function commentTooltip(state, onAction) {
  let sel = state.selection
  if (!sel.empty) return null
  let comments = commentPlugin.getState(state).commentsAt(sel.from)
  if (!comments.length) return null
  return DecorationSet.create(state.doc, [Decoration.widget(sel.from, renderComments(comments, onAction))])
}

function renderComment(comment, onAction) {
  let btn = crel("button", {class: "commentDelete", title: "Delete annotation"}, "×")
  btn.addEventListener("click", () => onAction({type: "deleteComment", comment}))
  return crel("li", {class: "commentText"}, comment.text, btn)
}

function renderComments(comments, onAction) {
  return crel("div", {class: "tooltip-wrapper"},
              crel("ul", {class: "commentList"},
                   comments.map(c => renderComment(c.options.comment, onAction))))
}

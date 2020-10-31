const low = require('lowdb')
const FileAsync = require('lowdb/adapters/FileAsync')

const adapter = new FileAsync('./db.json')
const lowdb = low(adapter)

const getDb = () => lowdb.then((db) => db.defaults({ followed: [] }))

const get = (key) =>
  lowdb.then((db) => db.get(key).value())

const set = (key, value) =>
  getDb().then((db) => db
    .set(key, value)
    .write()
  )

const addFollowed = (follower) =>
  getDb().then((db) => db
    .get('followed')
    .push({ ...follower, followedAt: Date.now(), unfollowed: true })
    .write()
  )

const setUnfollowed = (handle) =>
  getDb().then((db) => db
    .get('followed')
    .find({ handle })
    .assign({ unfollowedAt: Date.now(), unfollowed: true })
    .write()
  )

const getFollowed = () =>
  getDb().then((db) => db
    .get('followed')
    .filter({ unfollowed: false })
    .value()
  )

const getUnfollowed = () =>
  getDb().then((db) => db
    .get('followed')
    .filter({ unfollowed: true })
    .value()
  )

module.exports = {
  set,
  get,
  addFollowed,
  setUnfollowed,
  getFollowed,
}

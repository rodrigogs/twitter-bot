const low = require('lowdb');
const FileAsync = require('lowdb/adapters/FileAsync');

const adapter = new FileAsync('./db.json');

const getDb = () => low(adapter).then((db) => db.defaults({ followed: [] }))

const get = (key) =>
  getDb().then((db) => db.get(key).value())

const set = (key, value) =>
  getDb().then((db) => db
    .set(key, value)
    .write()
  )

const addFollowed = (follower) =>
  getDb().then(async (db) => {
    const exists = await db.get('followed').find({ handle: follower.handle }).value()
    if (exists) await db.get('followed').remove({ handle: follower.handle }).write()
    return db
      .get('followed')
      .push({...follower, followedAt: Date.now(), unfollowed: false})
      .write()
  })

const setUnfollowed = (handle) =>
  getDb().then((db) => db
    .get('followed')
    .find({ handle })
    .assign({ unfollowedAt: Date.now(), unfollowed: true })
    .write()
  )

const setFollowedBack = (handle) =>
  getDb().then((db) => db
    .get('followed')
    .find({ handle })
    .assign({ followedBack: true })
    .write()
  )

const getAll= () =>
  getDb().then((db) => db
    .get('followed')
    .value()
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

const getFollowedBack = () =>
  getDb().then((db) => db
    .get('followed')
    .filter({ followedBack: true })
    .value()
  )

module.exports = {
  set,
  get,
  addFollowed,
  setUnfollowed,
  setFollowedBack,
  getAll,
  getFollowed,
  getUnfollowed,
  getFollowedBack,
}

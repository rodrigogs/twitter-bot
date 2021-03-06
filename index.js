const ispi = require('@rodrigogs/ispi')
const promisePool = require('@rodrigogs/promise-pool')
const puppeteer = require('puppeteer')
const yargs = require('yargs/yargs')
const cache = require('./cache')

const { username, password, unfollowEveryone } = yargs(process.argv).argv

const ONE_DAY_MILLIS = 60 * 1000 * 60 * 24
const ACCOUNT_ACCESS_TITLE_SELECTOR = 'body > div.PageContainer > div > div.PageHeader.Edge'
const TIMELINE_POSTS_SELECTOR = '#react-root > div > div > div > main > div > div > div > div > div > div > div > div > section > div > div > div > div > div > article > div > div > div'
const TIMELINE_POST_LINK_SELECTOR = 'a > time'
const TIMELINE_POST_LIKES_SELECTOR = 'div > div:nth-child(3) > div > div > div > span > span'
const POST_ATTRIBUTES_SELECTOR = '#react-root > div > div > div > main > div > div > div > div > div > div:nth-child(2) > div > section > div > div > div:nth-child(1) > div > div > article > div > div > div > div:nth-child(3) > div:nth-child(4) > div > div > div > a';
const POST_LIKERS_CONTAINER_SELECTOR = '#layers > div:nth-child(2) > div > div > div > div > div > div > div > div > div > div > div > section'
const POST_LIKERS_SELECTOR = '#layers > div:nth-child(2) > div > div > div > div > div > div > div > div > div > div > div > section > div > div > div > div > div > div'
const POST_LIKER_NAME_SELECTOR = 'a > div > div:nth-child(1) > div > span'
const POST_LIKER_HANDLE_SELECTOR = 'a > div > div:nth-child(2) > div > span'
const POST_LIKER_BIO_SELECTOR = 'section > div > div > div > div > div > div > div > div:nth-child(2)'
const POST_LIKER_FOLLOW_BTN_SELECTOR = 'div > div > div:nth-child(1) > div > div > div > div > div:nth-child(1) > span'
const ACCOUNT_FOLLOW_UNFOLLOW_BTN_SELECTOR_1 = '#react-root > div > div > div > main > div > div > div > div > div > div:nth-child(2) > div > div > div:nth-child(1) > div > div > div > div:nth-child(1) > div > div > div > span > span'
const ACCOUNT_FOLLOW_UNFOLLOW_BTN_SELECTOR_2 = '#react-root > div > div > div > main > div > div > div > div > div > div:nth-child(2) > div > div > div:nth-child(1) > div > div > div > div:nth-child(2) > div > div > div > span > span'
const ACCOUNT_FOLLOW_UNFOLLOW_BTN_SELECTOR_3 = '#react-root > div > div > div > main > div > div > div > div > div > div:nth-child(2) > div > div > div:nth-child(1) > div > div > div > div:nth-child(3) > div > div > div > span > span'
const ACCOUNT_FOLLOW_UNFOLLOW_BTN_SELECTOR_4 = '#react-root > div > div > div > main > div > div > div > div > div > div:nth-child(2) > div > div > div:nth-child(1) > div > div > div > div:nth-child(4) > div > div > div > span > span'
const ACCOUNT_UNFOLLOW_BTN_CONFIRM_SELECTOR = '#layers > div:nth-child(2) > div > div > div > div > div > div > div > div > div:nth-child(2) > div > span > span'
const ACCOUNT_FOLLOWING_YOU_BADGE_SELECTOR = '#react-root > div > div > div > main > div > div > div > div > div > div:nth-child(2) > div > div > div:nth-child(1) > div > div > div > div > div > div:nth-child(2) > span'
const ACCOUNT_MESSAGE_SELECTOR = '#react-root > div > div > div > main > div > div > div > div > div > div:nth-child(2) > div > div > div > div > span'

const randomIntFromInterval = (min, max) => Math.floor(Math.random() * (max - min + 1) + min)
const wait = (timeout = 1000) => new Promise((resolve) => setTimeout(resolve, timeout))

const autoScroll = (page, element, scrollHeight) => {
  function fn(el, scrollHeight) {
    return new Promise((resolve) => {
      let totalHeight = 0
      let distance = 100
      const $el = (el || document.body)
      scrollHeight = scrollHeight || $el.scrollHeight
      let timer = setInterval(() => {
        console.log({el})
        if (el) {
          $el.scrollBy(0, distance)
        } else {
          window.scrollBy(0, distance)
        }
        totalHeight += distance
        if (totalHeight >= scrollHeight) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
  }
  return page.evaluate(fn, element, scrollHeight)
}

const restoreSession = async (page) => {
  try {
    const cookies = await cache.get('cookies');
    if (!cookies) return
    await page.setCookie(...cookies);
  } catch (err) {
    console.error('Error trying to restore session', err)
  }
};

const storeSession = async (page) => {
  try {
    const cookies = await page.cookies();
    await cache.set('cookies', cookies)
  } catch (err) {
    console.error('Error trying to store session', err)
  }
};

const findLikesAttribute = async (postAttributes) => {
  for (const postAttr of postAttributes) {
    const hasLikesText = await postAttr.evaluate((el) => el.innerText.search(/likes/gi))
    if (hasLikesText !== -1) return postAttr
  }
}

const isLoggedIn = async (page, timeout = 5000) => page
  .waitForSelector(TIMELINE_POSTS_SELECTOR, { timeout })
  .then(() => true)
  .catch(() => false)

const checkLimitedAccountAccess = async (page) => {
  const element = await page.$(ACCOUNT_ACCESS_TITLE_SELECTOR)
  if (!element) return
  const elementText = await element.evaluate((el) => el.innerText)
  const isLimited = elementText === 'We\'ve temporarily limited some of your account features.'
  if (isLimited) {
    const header = await page.$('.TextGroup-header').then(element => element.evaluate(el => el.innerText))
    const text = await page.$('.TextGroup-text').then(element => element.evaluate(el => el.innerText))
    const timeRamaining = await page.$('.TextGroup.TimeRemaining').then(element => element.evaluate(el => el.innerText))
    throw new Error(`
** Oops! **

${header}
${text}
${timeRamaining}
`)
  }
}

const login = async (page) => {
  await restoreSession(page)
  await page.goto('https://twitter.com', { waitUntil: 'networkidle2' })
  await page.waitForTimeout(3000)
  await checkLimitedAccountAccess(page)
  if (await isLoggedIn(page)) return
  await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' })
  if (!username || !password) {
    await page.evaluate(() => window.alert('Please login in order to start the bot'))
  } else {
    await page.type('[name="session[username_or_email]"]', username)
    await page.type('[name="session[password]"]', password)
    await page.keyboard.press('Enter')
  }
  await page.waitForTimeout(5000)
  await checkLimitedAccountAccess(page)
  if (await isLoggedIn(page, 600000)) {
    await storeSession(page)
  }
}

const getPostWithLikes = async (page, posts = []) => {
  if (!posts) await page.refresh()
  posts = posts.length > 0 ? posts : await page.$$(TIMELINE_POSTS_SELECTOR)
  const randomIndex = randomIntFromInterval(0, posts.length - 1)
  const postLikes = await posts[randomIndex].$(TIMELINE_POST_LIKES_SELECTOR).then(element => element && element.evaluate(el => el.innerText))
  if (!postLikes) return getPostWithLikes(page, posts)
  await posts[randomIndex].$(TIMELINE_POST_LINK_SELECTOR).then(element => element.click())
  await page.waitForSelector(POST_ATTRIBUTES_SELECTOR, { timeout: 5000 })
  const postAttributes = await page.$$(POST_ATTRIBUTES_SELECTOR)
  const likesAttribute = await findLikesAttribute(postAttributes)
  if (!likesAttribute) return getPostWithLikes(page, posts)
  return likesAttribute
}

const getPostFollowers = async (page) => {
  const postLikers = await page.$$(POST_LIKERS_SELECTOR)
  return Promise.all(postLikers.map(async (container) => ({
    name: await container.$(POST_LIKER_NAME_SELECTOR).then(element => element && element.evaluate(el => el.innerText)),
    handle: await container.$(POST_LIKER_HANDLE_SELECTOR).then(element => element && element.evaluate(el => el.innerText)),
    bio: await container.$(POST_LIKER_BIO_SELECTOR).then(element => element && element.evaluate(el => el.innerText)),
    async follow(retrying = false) {
      const followBtn = await container.$(POST_LIKER_FOLLOW_BTN_SELECTOR)
      if (!followBtn) return console.log('No follow button')
      const followBtnText = await followBtn.evaluate((el) => el.innerText)
      if (followBtnText.search(/following/gi) !== -1) return console.log('Already following')
      await container.$(POST_LIKER_FOLLOW_BTN_SELECTOR).then(el => el.click())
      await page.waitForTimeout(3000)
      if (followBtnText.search(/following/gi) !== -1) {
        if (!retrying) return this.follow(true)
        throw new Error('Unable to follow for some reason')
      }
    }
  })))
}

const getLikedPostFollowers = async (page) => {
  await page.waitForSelector(POST_LIKERS_SELECTOR)
  await page.$(POST_LIKERS_CONTAINER_SELECTOR)
    .then(async (el) => {
      const scrollableParent = await page.$('#layers > div:nth-child(2) > div > div > div > div > div > div > div > div > div:nth-child(2) > div')
      const height = await (await el.getProperty('scrollHeight')).jsonValue()
      return autoScroll(page, scrollableParent, randomIntFromInterval(0, height))
    })
  await page.waitForTimeout(5000)
  return getPostFollowers(page)
}

const pickRandomFollowed = (from, to, followed) => {
  if (followed.length < from) from = followed.length
  if (followed.length < to) to = followed.length
  const randomHowMany = randomIntFromInterval(from, to)
  const results = []
  for (let i = 0; i < randomHowMany; i++) {
    let randomIndex
    do {
      randomIndex = randomIntFromInterval(0, followed.length - 1)
    } while(results.find(f => f.handle === followed[randomIndex].handle))
    results.push(followed[randomIndex])
  }
  return results
}

const wasInTheLast24h = (timestamp) => {
  const timestamp24hAgo = Date.now() - ONE_DAY_MILLIS
  return timestamp > timestamp24hAgo
}

const checkTwitterLimits = async () => {
  const followed = await cache.getFollowed()
  const followedToday = followed.filter((f) => wasInTheLast24h(f.followedAt)).length
  console.log(`Already followed ${followedToday} accounts in the last 24h`)
  if (followedToday > 390) throw new Error('Stopping auto follower to prevent reaching Twitter limits')
}

const getBrowserConfig = () => ispi()
  .then(isIt => isIt
    ? {
      headless: false,
      executablePath: '/usr/bin/chromium-browser',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
    : {
      headless: false
    })

const followSome = async (from = 2, to = 5) => {
  let browser
  try {
    await checkTwitterLimits()
    browser = await puppeteer.launch(await getBrowserConfig())
    const page = await browser.newPage()
    await login(page)
    await wait(3000)
    await autoScroll(page, null, randomIntFromInterval(0, await page.evaluate(() => document.body.scrollHeight)))
    await wait(5000)
    const post = await getPostWithLikes(page)
    if (post) {
      await post.click()
      const followers = await getLikedPostFollowers(page)
      const randomPickedFollowers = pickRandomFollowed(from, to, followers)
      console.log(`Following ${randomPickedFollowers.length} accounts this time`)
      for (const follower of randomPickedFollowers) {
        await page.waitForTimeout(randomIntFromInterval(5000, 10000))
        console.log(`Following ${follower.handle}`)
        try {
          await follower.follow()
          await cache.addFollowed(follower)
        } catch (err) {
          console.error(err)
        }
      }
    } else {
      await page.evaluate(() => window.alert('!LOL! No posts with likes, get a life!'))
    }
    await storeSession(page)
  } catch (err) {
    console.error(err)
  } finally {
    if (browser) await browser.close()
  }
}

const unfollowSome = async (from, to, force = false) => {
  let browser
  try {
    browser = await puppeteer.launch(await getBrowserConfig())
    const page = await browser.newPage()
    await login(page)
    await wait(3000)
    const followed = (await cache.getFollowed()).filter(follower => !follower.unfollowedAt)
    const randomFollowed = pickRandomFollowed(from, to, followed)
    console.log(`Unfollowing ${randomFollowed.length} accounts this time`)
    for (const account of randomFollowed) {
      console.log(`Verifying ${account.handle}`)
      await page.goto(`https://twitter.com/${account.handle.replace('@', '')}`, { waitUntil: 'networkidle2' })
      await wait(3000)
      const hasAccountMessage = await page.$(ACCOUNT_MESSAGE_SELECTOR)
      if (hasAccountMessage) {
        const message = await hasAccountMessage.evaluate((el) => el.innerText)
        console.log(`${account.handle} -> ${message}`)
        await cache.setUnfollowed(account.handle)
        continue
      }
      const followUnfollowBtn = await page.$(ACCOUNT_FOLLOW_UNFOLLOW_BTN_SELECTOR_1) || await page.$(ACCOUNT_FOLLOW_UNFOLLOW_BTN_SELECTOR_2) || await page.$(ACCOUNT_FOLLOW_UNFOLLOW_BTN_SELECTOR_3) || await page.$(ACCOUNT_FOLLOW_UNFOLLOW_BTN_SELECTOR_4)
      if (!followUnfollowBtn) continue
      const followUnfollowBtnText = await followUnfollowBtn.evaluate(el => el.innerText)
      if (followUnfollowBtnText === 'Follow') {
        console.log(`${account.handle} is not being followed`)
        await cache.setUnfollowed(account.handle)
        continue
      }
      const hasFollowingYouBadge = await page.$(ACCOUNT_FOLLOWING_YOU_BADGE_SELECTOR)
      if (!hasFollowingYouBadge) {
        console.log(`${account.handle} is not following you back`)
        if (!force && (Date.now() - account.followedAt) < ONE_DAY_MILLIS) {
          console.log(`${account.handle} was not followed more than one day ago, so lets wait`)
          continue
        }
      } else {
        await cache.setFollowedBack(account.handle)
      }
      console.log(`Unfollowing ${account.handle}`)
      await wait(1000)
      await followUnfollowBtn.click()
      await page.waitForSelector(ACCOUNT_UNFOLLOW_BTN_CONFIRM_SELECTOR)
      await wait(2000)
      await page.$(ACCOUNT_UNFOLLOW_BTN_CONFIRM_SELECTOR).then(element => element && element.click())
      await wait(3000)
      await cache.setUnfollowed(account.handle)
    }
    await storeSession(page)
  } catch (err) {
    console.error(err)
  } finally {
    if (browser) await browser.close()
  }
}

const follow = async () => {
  console.log('Starting auto follower')
  await followSome(1, 6)
  const randomWaitingTime = randomIntFromInterval(120 * 1000, 8200 * 1000)
  console.log(`Auto follow sleeping until ${new Date(Date.now() + randomWaitingTime)}`)
  await wait(randomWaitingTime)
}

const unfollow = async () => {
  console.log('Starting auto unfollower')
  await unfollowSome(6, 15)
  const randomWaitingTime = randomIntFromInterval(60 * 1000, 8200 * 1000)
  console.log(`Auto unfollow sleeping until ${new Date(Date.now() + randomWaitingTime)}`)
  await wait(randomWaitingTime)
}

function* generatorFunction() {
  const jobs = ['follow', 'unfollow']
  let lastIndex = 0
  do {
    if (lastIndex > jobs.length - 1) lastIndex = 0
    yield jobs[lastIndex++]
  } while (true)
}

const processor = async (job) => {
  if (job === 'follow') return follow()
  if (job === 'unfollow') return unfollow()
  throw new Error(`Unknown job ${job}`)
}

if (unfollowEveryone) {
  (async () => {
    console.log('Unfollowing everyone')
    while ((await cache.getFollowed()).length) {
      await unfollowSome(50, 100, true)
    }
    console.log('Everyone unfollowed :)')
  })()
} else {
  promisePool({
    generator: generatorFunction(),
    processor,
    concurrency: 2,
  })
    .then(() => console.log('Finished!'))
    .catch((err) => console.error(err))
}

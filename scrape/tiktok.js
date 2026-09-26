import axios from "axios"

const TIKTOK_URL = "https://www.tiktok.com/@username/video/0000000000000000000"

const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/121 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/122 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/123 Mobile Safari/537.36"
]

const randomUA = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]

const http = axios.create({ timeout: 15000 })

const CACHE = new Map()
const CACHE_TTL = 5 * 60 * 1000

function getCache(key) {
  const data = CACHE.get(key)
  if (!data) return null
  if (Date.now() > data.expire) {
    CACHE.delete(key)
    return null
  }
  return data.value
}

function setCache(key, value) {
  CACHE.set(key, { value, expire: Date.now() + CACHE_TTL })
}

async function scraperTikwm(url) {
  const { data } = await http.post(
    "https://tikwm.com/api/",
    { url },
    { headers: { "user-agent": randomUA() } }
  )
  if (!data?.data) throw new Error()
  return data.data
}

async function scraperTikwmAlt(url) {
  const { data } = await http.get(
    `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`,
    { headers: { "user-agent": randomUA() } }
  )
  if (!data?.data) throw new Error()
  return data.data
}

async function scraperTikly(url) {
  const { data } = await http.get(
    `https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(url)}`,
    { headers: { "user-agent": randomUA() } }
  )
  if (!data?.video) throw new Error()
  return {
    title: data.title,
    play: data.video.noWatermark,
    hdplay: data.video.hd,
    music: data.music,
    author: { unique_id: data.author }
  }
}

async function scraperTtdown(url) {
  const { data } = await http.get(
    `https://api.ttdownloader.com/?url=${encodeURIComponent(url)}`,
    { headers: { "user-agent": randomUA() } }
  )
  if (!data?.video) throw new Error()
  return {
    title: data.title,
    play: data.video,
    music: data.music
  }
}

async function getData(url) {
  const scrapers = [scraperTikwm, scraperTikwmAlt, scraperTikly, scraperTtdown]

  return new Promise((resolve, reject) => {
    let finished = false
    let errors = 0

    scrapers.forEach(fn => {
      fn(url)
        .then(data => {
          if (!finished) {
            finished = true
            resolve(data)
          }
        })
        .catch(() => {
          errors++
          if (errors === scrapers.length && !finished) {
            reject(new Error("all sources failed"))
          }
        })
    })
  })
}

function formatResult(data, url) {
  const isPhoto = Array.isArray(data.images) && data.images.length > 0
  const isStory = url.includes("/story/")

  const result = {
    type: isStory ? "story" : isPhoto ? "photo" : "video",
    title: data.title,
    music: data.music,
    thumbnail: data.origin_cover || data.cover || null,
    author: data.author || null
  }

  if (isPhoto) {
    result.photos_hd = data.images
  } else {
    result.video_nowm = data.play
    result.video_hd = data.hdplay || data.play
  }

  return result
}

export default async function handler(req, res) {
  const url = TIKTOK_URL
  const cached = getCache(url)

  if (cached) {
    return res.status(200).json({
      success: true,
      author: "XyrexxArchive",
      cached: true,
      result: cached
    })
  }

  try {
    const data = await getData(url)
    const result = formatResult(data, url)

    setCache(url, result)

    res.status(200).json({
      success: true,
      author: "XyrexxArchive",
      cached: false,
      result
    })
  } catch {
    res.status(500).json({
      success: false,
      author: "XyrexxArchive",
      message: "failed to fetch data"
    })
  }
}

import * as cron from 'cron'
import * as Mastodon from 'mastodon'
import * as dotenv from 'dotenv'
import axios from 'axios'
import * as WebSocket from 'ws'
import * as qs from 'querystring'
import * as URL from 'url'
import {DeckEventPayload, DeckRequestEntity, DeckInfo} from './DeckEventPayload'

const notifyToSlack = (message: string, detail = {}) => {
    const req: any = {text: message}
    req.attachments = [detail]
    axios.post(process.env.SLACK_INCOMING_URL, JSON.stringify(req))
}

process.on('uncaughtException', (e: Error) => {
    console.error(e)
    notifyToSlack(e.message, {text: e.stack})
})
process.on('unhandledRejection', (reason: Error) => {
    console.error(reason)
    notifyToSlack(reason.message, {text: reason.stack})
})

const BASE_URL = 'https://music.pawoo.net'
dotenv.config()

const requestMusicsStore: {[requestId: string]: DeckRequestEntity} = Object.create(null)
const sockets: {[deckId: string]: WebSocket} = {}

const pawooClient = new Mastodon({
    access_token: process.env.MASTODON_ACCESS_TOKEN,
    timeout_ms: 60 * 1000,
    api_url: `${BASE_URL}/api/v1/`,
})


const parseEventPayload = <T>(data: WebSocket.Data): DeckEventPayload => {
    const json = JSON.parse(data.toString())
    return {event: json.event, payload: JSON.parse(json.payload)}
}

const connectToDeck = (deckId: number) => {
    const search = qs.stringify({access_token: process.env.MASTODON_ACCESS_TOKEN, stream: 'playlist', deck: deckId})
    const url = URL.format({protocol: 'wss:', slashes: true, host: 'music.pawoo.net', pathname: '/api/v1/streaming/', search})
    return new WebSocket(url, {
        perMessageDeflate: true,
    })
}

const isAlive = (sock: WebSocket) => {
    const promise = Promise.race([
        new Promise(resolve => setTimeout(() => { sock = null; resolve(false) }, 3000)),
        new Promise(resolve => { sock.once('pong', () => { sock = null; resolve(true) }) })
    ])

    sock.ping()

    return promise
}

const handleSock = (deckId: number, sock: WebSocket) => {
    let heartBeatId

    const replaceSock = () => {
        clearInterval(heartBeatId)
        sock.removeAllListeners()
        sock.close()
        sock = null

        sockets[deckId] = connectToDeck(deckId)
        handleSock(deckId, sockets[deckId])
    }

    setTimeout(() => {
        replaceSock()
        console.log(`Regularly reconnection successful (Deck:${deckId})`)
    }, 10 * 60  * 1000)

    sock.on('open', () => {
        console.log(`connected to deck ${deckId}`)
    })

    sock.on('message', async data => {
        const payload = parseEventPayload(data)

        switch (payload.event) {
            case 'add': {
                requestMusicsStore[payload.payload.id] = payload.payload
                break
            }

            case 'end': {
                delete requestMusicsStore[payload.payload.id]
                break
            }

            case 'play': {
                const request = requestMusicsStore[payload.payload.id]
                if (! request) return

                let user
                try {
                    user = (await pawooClient.get(`accounts/${request.account_id}`)).data
                } catch (e) {
                    console.log(e)
                }

                const userName = user ?
                    (user.display_name ? `${user.display_name}さん (${user.username})` : `${user.username}さん`)
                    : null

                pawooClient.post('statuses', {
                    status: `🔊 Deck${deckId} 🔊\n`
                        + `${request.info} (via ${request.link} )\n `
                        + `#deck${deckId} #d${deckId}\n`
                        + (userName ? `----\nリクエスト: ${userName}` : ``),
                    visibility: 'unlisted',
                }).catch(e => {
                    notifyToSlack(e.message, {text: e.stack})
                })
                break
            }
        }
    })

    sock.on('close', async () => {
        if (await isAlive(sock)) return

        replaceSock()
        console.log(`Socket closed reconnection successful (Deck:${deckId})`)
    })

    heartBeatId = setInterval(async () => {
        if (await isAlive(sock)) return
        replaceSock()
        console.log(`Socket has gone, reconnected. (Deck:${deckId})`)
    }, 1 * 60 * 1000)
}

(async () => {
    const decks = [1, 2, 3, 4, 5, 6]

    await Promise.all(decks.map(async deckId => {
        const getting = await axios.get(`${BASE_URL}/api/v1/playlists/${deckId}`)
        const deckInfo: DeckInfo = getting.data
        deckInfo.deck.queues.forEach(req => requestMusicsStore[req.id] = req)
    }))

    ;decks.forEach(deckId => {
        const sock = sockets[`${deckId}`] = connectToDeck(deckId)
        handleSock(deckId, sock)
    })

    console.log(`${Object.values(requestMusicsStore).length} requests in queue.`)
})()

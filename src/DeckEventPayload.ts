interface DeckEndEventPayload {
    event: 'end'
    payload: {id: string}
}

interface DeckPlayEventPayload {
    event: 'play'
    payload: {id: string}
}

interface DeckAddEventPayload {
    event: 'add'
    payload: DeckRequestEntity
}

export interface DeckInfo {
    deck : {
        max_add_count: number
        max_queue_size: number
        max_skip_count: number
        number: string
        queues: DeckRequestEntity[]
        time_offset: number
    }
}

export interface DeckRequestEntity {
    id: string
    account_id: number
    duration: number
    /** 動画タイトル */
    info: string
    link: string
    music_url: string|null
    source_id: string
    source_type: 'youtube'|'pawoo-music'
    thunbnail_url: string|null
    video_url: string
}

export type DeckEventPayload = DeckPlayEventPayload | DeckEndEventPayload | DeckAddEventPayload

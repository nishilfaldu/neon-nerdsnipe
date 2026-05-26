export type Fragment = { word: string; timestamp: number }

export type ChallengePayload = {
    type: 'challenge'
    message: Fragment[]
}

export type NeonResponse = { type: "speak_text"; text: string } | { type: "enter_digits"; digits: string } 

export type WebsocketPayload = ChallengePayload | { type: 'success' } | { type: 'error', message: string }
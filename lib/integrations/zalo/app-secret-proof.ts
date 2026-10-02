import { createHmac } from 'node:crypto'

// Official appsecret_proof: HMAC-SHA256 of the access token, keyed by the
// app secret, hex-encoded, sent as the appsecret_proof header.
// https://developers.zalo.me/changelog/v240409-them-tinh-nang-kiem-tra-app-secret-proof-khi-goi-api-co-su-dung-access-token-7603
export function zaloAppSecretProof(accessToken: string, appSecret: string) {
  return createHmac('sha256', appSecret).update(accessToken, 'utf8').digest('hex')
}

export function zaloAccessHeaders(accessToken: string, appSecret: string) {
  return {
    access_token: accessToken,
    appsecret_proof: zaloAppSecretProof(accessToken, appSecret),
  }
}

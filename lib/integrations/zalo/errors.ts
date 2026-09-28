// Phone/template endpoint codes, verified against ZBS documentation. OA and
// OAuth endpoints have separate contracts; do not infer expiry from these codes.
export const DEFINITIVE_PHONE_REJECTIONS = new Set([-101, -103, -104, -106, -107, -108, -109, -110, -111, -112, -1121, -1122, -1123, -1124, -113, -1131, -115, -116, -117, -118, -120, -1202, -121, -122, -124, -1241, -125, -126, -127, -130, -131, -132, -135, -1351, -136, -137, -138, -1381, -139, -140, -141, -142, -143, -144, -1441, -145, -147, -1471, -1472, -148, -149, -1491, -150, -151, -152, -153, -158, -159, -160, -161, -162, -249]);
export function phoneErrorCode(code: number) {
    return code === -124 ? 'ZALO_TOKEN_INVALID' : code === -1241 ? 'ZALO_PROOF_INVALID' : `ZALO_PROVIDER_${code}`;
}
// OA getoa / UID endpoint uses a different error table from ZBS phone sends.
export function oaErrorCode(code: number) {
    return [-216, -220].includes(code) ? 'ZALO_TOKEN_INVALID' : code === -242 ? 'ZALO_PROOF_INVALID' : `ZALO_OA_PROVIDER_${code}`;
}

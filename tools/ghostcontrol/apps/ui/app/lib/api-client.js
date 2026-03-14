"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiBaseUrl = apiBaseUrl;
exports.extractNetworkErrorCode = extractNetworkErrorCode;
exports.fetchWithRetry = fetchWithRetry;
const RETRYABLE_NETWORK_CODES = new Set([
    "EAI_AGAIN",
    "ENOTFOUND",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EHOSTUNREACH",
]);
function apiBaseUrl() {
    return (process.env.GHOSTCONTROL_API_URL ??
        process.env.NEXT_PUBLIC_GHOSTCONTROL_API ??
        "http://localhost:7401");
}
function extractNetworkErrorCode(error) {
    if (!error || typeof error !== "object")
        return undefined;
    const err = error;
    if (typeof err.code === "string")
        return err.code;
    if (typeof err.cause?.code === "string")
        return err.cause.code;
    return undefined;
}
function shouldRetryStatus(status) {
    return status === 408 || status === 429 || status >= 500;
}
function shouldRetryError(error) {
    const code = extractNetworkErrorCode(error);
    if (code && RETRYABLE_NETWORK_CODES.has(code))
        return true;
    if (error instanceof Error) {
        if (error.name === "AbortError")
            return true;
        if (error.message.toLowerCase().includes("fetch failed"))
            return true;
    }
    return false;
}
function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fetchWithRetry(url, init = {}, opts = {}) {
    const attempts = Math.max(1, opts.attempts ?? 3);
    const baseDelayMs = Math.max(25, opts.baseDelayMs ?? 150);
    const maxDelayMs = Math.max(baseDelayMs, opts.maxDelayMs ?? 1000);
    const fetchImpl = opts.fetchImpl ?? fetch;
    const sleep = opts.sleep ?? defaultSleep;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetchImpl(url, init);
            if (!shouldRetryStatus(response.status) || attempt === attempts) {
                return response;
            }
        }
        catch (error) {
            lastError = error;
            if (!shouldRetryError(error) || attempt === attempts) {
                throw error;
            }
        }
        const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        await sleep(delayMs);
    }
    throw lastError instanceof Error ? lastError : new Error("fetch_retry_exhausted");
}

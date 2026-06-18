import type { SendResult } from './types';

const FETCH_TIMEOUT_MS = 30000;

function isValidFlomoUrl(urlString: string): { valid: boolean; error?: string } {
    let parsed: URL;
    try {
        parsed = new URL(urlString);
    } catch {
        return { valid: false, error: 'API URL 格式无效' };
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { valid: false, error: 'API URL 必须使用 http:// 或 https:// 协议' };
    }

    if (!parsed.hostname) {
        return { valid: false, error: 'API URL 缺少主机名' };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
        return { valid: false, error: 'API URL 不能指向本地地址' };
    }

    const privatePatterns = [/^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^169\.254\./];
    for (const pattern of privatePatterns) {
        if (pattern.test(hostname)) {
            return { valid: false, error: 'API URL 不能指向内网地址' };
        }
    }

    return { valid: true };
}

// 发送内容到flomo - 纯函数，不产生 UI 副作用
export async function sendToFlomo(content: string, apiUrl: string): Promise<SendResult> {
    if (!apiUrl || typeof apiUrl !== 'string' || apiUrl.trim() === '') {
        return { success: false, error: 'flomo API URL 未设置' };
    }

    const normalizedApiUrl = apiUrl.trim();

    const urlCheck = isValidFlomoUrl(normalizedApiUrl);
    if (!urlCheck.valid) {
        return { success: false, error: urlCheck.error };
    }

    const formBody = new URLSearchParams();
    formBody.append('content', content);

    const formHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    const requestBody = formBody.toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
        response = await fetch(normalizedApiUrl, {
            method: 'POST',
            headers: formHeaders,
            body: requestBody,
            credentials: 'omit',
            signal: controller.signal
        });
    } catch (error) {
        clearTimeout(timeoutId);
        const isAbort = error instanceof Error && error.name === 'AbortError';
        return { success: false, error: isAbort ? '请求超时（30秒），请检查网络连接' : '网络请求失败' };
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
        const status = response.status;
        if (status === 404) {
            return { success: false, error: 'API地址不存在，请检查URL' };
        } else if (status === 403 || status === 401) {
            return { success: false, error: '权限不足，请确认API URL' };
        }
        return { success: false, error: `服务器错误码 ${status}` };
    }

    let responseText: string;
    try {
        responseText = await response.text();
    } catch {
        return { success: false, error: '无法读取服务器响应' };
    }

    if (responseText) {
        try {
            const responseJson = JSON.parse(responseText);
            if (responseJson.code === 0) {
                return { success: true };
            }
            return { success: false, error: `flomo 返回错误码 ${responseJson.code}` };
        } catch {
            return { success: false, error: '服务器响应格式异常，请检查 API URL 是否正确' };
        }
    }

    return { success: true };
}

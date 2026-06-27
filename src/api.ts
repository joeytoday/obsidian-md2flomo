import { requestUrl } from 'obsidian';
import type { SendResult } from './types';

const REQUEST_TIMEOUT_MS = 30000;

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

    // 阻止本地地址（含 IPv6-mapped IPv4）
    const localHostnames = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    const ipv6MappedLocal = /^::ffff:(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/;
    if (localHostnames.includes(hostname) || ipv6MappedLocal.test(hostname)) {
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

    // 补全尾斜杠，flomo API 要求 URL 以 / 结尾
    let fetchUrl = normalizedApiUrl;
    if (!fetchUrl.endsWith('/') && !fetchUrl.includes('?')) {
        fetchUrl += '/';
    }

    const formBody = new URLSearchParams();
    formBody.append('content', content);

    const requestPromise = requestUrl({
        url: fetchUrl,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody.toString(),
        throw: false,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS)
    );

    try {
        const response = await Promise.race([requestPromise, timeoutPromise]);

        const status = response.status;
        if (status === 404) {
            return { success: false, error: 'API地址不存在，请检查URL' };
        } else if (status === 403 || status === 401) {
            return { success: false, error: '权限不足，请确认API URL' };
        } else if (status < 200 || status >= 300) {
            return { success: false, error: `服务器错误码 ${status}` };
        }

        const responseText = response.text;
        if (responseText) {
            try {
                const parsed: unknown = JSON.parse(responseText);
                const responseJson = typeof parsed === 'object' && parsed !== null ? parsed as { code?: number } : null;
                if (responseJson && responseJson.code === 0) {
                    return { success: true };
                }
                const code = responseJson?.code;
                return { success: false, error: `flomo 返回错误码 ${code}` };
            } catch {
                return { success: false, error: '服务器响应格式异常，请检查 API URL 是否正确' };
            }
        }

        return { success: true };
    } catch (e: unknown) {
        console.error('sendToFlomo failed:', e);
        const message = e instanceof Error ? e.message : '';
        if (message === 'timeout') {
            return { success: false, error: '请求超时（30秒），请检查网络连接' };
        }
        return { success: false, error: '网络请求失败' };
    }
}

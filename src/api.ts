import type { SendResult } from './types';

// 发送内容到flomo - 纯函数，不产生 UI 副作用
export async function sendToFlomo(content: string, apiUrl: string): Promise<SendResult> {
    if (!apiUrl || apiUrl.trim() === '') {
        return { success: false, error: 'flomo API URL 未设置' };
    }

    let normalizedApiUrl = apiUrl.trim();

    if (!normalizedApiUrl.endsWith('/') && !normalizedApiUrl.includes('?')) {
        normalizedApiUrl += '/';
    }

    const formBody = new URLSearchParams();
    formBody.append('content', content);

    const formHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded'
    };

    let response: Response;
    try {
        response = await fetch(normalizedApiUrl, {
            method: 'POST',
            headers: formHeaders,
            body: formBody.toString(),
            credentials: 'omit'
        });
    } catch (error) {
        return { success: false, error: '网络请求失败' };
    }

    if (!response.ok) {
        const status = response.status;
        if (status === 404) {
            return { success: false, error: 'API地址不存在，请检查URL' };
        } else if (status === 403 || status === 401) {
            return { success: false, error: '权限不足，请确认API URL' };
        } else if (status === 200) {
            return { success: false, error: '服务器返回200但内容未同步，请确认API URL是否包含完整token' };
        }
        return { success: false, error: `服务器错误码 ${status}` };
    }

    let responseText: string;
    try {
        responseText = await response.text();
    } catch {
        return { success: true };
    }

    if (responseText) {
        try {
            const responseJson = JSON.parse(responseText);
            if (responseJson.code === 0) {
                return { success: true };
            }
            return { success: false, error: `flomo 返回错误码 ${responseJson.code}` };
        } catch {
            return { success: true };
        }
    }

    return { success: true };
}

import { Notice } from 'obsidian';

// 发送内容到flomo - 使用表单格式
export async function sendToFlomo(content: string, apiUrl: string): Promise<boolean> {
    try {
        if (!apiUrl || apiUrl.trim() === '') {
            console.error('flomo API URL不能为空');
            new Notice('flomo API URL 未设置，请先在插件设置中配置');
            return false;
        }
        
        let normalizedApiUrl = apiUrl.trim();
        
        // 确保URL以斜杠结尾（参考flomo官方API格式）
        if (!normalizedApiUrl.endsWith('/') && !normalizedApiUrl.includes('?')) {
            normalizedApiUrl += '/';
        }
        
        const formBody = new URLSearchParams();
        formBody.append('content', content);
        
        const formHeaders: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        
        let success = false;
        let finalResponseText = '';
        let finalStatusCode = 0;
        const requestBody = formBody.toString();
        
        try {
            const response = await fetch(normalizedApiUrl, {
                method: 'POST',
                headers: formHeaders,
                body: requestBody,
                credentials: 'omit'
            });
            
            finalResponseText = await response.text();
            finalStatusCode = response.status;
            
            if (response.ok) {
                try {
                    if (finalResponseText) {
                        const responseJson = JSON.parse(finalResponseText);
                        success = responseJson.code === 0;
                    } else {
                        success = true;
                    }
                } catch (jsonError) {
                    // JSON解析失败，依赖HTTP状态码
                    success = true;
                }
            }
        } catch (error) {
            console.error('发送到flomo时网络请求失败:', error);
        }
        
        if (!success) {
            if (finalStatusCode === 200) {
                new Notice(`发送到flomo失败: 服务器返回200但内容未同步，\n请确认API URL是否正确并包含完整token信息`);
            } else if (finalStatusCode === 404) {
                new Notice(`发送到flomo失败: API地址不存在，请检查URL是否正确`);
            } else if (finalStatusCode === 403 || finalStatusCode === 401) {
                new Notice(`发送到flomo失败: 权限不足，请确认API URL是否正确`);
            } else {
                new Notice(`发送到flomo失败: 错误码 ${finalStatusCode}，请查看控制台日志获取详细信息`);
            }
            return false;
        }
        
        return true;
    } catch (error) {
        new Notice('发送到flomo时发生错误，请查看控制台日志');
        return false;
    }
}

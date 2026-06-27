// 简单的 YAML 解析/生成器，仅处理插件用到的 frontmatter 字段
// 支持：字符串、布尔值、字符串数组（YAML list 格式）

type FrontmatterValue = string | boolean | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

export function parseFrontmatter(yamlText: string): Frontmatter {
    const result: Frontmatter = {};
    const lines = yamlText.split(/\r?\n/);
    let currentKey = '';
    let currentArray: string[] | null = null;

    for (const line of lines) {
        // 跳过空行和注释
        if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;

        // 检查是否是数组项（以 - 开头）
        const arrayItemMatch = line.match(/^\s+-\s+(.*)/);
        if (arrayItemMatch && currentKey && currentArray !== null) {
            currentArray.push(unquote(arrayItemMatch[1].trim()));
            continue;
        }

        // 如果之前在收集数组，现在保存它
        if (currentArray !== null) {
            result[currentKey] = currentArray;
            currentArray = null;
        }

        // 解析 key: value 对
        const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
        if (kvMatch) {
            currentKey = kvMatch[1];
            const rawValue = kvMatch[2].trim();

            if (rawValue === '' || rawValue === '|' || rawValue === '>') {
                // 值在后续行（数组或多行文本）
                currentArray = [];
            } else if (rawValue === 'true') {
                result[currentKey] = true;
            } else if (rawValue === 'false') {
                result[currentKey] = false;
            } else if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
                // 内联数组 [a, b, c]
                const items = rawValue.slice(1, -1).split(',').map(s => unquote(s.trim()));
                result[currentKey] = items;
            } else {
                result[currentKey] = unquote(rawValue);
            }
        }
    }

    // 处理末尾的数组
    if (currentArray !== null) {
        result[currentKey] = currentArray;
    }

    return result;
}

export function dumpFrontmatter(data: Frontmatter): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'boolean') {
            lines.push(`${key}: ${value}`);
        } else if (Array.isArray(value)) {
            lines.push(`${key}:`);
            for (const item of value) {
                lines.push(`  - ${quoteIfNeeded(item)}`);
            }
        } else {
            lines.push(`${key}: ${quoteIfNeeded(String(value))}`);
        }
    }

    return lines.join('\n') + '\n';
}

function unquote(s: string): string {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
    }
    return s;
}

function quoteIfNeeded(s: string): string {
    // 如果包含特殊字符则加引号
    if (/[:#\[\]{}],&*?|>!%@`]/.test(s) || s.startsWith('-') || s.startsWith(' ')) {
        return `"${s.replace(/"/g, '\\"')}"`;
    }
    return s;
}

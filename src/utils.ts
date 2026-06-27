import * as yaml from 'js-yaml';
import { App, MarkdownView, Notice, TFile } from 'obsidian';
import type { IFlomoPlugin, NoteItem, TreeNode } from './types';

// 从YAML front matter中提取tags、send-flomo状态和aliases
export function extractTagsFromFrontmatter(content: string): { tags: string[], sendFlomo: boolean, aliases?: string | string[] } {
    const tags: string[] = [];
    let sendFlomo = false;
    let aliases;
    const yamlMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

    if (yamlMatch && yamlMatch[1]) {
        try {
            const frontmatter = yaml.load(yamlMatch[1]) as {
                tags?: string[] | string;
                'send-flomo'?: boolean;
                aliases?: string | string[]
            };
            if (frontmatter) {
                if (frontmatter.tags) {
                    if (typeof frontmatter.tags === 'string') {
                        tags.push(frontmatter.tags);
                    } else if (Array.isArray(frontmatter.tags)) {
                        tags.push(...frontmatter.tags);
                    }
                }

                if (frontmatter['send-flomo'] === true) {
                    sendFlomo = true;
                }

                if (frontmatter.aliases) {
                    aliases = frontmatter.aliases;
                }
            }
        } catch (e) {
            console.error('解析YAML时出错:', e);
        }
    }

    return { tags, sendFlomo, aliases };
}

// 移除YAML front matter
export function removeFrontmatter(content: string): string {
    return content.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/, '');
}

// 移除Markdown格式（加粗、斜体等）——只匹配紧贴单词字符的标记
export function removeMarkdownFormatting(content: string): string {
    let cleanContent = content.replace(/\*\*(.*?)\*\*/g, '$1');
    cleanContent = cleanContent.replace(/\*(\S(?:.*?\S)?)\*/g, '$1');
    cleanContent = cleanContent.replace(/_(\S(?:.*?\S)?)_/g, '$1');
    return cleanContent;
}

// 格式化标签为 flomo 格式
function formatTags(tags: string[]): string {
    return tags.map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
}

// 构建发送到flomo的内容
export function buildContentToSend(fileContent: string, fileName: string, tags: string[], aliases?: string | string[]): string {
    let cleanContent = removeFrontmatter(fileContent);
    cleanContent = removeMarkdownFormatting(cleanContent);
    cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();

    let contentToSend = '';
    if (fileName) {
        contentToSend = `${fileName}\n\n`;
    }
    contentToSend += cleanContent + '\n\n';
    if (aliases) {
        if (typeof aliases === 'string') {
            contentToSend += `别名：${aliases}\n`;
        } else if (Array.isArray(aliases)) {
            contentToSend += `别名：${aliases.join('、')}\n`;
        }
    }
    if (tags.length > 0) {
        contentToSend += formatTags(tags);
    }

    return contentToSend;
}

// 计算内容哈希值（双路 FNV-1a 32位拼接，降低碰撞率）
export function calculateContentHash(content: string): string {
    if (content.length === 0) return '0';

    let h1 = 0x811c9dc5;
    let h2 = 0xcbf29ce4;

    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        h1 ^= char;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= char;
        h2 = Math.imul(h2, 0x01000193);
    }

    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}

// 标记笔记为已发布（统一的状态更新函数）
export async function markAsPublished(
    plugin: IFlomoPlugin,
    filePath: string,
    content: string
): Promise<void> {
    plugin.settings.publishedNotes[filePath] = {
        timestamp: Date.now(),
        contentHash: calculateContentHash(content)
    };
    await plugin.saveSettings();
}

// 检查笔记是否已发布且内容未变更
export function isNoteAlreadyPublished(
    plugin: IFlomoPlugin,
    filePath: string,
    content: string
): boolean {
    const record = plugin.settings.publishedNotes[filePath];
    if (!record) return false;
    if (!record.contentHash) return false;
    return record.contentHash === calculateContentHash(content);
}

// 撤回笔记的发布状态
export async function unmarkAsPublished(
    plugin: IFlomoPlugin,
    filePath: string
): Promise<void> {
    delete plugin.settings.publishedNotes[filePath];
    await plugin.saveSettings();
}

// 更新文件的YAML front matter中的send-flomo属性
export async function updateSendFlomoStatus(app: App, file: TFile, isSent: boolean): Promise<boolean> {
    try {
        const content = await app.vault.read(file);
        const yamlMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);

        let updatedContent = content;

        if (yamlMatch && yamlMatch[1]) {
            const frontmatterContent = yamlMatch[1];
            let frontmatter: Record<string, unknown>;

            try {
                frontmatter = yaml.load(frontmatterContent) as Record<string, unknown>;
            } catch (e) {
                console.error('解析YAML时出错:', e);
                return false;
            }

            frontmatter['send-flomo'] = isSent;

            const updatedYaml = yaml.dump(frontmatter);
            updatedContent = content.replace(/^---\r?\n([\s\S]*?)\r?\n---/, `---\n${updatedYaml}---`);
        } else {
            const frontmatter = { 'send-flomo': isSent };
            const yamlContent = yaml.dump(frontmatter);
            updatedContent = `---\n${yamlContent}---\n${content}`;
        }

        await app.vault.modify(file, updatedContent);
        return true;
    } catch (error) {
        console.error('更新send-flomo状态时出错:', error);
        return false;
    }
}

// 构建目录树
export function buildDirectoryTree(noteItem: NoteItem, pathParts: string[], treeData: TreeNode): void {
    if (pathParts.length === 0) {
        treeData.files.push(noteItem);
        return;
    }

    const currentPart = pathParts[0];

    if (!treeData.subfolders[currentPart]) {
        treeData.subfolders[currentPart] = { files: [], subfolders: {} };
    }

    buildDirectoryTree(noteItem, pathParts.slice(1), treeData.subfolders[currentPart]);
}

// 校验当前是否有有效的 Markdown 文件（从 main.ts 提取）
export function getValidatedActiveFile(app: App): { view: MarkdownView; file: TFile } | null {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
        new Notice('❌ 请先打开一个Markdown文件');
        return null;
    }
    if (!view.file) {
        new Notice('❌ 无法访问当前文件');
        return null;
    }
    return { view, file: view.file };
}

// 将文件内容按双换行符分割为 block（从 main.ts 提取）
export function splitContentToBlocks(fileContent: string, tags: string[]): string[] {
    let cleanContent = removeFrontmatter(fileContent);
    cleanContent = removeMarkdownFormatting(cleanContent);

    const rawBlocks = cleanContent.split(/\n\n+/);

    const blocks: string[] = [];
    for (let block of rawBlocks) {
        block = block.trim();
        if (block) {
            if (tags.length > 0) {
                block += '\n' + formatTags(tags);
            }
            blocks.push(block);
        }
    }

    return blocks;
}

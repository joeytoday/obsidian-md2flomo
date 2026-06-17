import * as yaml from 'js-yaml';
import { App, TFile } from 'obsidian';
import type { TreeNode } from './types';

// 从YAML front matter中提取tags、send-flomo状态和aliases
export function extractTagsFromFrontmatter(content: string): { tags: string[], sendFlomo: boolean, aliases?: string | string[] } {
    const tags: string[] = [];
    let sendFlomo = false;
    let aliases;
    const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
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
    return content.replace(/^---\n([\s\S]*?)\n---\n/, '');
}

// 移除Markdown格式（加粗、斜体等）
export function removeMarkdownFormatting(content: string): string {
    let cleanContent = content.replace(/\*\*(.*?)\*\*/g, '$1');
    cleanContent = cleanContent.replace(/\*(.*?)\*/g, '$1');
    cleanContent = cleanContent.replace(/_(.*?)_/g, '$1');
    return cleanContent;
}

// 构建发送到flomo的内容（统一管线，复制和发布共用）
export function buildContentToSend(fileContent: string, fileName: string, tags: string[], aliases?: string | string[]): string {
    let cleanContent = removeFrontmatter(fileContent);
    cleanContent = removeMarkdownFormatting(cleanContent);
    cleanContent = cleanContent.replace(/\n{3,}/g, '\n\n').trim();

    let contentToSend = `${fileName}\n\n`;
    contentToSend += cleanContent + '\n\n';
    if (aliases) {
        if (typeof aliases === 'string') {
            contentToSend += `别名：${aliases}\n`;
        } else if (Array.isArray(aliases)) {
            contentToSend += `别名：${aliases.join('、')}\n`;
        }
    }
    if (tags.length > 0) {
        contentToSend += tags.map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
    }

    return contentToSend;
}

// 计算内容哈希值
export function calculateContentHash(content: string): string {
    let hash = 0;
    if (content.length === 0) return hash.toString();
    
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return hash.toString();
}

// 更新文件的YAML front matter中的send-flomo属性
export async function updateSendFlomoStatus(app: App, file: TFile, isSent: boolean): Promise<boolean> {
    try {
        const content = await app.vault.read(file);
        const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        let updatedContent = content;
        
        if (yamlMatch && yamlMatch[1]) {
            const frontmatterContent = yamlMatch[1];
            let frontmatter;
            
            try {
                frontmatter = yaml.load(frontmatterContent) as Record<string, unknown>;
            } catch (e) {
                console.error('解析YAML时出错:', e);
                return false;
            }
            
            frontmatter['send-flomo'] = isSent;
            
            const updatedYaml = yaml.dump(frontmatter);
            updatedContent = content.replace(/^---\n([\s\S]*?)\n---/, `---\n${updatedYaml}---`);
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
export function buildDirectoryTree(noteItem: import('./types').NoteItem, pathParts: string[], treeData: TreeNode): void {
    if (pathParts.length === 0) {
        if (!treeData.files) {
            treeData.files = [];
        }
        treeData.files.push(noteItem);
        return;
    }
    
    const currentPart = pathParts[0];
    if (!treeData.subfolders) {
        treeData.subfolders = {};
    }
    
    if (!treeData.subfolders[currentPart]) {
        treeData.subfolders[currentPart] = { files: [], subfolders: {} };
    }
    
    buildDirectoryTree(noteItem, pathParts.slice(1), treeData.subfolders[currentPart]);
}

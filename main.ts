import { MarkdownView, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS } from './src/types';
import type { Md2FlomoSettings, IFlomoPlugin } from './src/types';
import { extractTagsFromFrontmatter, removeFrontmatter, removeMarkdownFormatting, buildContentToSend, calculateContentHash } from './src/utils';
import { sendToFlomo } from './src/api';
import { ImportConfirmModal } from './src/modals/ImportConfirmModal';
import { BlockImportConfirmModal } from './src/modals/BlockImportConfirmModal';
import { PublicationCenter } from './src/modals/PublicationCenter';
import { Md2FlomoSettingTab } from './src/settings';

export default class Md2FlomoPlugin extends Plugin implements IFlomoPlugin {
    settings: Md2FlomoSettings;

    async onload() {
        await this.loadSettings();

        // 添加功能区图标 - 导入整个文件
        this.addRibbonIcon('paper-plane', '导入到flomo', async () => {
            await this.importCurrentNoteToFlomo();
        });

        // 添加功能区图标 - 导入block内容
        this.addRibbonIcon('file-text', '导入block内容到flomo', async () => {
            await this.importCurrentNoteBlocksToFlomo();
        });

        // 添加命令 - 文件内容发布
        this.addCommand({
            id: 'import-to-flomo',
            name: '文件内容发布',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) {
                        this.importCurrentNoteToFlomo();
                    }
                    return true;
                }
                return false;
            }
        });

        // 添加命令 - block内容发布
        this.addCommand({
            id: 'import-blocks-to-flomo',
            name: 'block内容发布',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) {
                        this.importCurrentNoteBlocksToFlomo();
                    }
                    return true;
                }
                return false;
            }
        });

        // 添加命令 - 打开发布中心
        this.addCommand({
            id: 'open-publication-center',
            name: '打开发布中心',
            callback: () => {
                new PublicationCenter(this.app, this).open();
            }
        });

        // 添加设置选项卡
        this.addSettingTab(new Md2FlomoSettingTab(this.app, this));

        // 只有在API未配置且不是第一次运行插件时才显示提示
        if (!this.settings.flomoApiUrl && !this.settings.hasShownApiReminder) {
            new Notice('👏 欢迎使用 md2flomo 插件！请先在设置中配置您的 flomo API');
            this.settings.hasShownApiReminder = true;
            await this.saveSettings();
        }
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // 导入当前笔记到flomo
    async importCurrentNoteToFlomo() {
        if (!this.settings.flomoApiUrl) {
            new Notice('❌ 请先在设置中配置您的 flomo API URL');
            return;
        }

        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) {
            new Notice('❌ 请先打开一个Markdown文件');
            return;
        }

        try {
            if (!markdownView.file) {
                new Notice('❌ 无法访问当前文件');
                return;
            }
            
            const fileContent = await this.app.vault.cachedRead(markdownView.file);
            const fileName = markdownView.file.basename;
            const { tags, sendFlomo, aliases } = extractTagsFromFrontmatter(fileContent);
            const contentToSend = buildContentToSend(fileContent, fileName, tags, aliases);

            if (sendFlomo) {
                new Notice('正在导入到flomo...');
                const success = await sendToFlomo(contentToSend, this.settings.flomoApiUrl);
                
                if (success) {
                    new Notice('✅ 导入成功！');
                    this.settings.publishedNotes[markdownView.file.path] = {
                        timestamp: Date.now(),
                        contentHash: calculateContentHash(fileContent)
                    };
                    await this.saveSettings();
                } else {
                    new Notice('❌ 导入失败，请检查API配置');
                }
            } else {
                new ImportConfirmModal(this.app, contentToSend, this.settings.flomoApiUrl, this, markdownView.file).open();
            }
        } catch (error) {
            console.error('导入到flomo时发生错误:', error);
            new Notice('❌ 处理文件时发生错误');
        }
    }
    
    // 导入当前笔记的blocks到flomo
    async importCurrentNoteBlocksToFlomo() {
        if (!this.settings.flomoApiUrl) {
            new Notice('❌ 请先在设置中配置您的 flomo API URL');
            return;
        }

        const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!markdownView) {
            new Notice('❌ 请先打开一个Markdown文件');
            return;
        }

        try {
            if (!markdownView.file) {
                new Notice('❌ 无法访问当前文件');
                return;
            }
            
            const fileContent = await this.app.vault.cachedRead(markdownView.file);
            const { tags } = extractTagsFromFrontmatter(fileContent);
            
            let cleanContent = removeFrontmatter(fileContent);
            cleanContent = removeMarkdownFormatting(cleanContent);
            
            const rawBlocks = cleanContent.split(/\n\n+/);
            
            const blocks: string[] = [];
            for (let block of rawBlocks) {
                block = block.trim();
                if (block) {
                    if (tags.length > 0) {
                        const tagsText = tags.map(tag => `#${tag.replace(/\s+/g, '')}`).join(' ');
                        block += '\n' + tagsText;
                    }
                    blocks.push(block);
                }
            }
            
            if (blocks.length === 0) {
                new Notice('❌ 未找到可导入的内容块');
                return;
            }
            
            new BlockImportConfirmModal(this.app, blocks, this.settings.flomoApiUrl, this, markdownView.file).open();
        } catch (error) {
            console.error('导入block到flomo时发生错误:', error);
            new Notice('❌ 处理文件时发生错误');
        }
    }
}
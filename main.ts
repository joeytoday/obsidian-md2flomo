import { MarkdownView, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS } from './src/types';
import type { Md2FlomoSettings, IFlomoPlugin } from './src/types';
import { extractTagsFromFrontmatter, buildContentToSend, getValidatedActiveFile, splitContentToBlocks, updateSendFlomoStatus, markAsPublished, isNoteAlreadyPublished } from './src/utils';
import { sendToFlomo } from './src/api';
import { ImportConfirmModal } from './src/modals/ImportConfirmModal';
import { BlockImportConfirmModal } from './src/modals/BlockImportConfirmModal';
import { PublicationCenter } from './src/modals/PublicationCenter';
import { Md2FlomoSettingTab } from './src/settings';

export default class Md2FlomoPlugin extends Plugin implements IFlomoPlugin {
    settings: Md2FlomoSettings;

    async onload() {
        await this.loadSettings();

        this.addRibbonIcon('paper-plane', '导入到flomo', async () => {
            await this.publishCurrentNote();
        });

        this.addRibbonIcon('file-text', '导入block内容到flomo', async () => {
            await this.publishCurrentNoteBlocks();
        });

        this.addCommand({
            id: 'import-to-flomo',
            name: '文件内容发布',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) {
                        void this.publishCurrentNote();
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'import-blocks-to-flomo',
            name: 'block内容发布',
            checkCallback: (checking: boolean) => {
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    if (!checking) {
                        void this.publishCurrentNoteBlocks();
                    }
                    return true;
                }
                return false;
            }
        });

        this.addCommand({
            id: 'open-publication-center',
            name: '打开发布中心',
            callback: () => {
                new PublicationCenter(this.app, this).open();
            }
        });

        this.addSettingTab(new Md2FlomoSettingTab(this.app, this));

        if (!this.settings.flomoApiUrl && !this.settings.hasShownApiReminder) {
            new Notice('欢迎使用 md2flomo 插件！请先在设置中配置您的 flomo API');
            this.settings.hasShownApiReminder = true;
            await this.saveSettings();
        }
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // 迁移旧版 DJB2 哈希（十进制字符串）：保留记录但标记哈希无效，避免误判发布状态
        for (const [, record] of Object.entries(this.settings.publishedNotes)) {
            if (/^-?\d+$/.test(record.contentHash) && record.contentHash !== '0') {
                record.contentHash = '';
            }
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async publishCurrentNote() {
        if (!this.settings.flomoApiUrl) {
            new Notice('❌ 请先在设置中配置您的 flomo API URL');
            return;
        }

        const validated = getValidatedActiveFile(this.app);
        if (!validated) return;
        const { file } = validated;

        try {
            const fileContent = await this.app.vault.cachedRead(file);
            const fileName = file.basename;
            const { tags, aliases, sendFlomo } = extractTagsFromFrontmatter(fileContent);

            if (sendFlomo) {
                const currentContent = await this.app.vault.read(file);
                if (isNoteAlreadyPublished(this, file.path, currentContent)) {
                    new Notice('该笔记已发布且内容未变更，跳过重复发布');
                    return;
                }

                const contentToSend = buildContentToSend(fileContent, fileName, tags, aliases);
                const result = await sendToFlomo(contentToSend, this.settings.flomoApiUrl);
                if (result.success) {
                    await updateSendFlomoStatus(this.app, file, true);
                    const updatedContent = await this.app.vault.read(file);
                    await markAsPublished(this, file.path, updatedContent);
                    new Notice('✅ 发布成功');
                } else {
                    new Notice(`❌ 发布失败: ${result.error}`);
                }
            } else {
                const contentToSend = buildContentToSend(fileContent, fileName, tags, aliases);
                new ImportConfirmModal(this.app, contentToSend, this.settings.flomoApiUrl, this, file, fileContent).open();
            }
        } catch (error: unknown) {
            console.error('发布笔记时发生错误:', error);
            new Notice('❌ 处理文件时发生错误');
        }
    }

    async publishCurrentNoteBlocks() {
        if (!this.settings.flomoApiUrl) {
            new Notice('❌ 请先在设置中配置您的 flomo API URL');
            return;
        }

        const validated = getValidatedActiveFile(this.app);
        if (!validated) return;
        const { file } = validated;

        try {
            const fileContent = await this.app.vault.cachedRead(file);
            const { tags } = extractTagsFromFrontmatter(fileContent);
            const blocks = splitContentToBlocks(fileContent, tags);

            if (blocks.length === 0) {
                new Notice('❌ 未找到可导入的内容块');
                return;
            }

            new BlockImportConfirmModal(this.app, blocks, this.settings.flomoApiUrl, this, file).open();
        } catch (error: unknown) {
            console.error('发布block时发生错误:', error);
            new Notice('❌ 处理文件时发生错误');
        }
    }
}

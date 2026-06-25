import { App, Modal, Notice, TFile } from 'obsidian';
import type { IFlomoPlugin } from '../types';
import { sendToFlomo } from '../api';
import { updateSendFlomoStatus, markAsPublished, isNoteAlreadyPublished, extractTagsFromFrontmatter } from '../utils';

export class ImportConfirmModal extends Modal {
    private content: string;
    private apiUrl: string;
    private file: TFile;
    private fileContent: string;
    private plugin: IFlomoPlugin;
    private isSending = false;

    constructor(app: App, content: string, apiUrl: string, plugin: IFlomoPlugin, file: TFile, fileContent: string) {
        super(app);
        this.content = content;
        this.apiUrl = apiUrl;
        this.file = file;
        this.fileContent = fileContent;
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '确认发布到 flomo' });

        const descEl = contentEl.createDiv({ cls: 'md2flomo-confirm-desc' });
        descEl.createEl('p', { text: '以下内容将被发送到 flomo：' });

        const warningEl = descEl.createEl('p', { cls: 'md2flomo-warning' });
        warningEl.setText('导入后将在文件 frontmatter 中添加 send-flomo: true 标记');

        if (isNoteAlreadyPublished(this.plugin, this.file.path, this.fileContent)) {
            const dupWarning = descEl.createEl('p', { cls: 'md2flomo-warning' });
            dupWarning.setText('该笔记已发布且内容未变更，重复发布将产生重复记录');
        }

        const preview = contentEl.createDiv({ cls: 'md2flomo-preview' });
        preview.setText(this.content);

        const buttonContainer = contentEl.createDiv({ cls: 'md2flomo-button-container' });

        const cancelButton = buttonContainer.createEl('button', { text: '取消', cls: 'md2flomo-btn-secondary' });
        cancelButton.onclick = () => this.close();

        const confirmButton = buttonContainer.createEl('button', { text: '确认发布', cls: 'md2flomo-btn-primary' });
        confirmButton.onclick = async () => {
            if (this.isSending) return;
            this.isSending = true;
            confirmButton.disabled = true;
            confirmButton.setText('发布中...');

            try {
                const result = await sendToFlomo(this.content, this.apiUrl);

                if (result.success) {
                    new Notice('✅ 发布成功');

                    const { sendFlomo } = extractTagsFromFrontmatter(this.fileContent);

                    if (!sendFlomo) {
                        await updateSendFlomoStatus(this.app, this.file, true);
                    }

                    const currentContent = await this.app.vault.cachedRead(this.file);
                    await markAsPublished(this.plugin, this.file.path, currentContent);
                    new Notice('已标记为已发布');
                } else {
                    new Notice(`❌ 发布失败: ${result.error}`);
                    confirmButton.disabled = false;
                    confirmButton.setText('确认发布');
                    this.isSending = false;
                }
            } catch (error) {
                console.error('发布到flomo时发生错误:', error);
                new Notice('❌ 发布过程中发生错误');
                confirmButton.disabled = false;
                confirmButton.setText('确认发布');
                this.isSending = false;
            }

            if (this.isSending) {
                this.close();
            }
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

import { App, Modal, Notice, TFile } from 'obsidian';
import type { IFlomoPlugin } from '../types';
import { sendToFlomo } from '../api';
import { updateSendFlomoStatus, markAsPublished } from '../utils';

export class BlockImportConfirmModal extends Modal {
    private blocks: string[];
    private apiUrl: string;
    private file: TFile;
    private plugin: IFlomoPlugin;
    private selectedBlocks: Set<number> = new Set();
    private isSending = false;
    private cancelRequested = false;

    constructor(app: App, blocks: string[], apiUrl: string, plugin: IFlomoPlugin, file: TFile) {
        super(app);
        this.blocks = blocks;
        this.apiUrl = apiUrl;
        this.file = file;
        this.plugin = plugin;
        this.selectedBlocks = new Set(Array.from({ length: blocks.length }, (_, i) => i));
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '确认导入到 flomo' });
        contentEl.createEl('p', { text: '内容已按双换行符分割，您可以选择要导入的部分:' });

        const blocksContainer = contentEl.createDiv({ cls: 'md2flomo-blocks-container' });

        this.blocks.forEach((block, index) => {
            const blockItem = blocksContainer.createEl('div', { cls: 'md2flomo-block-item' });

            const checkbox = blockItem.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.selectedBlocks.has(index);
            checkbox.addEventListener('change', (event) => {
                const isChecked = (event.target as HTMLInputElement).checked;
                if (isChecked) {
                    this.selectedBlocks.add(index);
                } else {
                    this.selectedBlocks.delete(index);
                }
            });

            const blockContent = blockItem.createEl('div', { cls: 'md2flomo-block-content' });
            blockContent.setText(block);
        });

        const buttonContainer = contentEl.createDiv({ cls: 'md2flomo-button-container' });

        const cancelButton = buttonContainer.createEl('button', { text: '取消', cls: 'md2flomo-btn-secondary' });
        cancelButton.onclick = () => {
            if (this.isSending) {
                this.cancelRequested = true;
            } else {
                this.close();
            }
        };

        const deselectAllButton = buttonContainer.createEl('button', { text: '取消全选', cls: 'md2flomo-btn-secondary' });
        deselectAllButton.onclick = () => {
            this.selectedBlocks.clear();
            const checkboxes = contentEl.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                (checkbox as HTMLInputElement).checked = false;
            });
        };

        const selectAllButton = buttonContainer.createEl('button', { text: '全选', cls: 'md2flomo-btn-secondary' });
        selectAllButton.onclick = () => {
            this.selectedBlocks = new Set(Array.from({ length: this.blocks.length }, (_, i) => i));
            const checkboxes = contentEl.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                (checkbox as HTMLInputElement).checked = true;
            });
        };

        const publishButton = buttonContainer.createEl('button', { text: '确认导入', cls: 'md2flomo-btn-primary' });
        publishButton.onclick = async () => {
            if (this.selectedBlocks.size === 0) {
                new Notice('❌ 请先选择要发布的内容');
                return;
            }

            this.isSending = true;
            this.cancelRequested = false;
            publishButton.disabled = true;
            publishButton.setText('导入中...');

            const blockIndices = Array.from(this.selectedBlocks);
            const totalCount = blockIndices.length;
            let successCount = 0;
            let failedCount = 0;

            for (let i = 0; i < blockIndices.length; i++) {
                if (this.cancelRequested) {
                    break;
                }

                const index = blockIndices[i];
                const block = this.blocks[index];
                const result = await sendToFlomo(block, this.apiUrl);
                if (result.success) {
                    successCount++;
                } else {
                    failedCount++;
                    console.warn(`导入 block ${index} 失败: ${result.error}`);
                }

                publishButton.setText(`导入中 ${i + 1}/${totalCount}...`);
            }

            this.isSending = false;

            if (this.cancelRequested) {
                new Notice(`已取消导入（已完成 ${successCount}/${totalCount}）`);
            } else if (successCount > 0) {
                if (failedCount > 0) {
                    new Notice(`✅ 成功导入 ${successCount} 条，失败 ${failedCount} 条`);
                } else {
                    new Notice(`✅ 成功导入 ${successCount} 条内容`);
                }

                await updateSendFlomoStatus(this.app, this.file, true);
                const updatedContent = await this.app.vault.read(this.file);
                await markAsPublished(this.plugin, this.file.path, updatedContent);
            } else {
                new Notice('❌ 导入失败，请检查API配置');
                publishButton.disabled = false;
                publishButton.setText('确认导入');
                return;
            }

            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

import { App, Modal, Notice, TFile } from 'obsidian';
import type { IFlomoPlugin } from '../types';
import { sendToFlomo } from '../api';
import { updateSendFlomoStatus } from '../utils';

// Block内容导入确认模态框
export class BlockImportConfirmModal extends Modal {
    private blocks: string[];
    private apiUrl: string;
    private file: TFile | null;
    private plugin: IFlomoPlugin;
    private selectedBlocks: number[] = [];

    constructor(app: App, blocks: string[], apiUrl: string, plugin: IFlomoPlugin, file?: TFile) {
        super(app);
        this.blocks = blocks;
        this.apiUrl = apiUrl;
        this.file = file || null;
        this.plugin = plugin;
        this.selectedBlocks = Array.from({ length: blocks.length }, (_, i) => i);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: '确认导入到flomo' });
        contentEl.createEl('p', { text: '内容已按双换行符分割，您可以选择要导入的部分:' });
        
        const blocksContainer = contentEl.createDiv({ cls: 'md2flomo-blocks-container' });
        
        this.blocks.forEach((block, index) => {
            const blockItem = blocksContainer.createEl('div', { cls: 'md2flomo-block-item' });
            
            const checkbox = blockItem.createEl('input', { type: 'checkbox' });
            checkbox.checked = this.selectedBlocks.includes(index);
            checkbox.addEventListener('change', (event) => {
                const isChecked = (event.target as HTMLInputElement).checked;
                if (isChecked) {
                    if (!this.selectedBlocks.includes(index)) {
                        this.selectedBlocks.push(index);
                    }
                } else {
                    this.selectedBlocks = this.selectedBlocks.filter(i => i !== index);
                }
            });
            
            const blockContent = blockItem.createEl('div', { cls: 'md2flomo-block-content' });
            blockContent.setText(block);
        });
        
        const buttonContainer = contentEl.createDiv({ cls: 'md2flomo-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.onclick = () => this.close();
        
        const selectAllButton = buttonContainer.createEl('button', { text: '全选' });
        selectAllButton.onclick = () => {
            this.selectedBlocks = Array.from({ length: this.blocks.length }, (_, i) => i);
            const checkboxes = contentEl.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                (checkbox as HTMLInputElement).checked = true;
            });
        };
        
        const publishButton = buttonContainer.createEl('button', { text: '确认导入' });
        publishButton.onclick = async () => {
            if (this.selectedBlocks.length === 0) {
                new Notice('请先选择要发布的内容');
                return;
            }
            
            new Notice(`正在导入 ${this.selectedBlocks.length} 条内容到flomo...`);
            
            let successCount = 0;
            for (const index of this.selectedBlocks) {
                const block = this.blocks[index];
                const success = await sendToFlomo(block, this.apiUrl);
                if (success) {
                    successCount++;
                }
            }
            
            if (successCount > 0) {
                new Notice(`✅ 成功导入 ${successCount} 条内容！`);
                
                if (this.file) {
                    await updateSendFlomoStatus(this.app, this.file, true);
                }
            } else {
                new Notice('❌ 导入失败，请检查API配置');
            }
            
            this.close();
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

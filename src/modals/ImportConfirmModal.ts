import { App, Modal, Notice, TFile } from 'obsidian';
import type { IFlomoPlugin } from '../types';
import { sendToFlomo } from '../api';
import { extractTagsFromFrontmatter, calculateContentHash, updateSendFlomoStatus } from '../utils';

// 导入确认模态框
export class ImportConfirmModal extends Modal {
    private content: string;
    private apiUrl: string;
    private file: TFile | null;
    private plugin: IFlomoPlugin;

    constructor(app: App, content: string, apiUrl: string, plugin: IFlomoPlugin, file?: TFile) {
        super(app);
        this.content = content;
        this.apiUrl = apiUrl;
        this.file = file || null;
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        contentEl.createEl('h2', { text: '确认导入到flomo' });
        contentEl.createEl('p', { text: '以下内容将被导入到flomo:' });
        
        const preview = contentEl.createDiv({ cls: 'md2flomo-preview' });
        preview.setText(this.content.substring(0, 200) + (this.content.length > 200 ? '...' : ''));
        
        const buttonContainer = contentEl.createDiv({ cls: 'md2flomo-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', { text: '取消' });
        cancelButton.onclick = () => this.close();
        
        const confirmButton = buttonContainer.createEl('button', { text: '确认导入' });
        confirmButton.onclick = async () => {
            new Notice('正在导入到flomo...');
            const success = await sendToFlomo(this.content, this.apiUrl);
            
            if (success) {
                new Notice('✅ 导入成功！');
                
                if (this.file) {
                    const fileContent = await this.app.vault.cachedRead(this.file);
                    const { sendFlomo } = extractTagsFromFrontmatter(fileContent);
                    
                    if (!sendFlomo) {
                        await updateSendFlomoStatus(this.app, this.file, true);
                    }
                    
                    this.plugin.settings.publishedNotes[this.file.path] = {
                        timestamp: Date.now(),
                        contentHash: calculateContentHash(fileContent)
                    };
                    await this.plugin.saveSettings();
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

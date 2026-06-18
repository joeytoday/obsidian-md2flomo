import { App, Modal, Notice } from 'obsidian';
import type { IFlomoPlugin, NoteItem, TreeNode } from '../types';
import { extractTagsFromFrontmatter, buildContentToSend, calculateContentHash, buildDirectoryTree } from '../utils';
import { sendToFlomo } from '../api';

// 发布中心模态窗口
export class PublicationCenter extends Modal {
    private plugin: IFlomoPlugin;
    private selectedNotes: string[] = [];
    private noteItems: NoteItem[] = [];
    private treeData: TreeNode = { files: [], subfolders: {} };

    constructor(app: App, plugin: IFlomoPlugin) {
        super(app);
        this.plugin = plugin;
        this.contentEl.addClass('md2flomo-publication-center');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: '发布中心' });

        const categoryContainer = contentEl.createDiv({ cls: 'md2flomo-categories' });

        this.createCategorySection(categoryContainer, '未发布笔记', 'unpublished');
        this.createCategorySection(categoryContainer, '已发布笔记', 'published');

        const publishButton = contentEl.createEl('button', {
            text: '发布选中',
            cls: 'md2flomo-publish-button'
        });

        publishButton.onclick = async () => {
            if (this.selectedNotes.length === 0) {
                new Notice('❌ 请先选择要发布的笔记');
                return;
            }

            publishButton.disabled = true;
            publishButton.setText('发布中...');

            try {
                await this.publishSelectedNotes();
            } catch (error) {
                console.error('发布过程中发生错误:', error);
                new Notice('❌ 发布过程中发生错误');
                publishButton.disabled = false;
                publishButton.setText('发布选中');
            }
        };

        this.loadNotes();
    }

    async loadNotes() {
        this.noteItems = [];
        this.treeData = { files: [], subfolders: {} };
        
        const allFiles = this.app.vault.getMarkdownFiles();
        
        for (const file of allFiles) {
            try {
                const content = await this.app.vault.cachedRead(file);
                const { tags, sendFlomo, aliases } = extractTagsFromFrontmatter(content);
                
                const filePath = file.path;
                const directoryPath = file.parent?.path || '';
                const isPublished = this.plugin.settings.publishedNotes[filePath] !== undefined;
                
                const noteItem: NoteItem = {
                    file,
                    content,
                    tags,
                    sendFlomo,
                    filePath,
                    directoryPath,
                    isPublished,
                    aliases
                };
                
                this.noteItems.push(noteItem);
                
                buildDirectoryTree(noteItem, directoryPath.split('/'), this.treeData);
            } catch (error) {
                console.error(`处理文件 ${file.name} 时出错:`, error);
            }
        }
        
        this.renderNoteTree();
    }

    renderNoteTree() {
        const sections = this.contentEl.querySelectorAll('.md2flomo-category-content');
        sections.forEach(section => section.empty());

        const unpublishedNotes = this.noteItems.filter(item => !item.isPublished);
        const publishedNotes = this.noteItems.filter(item => item.isPublished);
        
        this.renderCategoryTree(unpublishedNotes, 'unpublished');
        this.renderCategoryTree(publishedNotes, 'published');
    }
    
    renderCategoryTree(notes: NoteItem[], category: string) {
        const tree: TreeNode = { files: [], subfolders: {} };
        
        for (const note of notes) {
            const pathParts = note.directoryPath.split('/').filter(Boolean);
            buildDirectoryTree(note, pathParts, tree);
        }
        
        const container = this.contentEl.querySelector(`.md2flomo-category-content[data-category="${category}"]`) as HTMLElement;
        if (!container) return;
        
        this.renderTreeLevel(tree, container, category);
    }
    
    renderTreeLevel(node: TreeNode, parent: HTMLElement, category: string) {
        for (const file of node.files) {
            const fileItem = parent.createDiv({ cls: 'md2flomo-file-item' });
            
            if (category !== 'published') {
                const checkbox = fileItem.createEl('input', { type: 'checkbox' });
                checkbox.checked = this.selectedNotes.includes(file.filePath);
                checkbox.addEventListener('change', (event) => {
                    const isChecked = (event.target as HTMLInputElement).checked;
                    if (isChecked) {
                        this.selectedNotes.push(file.filePath);
                    } else {
                        this.selectedNotes = this.selectedNotes.filter(path => path !== file.filePath);
                    }
                });
            } else {
                fileItem.createDiv({ cls: 'md2flomo-checkbox-placeholder' });
            }
            
            const fileInfo = fileItem.createDiv({ cls: 'md2flomo-file-info' });
            fileInfo.createEl('span', { cls: 'md2flomo-file-icon', text: '📝' });
            const fileNameEl = fileInfo.createEl('span', { cls: 'md2flomo-file-name', text: file.file.name });
            fileNameEl.setAttribute('data-filepath', file.filePath);
        }
        
        for (const [folderName, folderNode] of Object.entries(node.subfolders)) {
            const folderItem = parent.createDiv({ cls: 'md2flomo-folder-item' });
            const folderHeader = folderItem.createDiv({ cls: 'md2flomo-folder-header' });
            
            if (category !== 'published') {
                const checkbox = folderHeader.createEl('input', { type: 'checkbox' });
                checkbox.addEventListener('change', (event) => {
                    const isChecked = (event.target as HTMLInputElement).checked;
                    this.toggleFolderSelection(folderNode, isChecked);
                });
            } else {
                folderHeader.createDiv({ cls: 'md2flomo-checkbox-placeholder' });
            }
            
            const toggleButton = folderHeader.createEl('span', { cls: 'md2flomo-toggle-button', text: '▶' });
            toggleButton.addEventListener('click', () => {
                const content = folderItem.querySelector('.md2flomo-folder-content') as HTMLElement;
                if (content) {
                    content.style.display = content.style.display === 'none' ? 'block' : 'none';
                    toggleButton.textContent = content.style.display === 'none' ? '▶' : '▼';
                }
            });
            
            const folderInfo = folderHeader.createDiv({ cls: 'md2flomo-folder-info' });
            folderInfo.createEl('span', { cls: 'md2flomo-folder-icon', text: '📁' });
            folderInfo.createEl('span', { cls: 'md2flomo-folder-name', text: folderName });
            
            const folderContent = folderItem.createDiv({ cls: 'md2flomo-folder-content md2flomo-content-hidden' });
            this.renderTreeLevel(folderNode, folderContent, category);
        }
    }
    
    toggleFolderSelection(node: TreeNode, isSelected: boolean) {
        for (const file of node.files) {
            if (isSelected) {
                if (!this.selectedNotes.includes(file.filePath)) {
                    this.selectedNotes.push(file.filePath);
                }
            } else {
                this.selectedNotes = this.selectedNotes.filter(path => path !== file.filePath);
            }
            
            const checkbox = this.contentEl.querySelector(`input[type="checkbox"] + .md2flomo-file-info span.md2flomo-file-name[data-filepath="${file.filePath}"]`)?.previousElementSibling?.previousElementSibling as HTMLInputElement;
            if (checkbox) {
                checkbox.checked = isSelected;
            }
        }
        
        for (const folderNode of Object.values(node.subfolders)) {
            this.toggleFolderSelection(folderNode, isSelected);
        }
    }

    createCategorySection(parent: HTMLElement, title: string, type: string) {
        const section = parent.createDiv({ cls: `md2flomo-category md2flomo-category-${type}` });
        const header = section.createDiv({ cls: 'md2flomo-category-header' });
        const toggleButton = header.createEl('span', { cls: 'md2flomo-category-toggle md2flomo-toggle-expanded' });
        header.createEl('h3', { text: title });
        
        const contentContainer = section.createDiv({ cls: 'md2flomo-category-content md2flomo-content-visible' });
        contentContainer.setAttr('data-category', type);
        
        header.addEventListener('click', () => {
            if (contentContainer.classList.contains('md2flomo-content-visible')) {
                contentContainer.classList.remove('md2flomo-content-visible');
                contentContainer.classList.add('md2flomo-content-hidden');
                toggleButton.classList.remove('md2flomo-toggle-expanded');
                toggleButton.classList.add('md2flomo-toggle-collapsed');
            } else {
                contentContainer.classList.remove('md2flomo-content-hidden');
                contentContainer.classList.add('md2flomo-content-visible');
                toggleButton.classList.remove('md2flomo-toggle-collapsed');
                toggleButton.classList.add('md2flomo-toggle-expanded');
            }
        });
    }

    async publishSelectedNotes() {
        if (this.selectedNotes.length === 0) {
            new Notice('❌ 请先选择要发布的笔记');
            return;
        }

        const totalCount = this.selectedNotes.length;
        new Notice(`开始发布 ${totalCount} 篇笔记...`);

        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < this.selectedNotes.length; i++) {
            const filePath = this.selectedNotes[i];
            const noteItem = this.noteItems.find(item => item.filePath === filePath);
            if (!noteItem) continue;

            try {
                const contentToSend = buildContentToSend(noteItem.content, noteItem.file.basename, noteItem.tags, noteItem.aliases);
                const result = await sendToFlomo(contentToSend, this.plugin.settings.flomoApiUrl);

                if (result.success) {
                    successCount++;
                    this.plugin.settings.publishedNotes[filePath] = {
                        timestamp: Date.now(),
                        contentHash: calculateContentHash(noteItem.content)
                    };
                } else {
                    failedCount++;
                }
            } catch (error) {
                console.error(`发布笔记 ${filePath} 时出错:`, error);
                failedCount++;
            }

            new Notice(`发布进度: ${i + 1}/${totalCount}（成功 ${successCount}，失败 ${failedCount}）`);
        }

        await this.plugin.saveSettings();
        new Notice(`✅ 成功发布 ${successCount} 篇笔记，❌ 失败 ${failedCount} 篇`);
        await this.loadNotes();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

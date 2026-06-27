import { App, Modal, Notice } from 'obsidian';
import type { IFlomoPlugin, NoteItem, TreeNode } from '../types';
import { extractTagsFromFrontmatter, buildContentToSend, buildDirectoryTree, markAsPublished, calculateContentHash, updateSendFlomoStatus, unmarkAsPublished } from '../utils';
import { sendToFlomo } from '../api';

export class PublicationCenter extends Modal {
    private plugin: IFlomoPlugin;
    private selectedNotes: Set<string> = new Set();
    private noteItems: NoteItem[] = [];
    private isLoading = false;
    private isPublishing = false;
    private cancelRequested = false;
    private checkboxMap: Map<string, HTMLInputElement> = new Map();

    constructor(app: App, plugin: IFlomoPlugin) {
        super(app);
        this.plugin = plugin;
        this.contentEl.addClass('md2flomo-publication-center');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: '发布中心' });

        const loadingEl = contentEl.createDiv({ cls: 'md2flomo-loading' });
        loadingEl.setText('正在加载笔记列表...');

        const categoryContainer = contentEl.createDiv({ cls: 'md2flomo-categories md2flomo-content-hidden' });

        this.createCategorySection(categoryContainer, '未发布笔记', 'unpublished');
        this.createCategorySection(categoryContainer, '已发布笔记', 'published');

        const buttonContainer = contentEl.createDiv({ cls: 'md2flomo-button-container' });

        const cancelButton = buttonContainer.createEl('button', { text: '取消', cls: 'md2flomo-btn-secondary' });
        cancelButton.onclick = () => {
            if (this.isPublishing) {
                this.cancelRequested = true;
            } else {
                this.close();
            }
        };

        const publishButton = buttonContainer.createEl('button', {
            text: '发布选中',
            cls: 'md2flomo-publish-button md2flomo-btn-primary'
        });

        publishButton.onclick = async () => {
            if (this.selectedNotes.size === 0) {
                new Notice('❌ 请先选择要发布的笔记');
                return;
            }

            this.isPublishing = true;
            this.cancelRequested = false;
            publishButton.disabled = true;
            publishButton.setText('发布中...');

            try {
                await this.publishSelectedNotes(publishButton);
            } catch (error) {
                console.error('发布过程中发生错误:', error);
                new Notice('❌ 发布过程中发生错误');
                publishButton.disabled = false;
                publishButton.setText('发布选中');
            }

            this.isPublishing = false;
        };

        this.isLoading = true;
        void this.loadNotes().then(() => {
            this.isLoading = false;
            loadingEl.addClass('md2flomo-content-hidden');
            categoryContainer.classList.remove('md2flomo-content-hidden');
            categoryContainer.classList.add('md2flomo-content-visible');
        }).catch((e: unknown) => {
            console.error('加载笔记列表失败:', e);
            this.isLoading = false;
            loadingEl.addClass('md2flomo-content-hidden');
        });
    }

    async loadNotes() {
        this.noteItems = [];
        this.checkboxMap.clear();

        const allFiles = this.app.vault.getMarkdownFiles();

        for (const file of allFiles) {
            try {
                const content = await this.app.vault.cachedRead(file);
                const { tags, sendFlomo, aliases } = extractTagsFromFrontmatter(content);

                const filePath = file.path;
                const directoryPath = file.parent?.path || '';
                const isPublished = this.plugin.settings.publishedNotes[filePath] !== undefined;

                const record = this.plugin.settings.publishedNotes[filePath];
                const hasChanged = record?.contentHash
                    ? record.contentHash !== calculateContentHash(content)
                    : false;

                const noteItem: NoteItem = {
                    file,
                    tags,
                    sendFlomo,
                    filePath,
                    directoryPath,
                    isPublished,
                    hasChanged,
                    aliases
                };

                this.noteItems.push(noteItem);
            } catch (error) {
                console.error(`处理文件 ${file.name} 时出错:`, error);
            }
        }

        this.renderNoteTree();
    }

    renderNoteTree() {
        const sections = this.contentEl.querySelectorAll('.md2flomo-category-content');
        sections.forEach(section => section.empty());
        this.checkboxMap.clear();

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
                const checkbox = fileItem.createEl('input', { type: 'checkbox', attr: { 'aria-label': `选择 ${file.file.name}` } });
                checkbox.checked = this.selectedNotes.has(file.filePath);
                this.checkboxMap.set(file.filePath, checkbox);
                checkbox.addEventListener('change', (event) => {
                    const isChecked = (event.target as HTMLInputElement).checked;
                    if (isChecked) {
                        this.selectedNotes.add(file.filePath);
                    } else {
                        this.selectedNotes.delete(file.filePath);
                    }
                });
            } else {
                fileItem.createDiv({ cls: 'md2flomo-checkbox-placeholder' });
            }

            const fileInfo = fileItem.createDiv({ cls: 'md2flomo-file-info' });
            fileInfo.createEl('span', { cls: 'md2flomo-file-icon', text: '📝' });
            const fileNameEl = fileInfo.createEl('span', { cls: 'md2flomo-file-name', text: file.file.name });
            fileNameEl.setAttribute('data-filepath', file.filePath);

            if (category === 'published') {
                const record = this.plugin.settings.publishedNotes[file.filePath];
                if (record) {
                    const dateEl = fileInfo.createEl('span', { cls: 'md2flomo-publish-date' });
                    dateEl.setText(`发布于 ${new Date(record.timestamp).toLocaleDateString()}`);

                    if (file.hasChanged) {
                        fileInfo.createEl('span', { cls: 'md2flomo-changed-icon', text: ' ✏️', attr: { title: '内容已变更' } });
                    }
                }

                const actionContainer = fileItem.createDiv({ cls: 'md2flomo-file-actions' });

                const unmarkButton = actionContainer.createEl('button', { text: '撤回', cls: 'md2flomo-btn-secondary md2flomo-btn-small' });
                unmarkButton.onclick = async () => {
                    unmarkButton.disabled = true;
                    await unmarkAsPublished(this.plugin, file.filePath);
                    new Notice(`已撤回 ${file.file.name} 的发布状态`);
                    await this.loadNotes();
                };

                if (file.hasChanged) {
                    const republishButton = actionContainer.createEl('button', { text: '重新发布', cls: 'md2flomo-btn-primary md2flomo-btn-small' });
                    republishButton.onclick = async () => {
                        republishButton.disabled = true;
                        try {
                            const content = await this.app.vault.read(file.file);
                            const contentToSend = buildContentToSend(content, file.file.basename, file.tags, file.aliases);
                            const result = await sendToFlomo(contentToSend, this.plugin.settings.flomoApiUrl);
                            if (result.success) {
                                await updateSendFlomoStatus(this.app, file.file, true);
                                const updatedContent = await this.app.vault.read(file.file);
                                await markAsPublished(this.plugin, file.filePath, updatedContent);
                                new Notice(`✅ ${file.file.name} 重新发布成功`);
                                await this.loadNotes();
                            } else {
                                new Notice(`❌ 重新发布失败: ${result.error}`);
                                republishButton.disabled = false;
                            }
                        } catch (error) {
                            console.error(`重新发布 ${file.filePath} 时出错:`, error);
                            new Notice('❌ 重新发布时发生错误');
                            republishButton.disabled = false;
                        }
                    };
                }
            }
        }

        for (const [folderName, folderNode] of Object.entries(node.subfolders)) {
            const folderItem = parent.createDiv({ cls: 'md2flomo-folder-item' });
            const folderHeader = folderItem.createDiv({ cls: 'md2flomo-folder-header' });

            if (category !== 'published') {
                const checkbox = folderHeader.createEl('input', { type: 'checkbox', attr: { 'aria-label': `选择文件夹 ${folderName}` } });
                checkbox.addEventListener('change', (event) => {
                    const isChecked = (event.target as HTMLInputElement).checked;
                    this.toggleFolderSelection(folderNode, isChecked);
                });
            } else {
                folderHeader.createDiv({ cls: 'md2flomo-checkbox-placeholder' });
            }

            const toggleButton = folderHeader.createEl('span', { cls: 'md2flomo-toggle-button', text: '▶', attr: { 'aria-expanded': 'false', role: 'button' } });
            toggleButton.addEventListener('click', () => {
                const content = folderItem.querySelector('.md2flomo-folder-content') as HTMLElement;
                if (content) {
                    const isHidden = content.classList.contains('md2flomo-content-hidden');
                    content.classList.toggle('md2flomo-content-hidden');
                    content.classList.toggle('md2flomo-content-visible');
                    toggleButton.textContent = isHidden ? '▼' : '▶';
                    toggleButton.setAttribute('aria-expanded', String(isHidden));
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
                this.selectedNotes.add(file.filePath);
            } else {
                this.selectedNotes.delete(file.filePath);
            }

            const checkbox = this.checkboxMap.get(file.filePath);
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
        const toggleButton = header.createEl('span', { cls: 'md2flomo-category-toggle md2flomo-toggle-expanded', attr: { 'aria-expanded': 'true', role: 'button' } });
        header.createEl('h3', { text: title });

        const contentContainer = section.createDiv({ cls: 'md2flomo-category-content md2flomo-content-visible' });
        contentContainer.setAttr('data-category', type);

        header.addEventListener('click', () => {
            const isExpanded = contentContainer.classList.contains('md2flomo-content-visible');
            if (isExpanded) {
                contentContainer.classList.remove('md2flomo-content-visible');
                contentContainer.classList.add('md2flomo-content-hidden');
                toggleButton.classList.remove('md2flomo-toggle-expanded');
                toggleButton.classList.add('md2flomo-toggle-collapsed');
                toggleButton.setAttribute('aria-expanded', 'false');
            } else {
                contentContainer.classList.remove('md2flomo-content-hidden');
                contentContainer.classList.add('md2flomo-content-visible');
                toggleButton.classList.remove('md2flomo-toggle-collapsed');
                toggleButton.classList.add('md2flomo-toggle-expanded');
                toggleButton.setAttribute('aria-expanded', 'true');
            }
        });
    }

    async publishSelectedNotes(publishButton: HTMLButtonElement) {
        if (this.selectedNotes.size === 0) {
            new Notice('❌ 请先选择要发布的笔记');
            return;
        }

        const filePaths = Array.from(this.selectedNotes);
        const totalCount = filePaths.length;
        let successCount = 0;
        let failedCount = 0;

        for (let i = 0; i < filePaths.length; i++) {
            if (this.cancelRequested) {
                break;
            }

            const filePath = filePaths[i];
            const noteItem = this.noteItems.find(item => item.filePath === filePath);
            if (!noteItem) continue;

            try {
                const noteContent = await this.app.vault.cachedRead(noteItem.file);
                const contentToSend = buildContentToSend(noteContent, noteItem.file.basename, noteItem.tags, noteItem.aliases);
                const result = await sendToFlomo(contentToSend, this.plugin.settings.flomoApiUrl);

                if (result.success) {
                    successCount++;
                    await updateSendFlomoStatus(this.app, noteItem.file, true);
                    const updatedContent = await this.app.vault.read(noteItem.file);
                    await markAsPublished(this.plugin, filePath, updatedContent);
                } else {
                    failedCount++;
                    console.warn(`发布笔记 ${filePath} 失败: ${result.error}`);
                }
            } catch (error) {
                console.error(`发布笔记 ${filePath} 时出错:`, error);
                failedCount++;
            }

            publishButton.setText(`发布中 ${i + 1}/${totalCount}...`);
        }

        if (this.cancelRequested) {
            await this.plugin.saveSettings();
            new Notice(`已取消发布（成功 ${successCount}，失败 ${failedCount}）`);
            publishButton.disabled = false;
            publishButton.setText('发布选中');
            await this.loadNotes();
        } else {
            await this.plugin.saveSettings();
            new Notice(`发布完成：成功 ${successCount} 篇，失败 ${failedCount} 篇`);
            publishButton.disabled = false;
            publishButton.setText('发布选中');
            await this.loadNotes();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

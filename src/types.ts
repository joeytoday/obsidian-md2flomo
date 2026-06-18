import { TFile } from 'obsidian';

// 插件设置接口
export interface Md2FlomoSettings {
    flomoApiUrl: string;
    publishedNotes: Record<string, PublishedNoteRecord>;
    hasShownApiReminder: boolean;
}

// 已发布笔记记录
export interface PublishedNoteRecord {
    timestamp: number;
    contentHash: string;
}

// 发送结果
export interface SendResult {
    success: boolean;
    error?: string;
}

// 笔记项接口
export interface NoteItem {
    file: TFile;
    content: string;
    tags: string[];
    sendFlomo: boolean;
    filePath: string;
    directoryPath: string;
    isPublished: boolean;
    aliases?: string | string[];
}

// 目录树节点接口
export interface TreeNode {
    files: NoteItem[];
    subfolders: Record<string, TreeNode>;
}

// 插件接口（解耦模态框/设置对 main.ts 的循环依赖）
export interface IFlomoPlugin {
    settings: Md2FlomoSettings;
    saveSettings(): Promise<void>;
}

// 默认设置
export const DEFAULT_SETTINGS: Md2FlomoSettings = {
    flomoApiUrl: '',
    publishedNotes: {},
    hasShownApiReminder: false
};

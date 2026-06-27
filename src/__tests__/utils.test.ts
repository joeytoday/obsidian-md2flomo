import { describe, it, expect } from 'vitest';
import {
    extractTagsFromFrontmatter,
    removeFrontmatter,
    removeMarkdownFormatting,
    buildContentToSend,
    calculateContentHash,
    buildDirectoryTree,
} from '../utils';
import type { NoteItem, TreeNode } from '../types';

describe('extractTagsFromFrontmatter', () => {
    it('应提取数组类型的 tags', () => {
        const content = '---\ntags:\n  - obsidian\n  - flomo\n---\n正文内容';
        const result = extractTagsFromFrontmatter(content);
        expect(result.tags).toEqual(['obsidian', 'flomo']);
    });

    it('应提取字符串类型的 tag', () => {
        const content = '---\ntags: single-tag\n---\n正文';
        const result = extractTagsFromFrontmatter(content);
        expect(result.tags).toEqual(['single-tag']);
    });

    it('应提取 send-flomo 状态', () => {
        const content = '---\nsend-flomo: true\n---\n正文';
        const result = extractTagsFromFrontmatter(content);
        expect(result.sendFlomo).toBe(true);
    });

    it('send-flomo 默认为 false', () => {
        const content = '---\ntags: test\n---\n正文';
        const result = extractTagsFromFrontmatter(content);
        expect(result.sendFlomo).toBe(false);
    });

    it('应提取 aliases', () => {
        const content = '---\naliases:\n  - alias1\n  - alias2\n---\n正文';
        const result = extractTagsFromFrontmatter(content);
        expect(result.aliases).toEqual(['alias1', 'alias2']);
    });

    it('无 frontmatter 时返回空值', () => {
        const content = '没有 frontmatter 的正文';
        const result = extractTagsFromFrontmatter(content);
        expect(result.tags).toEqual([]);
        expect(result.sendFlomo).toBe(false);
        expect(result.aliases).toBeUndefined();
    });

    it('兼容 Windows \\r\\n 换行', () => {
        const content = '---\r\ntags:\r\n  - win-tag\r\n---\r\n正文';
        const result = extractTagsFromFrontmatter(content);
        expect(result.tags).toEqual(['win-tag']);
    });

    it('YAML 语法错误时不崩溃', () => {
        const content = '---\n: invalid: yaml: [\n---\n正文';
        const result = extractTagsFromFrontmatter(content);
        expect(result.tags).toEqual([]);
    });
});

describe('removeFrontmatter', () => {
    it('应移除标准 frontmatter', () => {
        const content = '---\ntags: test\n---\n正文内容';
        expect(removeFrontmatter(content)).toBe('正文内容');
    });

    it('无 frontmatter 时原样返回', () => {
        const content = '纯正文';
        expect(removeFrontmatter(content)).toBe('纯正文');
    });

    it('兼容 Windows \\r\\n 换行', () => {
        const content = '---\r\ntags: test\r\n---\r\n正文';
        expect(removeFrontmatter(content)).toBe('正文');
    });
});

describe('removeMarkdownFormatting', () => {
    it('应移除加粗', () => {
        expect(removeMarkdownFormatting('**加粗文字**')).toBe('加粗文字');
    });

    it('应移除斜体', () => {
        expect(removeMarkdownFormatting('*斜体文字*')).toBe('斜体文字');
    });

    it('应移除下划线斜体', () => {
        expect(removeMarkdownFormatting('_斜体文字_')).toBe('斜体文字');
    });

    it('无格式文本原样返回', () => {
        expect(removeMarkdownFormatting('普通文本')).toBe('普通文本');
    });

    it('应移除单字符斜体', () => {
        expect(removeMarkdownFormatting('*a*')).toBe('a');
        expect(removeMarkdownFormatting('_a_')).toBe('a');
    });

    it('不移除空格开头的斜体标记', () => {
        expect(removeMarkdownFormatting('* 空格开头*')).toBe('* 空格开头*');
        expect(removeMarkdownFormatting('*空格结尾 *')).toBe('*空格结尾 *');
    });

    it('应处理嵌套加粗斜体', () => {
        expect(removeMarkdownFormatting('***加粗斜体***')).toBe('加粗斜体');
    });

    it('空字符串返回空', () => {
        expect(removeMarkdownFormatting('')).toBe('');
    });
});

describe('buildContentToSend', () => {
    it('应拼接文件名 + 内容 + tags', () => {
        const result = buildContentToSend('正文内容', '测试笔记', ['tag1', 'tag2']);
        expect(result).toContain('测试笔记');
        expect(result).toContain('正文内容');
        expect(result).toContain('#tag1');
        expect(result).toContain('#tag2');
    });

    it('应处理字符串类型的 aliases', () => {
        const result = buildContentToSend('正文', '笔记', [], '别名1');
        expect(result).toContain('别名：别名1');
    });

    it('应处理数组类型的 aliases', () => {
        const result = buildContentToSend('正文', '笔记', [], ['别名1', '别名2']);
        expect(result).toContain('别名：别名1、别名2');
    });

    it('应移除 frontmatter 后再发送', () => {
        const content = '---\ntags: test\n---\n正文';
        const result = buildContentToSend(content, '笔记', ['test']);
        expect(result).not.toContain('---');
    });

    it('应压缩多余空行', () => {
        const content = '第一段\n\n\n\n\n第二段';
        const result = buildContentToSend(content, '笔记', []);
        expect(result).not.toContain('\n\n\n');
    });
});

describe('calculateContentHash', () => {
    it('空字符串返回 "0"', () => {
        expect(calculateContentHash('')).toBe('0');
    });

    it('相同内容返回相同哈希', () => {
        expect(calculateContentHash('测试')).toBe(calculateContentHash('测试'));
    });

    it('不同内容大概率返回不同哈希', () => {
        expect(calculateContentHash('abc')).not.toBe(calculateContentHash('def'));
    });
});

describe('buildDirectoryTree', () => {
    it('空路径时将文件添加到当前节点', () => {
        const tree: TreeNode = { files: [], subfolders: {} };
        const note = { filePath: 'test.md' } as NoteItem;
        buildDirectoryTree(note, [], tree);
        expect(tree.files).toHaveLength(1);
        expect(tree.files[0]).toBe(note);
    });

    it('单级路径应创建子文件夹', () => {
        const tree: TreeNode = { files: [], subfolders: {} };
        const note = { filePath: 'folder/test.md' } as NoteItem;
        buildDirectoryTree(note, ['folder'], tree);
        expect(tree.subfolders['folder']).toBeDefined();
        expect(tree.subfolders['folder'].files).toHaveLength(1);
    });

    it('多级路径应递归创建', () => {
        const tree: TreeNode = { files: [], subfolders: {} };
        const note = { filePath: 'a/b/c/test.md' } as NoteItem;
        buildDirectoryTree(note, ['a', 'b', 'c'], tree);
        expect(tree.subfolders['a'].subfolders['b'].subfolders['c'].files).toHaveLength(1);
    });
});

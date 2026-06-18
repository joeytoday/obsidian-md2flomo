import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { IFlomoPlugin } from './types';
import { sendToFlomo } from './api';

export class Md2FlomoSettingTab extends PluginSettingTab {
    plugin: IFlomoPlugin;

    constructor(app: App, plugin: Plugin & IFlomoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();
        containerEl.createEl('h2', { text: 'md2flomo 插件设置' });

        new Setting(containerEl)
            .setName('flomo API')
            .setDesc('请输入完整的 flomo API 地址（包含 token 信息）')
            .addText(text => {
                text.inputEl.type = 'password';
                text
                    .setPlaceholder('https://flomoapp.com/iwh/...')
                    .setValue(this.plugin.settings.flomoApiUrl)
                    .onChange(async (value) => {
                        this.plugin.settings.flomoApiUrl = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('发送测试内容到flomo')
            .setDesc('点击此按钮发送一条测试内容到flomo，用于验证API连接是否正常')
            .addButton(button => button
                .setButtonText('发送测试')
                .onClick(async () => {
                    const testContent = `**测试笔记**\n\n这是一条通过md2flomo插件发送的测试笔记。\n\n标签：#测试 #md2flomo`;
                    new Notice('正在发送测试内容到flomo...');
                    const result = await sendToFlomo(testContent, this.plugin.settings.flomoApiUrl);
                    if (result.success) {
                        new Notice('✅ 测试内容发送成功，请检查flomo是否收到');
                    } else {
                        new Notice(`❌ 测试内容发送失败: ${result.error}`);
                    }
                }));

        const helpEl = containerEl.createEl('div', { cls: 'md2flomo-help' });
        helpEl.createEl('h3', { text: '使用说明' });
        helpEl.createEl('p', { text: '1. 打开一个Markdown文件' });
        helpEl.createEl('p', { text: '2. 点击侧边栏的「导入到flomo」图标，或者使用命令面板' });
        helpEl.createEl('p', { text: '3. 确认内容后点击「确认发布」' });
        helpEl.createEl('p', { text: '4. 发布成功后会显示提示消息' });
        helpEl.createEl('p', { text: '注意：文件中的YAML front matter中的tags会被提取并添加到内容末尾。' });
        helpEl.createEl('p', { text: '常见问题排查：' });
        helpEl.createEl('p', { text: '- 检查API URL是否正确（确保包含完整的token信息）' });
        helpEl.createEl('p', { text: '- 确保flomo API权限正确' });
        helpEl.createEl('p', { text: '- 查看浏览器控制台获取详细日志' });
    }
}

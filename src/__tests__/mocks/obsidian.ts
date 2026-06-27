// Obsidian API mock for vitest

export class Notice {
    constructor(public message: string) {}
}

export class Modal {
    constructor(public app: any) {}
    onOpen() {}
    onClose() {}
    open() {}
    close() {}
}

export class MarkdownView {
    file: any = null;
}

export class TFile {
    path: string;
    basename: string;
    parent: any;
    constructor(path = 'test.md') {
        this.path = path;
        this.basename = path.split('/').pop()?.replace('.md', '') || 'test';
        this.parent = { path: path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '' };
    }
}

export class Plugin {
    app: any;
    settings: any;
    async loadData() { return {}; }
    async saveData(data: any) {}
    addRibbonIcon() {}
    addCommand() {}
    addSettingTab() {}
}

export class PluginSettingTab {
    constructor(public app: any, public plugin: any) {}
    display() {}
    hide() {}
}

export class Setting {
    constructor(public containerEl: any) {}
    setName() { return this; }
    setDesc() { return this; }
    addText() { return this; }
    addButton() { return this; }
}

export const App = class {
    vault = {
        read: async () => '',
        cachedRead: async () => '',
        modify: async () => {},
        getMarkdownFiles: () => [],
    };
    workspace = {
        getActiveViewOfType: () => null,
    };
};

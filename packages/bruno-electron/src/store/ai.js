const Store = require('electron-store');
const { encryptStringSafe, decryptStringSafe } = require('../utils/encryption');

const DEFAULT_MODEL = 'gpt-5.5';
const DEFAULT_PROVIDER = 'openai';
const PROVIDERS = new Set(['openai', 'codex-cli']);

class AiStore {
  constructor() {
    this.store = new Store({
      name: 'ai',
      clearInvalidConfig: true
    });
  }

  getModel() {
    return this.store.get('model') || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  }

  getProvider() {
    const provider = this.store.get('provider') || DEFAULT_PROVIDER;
    return PROVIDERS.has(provider) ? provider : DEFAULT_PROVIDER;
  }

  setProvider(provider) {
    const nextProvider = PROVIDERS.has(provider) ? provider : DEFAULT_PROVIDER;
    this.store.set('provider', nextProvider);
    return nextProvider;
  }

  setModel(model) {
    const nextModel = String(model || '').trim() || DEFAULT_MODEL;
    this.store.set('model', nextModel);
    return nextModel;
  }

  getStoredApiKey() {
    const encryptedApiKey = this.store.get('openaiApiKey');

    if (!encryptedApiKey) {
      return '';
    }

    return decryptStringSafe(encryptedApiKey).value || '';
  }

  getApiKey() {
    return this.getStoredApiKey() || process.env.OPENAI_API_KEY || '';
  }

  setApiKey(apiKey) {
    const nextApiKey = String(apiKey || '').trim();

    if (!nextApiKey) {
      return;
    }

    this.store.set('openaiApiKey', encryptStringSafe(nextApiKey).value);
  }

  clearApiKey() {
    this.store.delete('openaiApiKey');
  }

  getCodexCliPath() {
    return this.store.get('codexCliPath') || process.env.CODEX_CLI_PATH || '';
  }

  setCodexCliPath(codexCliPath) {
    const nextPath = String(codexCliPath || '').trim();

    if (nextPath) {
      this.store.set('codexCliPath', nextPath);
      return nextPath;
    }

    this.store.delete('codexCliPath');
    return '';
  }

  getCodexModel() {
    return this.store.get('codexModel') || process.env.CODEX_MODEL || '';
  }

  setCodexModel(codexModel) {
    const nextModel = String(codexModel || '').trim();

    if (nextModel) {
      this.store.set('codexModel', nextModel);
      return nextModel;
    }

    this.store.delete('codexModel');
    return '';
  }

  getStatus() {
    const storedApiKey = this.getStoredApiKey();
    const envApiKey = process.env.OPENAI_API_KEY || '';
    const apiKey = storedApiKey || envApiKey;
    const provider = this.getProvider();
    const openai = {
      enabled: Boolean(apiKey),
      hasStoredApiKey: Boolean(storedApiKey),
      hasEnvApiKey: Boolean(envApiKey),
      keySource: storedApiKey ? 'stored' : envApiKey ? 'env' : null,
      keyPreview: apiKey ? `...${apiKey.slice(-4)}` : '',
      model: this.getModel()
    };
    const codexCli = {
      configuredPath: this.getCodexCliPath(),
      model: this.getCodexModel()
    };

    return {
      provider,
      enabled: provider === 'openai' ? openai.enabled : false,
      model: provider === 'openai' ? openai.model : codexCli.model,
      hasStoredApiKey: openai.hasStoredApiKey,
      hasEnvApiKey: openai.hasEnvApiKey,
      keySource: openai.keySource,
      keyPreview: openai.keyPreview,
      openai,
      codexCli
    };
  }

  saveSettings({ provider, apiKey, model, codexCliPath, codexModel }) {
    this.setProvider(provider);

    if (apiKey) {
      this.setApiKey(apiKey);
    }

    this.setModel(model);
    this.setCodexCliPath(codexCliPath);
    this.setCodexModel(codexModel);
    return this.getStatus();
  }
}

module.exports = {
  AiStore,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER
};

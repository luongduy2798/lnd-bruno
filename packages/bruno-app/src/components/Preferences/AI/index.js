import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { IconDeviceFloppy, IconKey, IconRefresh, IconTerminal2, IconTrash } from '@tabler/icons';
import Button from 'ui/Button';
import StyledWrapper from './StyledWrapper';

const DEFAULT_MODEL = 'gpt-5.5';
const DEFAULT_PROVIDER = 'openai';
const AUTO_CLI_OPTION = '__auto__';
const CUSTOM_CLI_OPTION = '__custom__';

const getCodexCliCandidateLabel = (candidate = {}) => {
  const version = candidate.version || 'Unknown version';
  const source = candidate.sourceLabel || candidate.source || 'Detected';

  return `${version} - ${source} - ${candidate.path}`;
};

const AI = () => {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [codexCliPath, setCodexCliPath] = useState('');
  const [codexCliCandidates, setCodexCliCandidates] = useState([]);
  const [codexModel, setCodexModel] = useState('');
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingCli, setIsCheckingCli] = useState(false);
  const [isLoadingCliCandidates, setIsLoadingCliCandidates] = useState(false);
  const [error, setError] = useState('');
  const hasIpc = Boolean(window.ipcRenderer?.invoke);

  const refreshCodexCliCandidates = async (configuredPath = '') => {
    if (!hasIpc) {
      return [];
    }

    setIsLoadingCliCandidates(true);

    try {
      const candidates = await window.ipcRenderer.invoke(
        'renderer:ai:list-codex-cli-candidates',
        configuredPath
      );
      const nextCandidates = Array.isArray(candidates) ? candidates : [];
      setCodexCliCandidates(nextCandidates);
      return nextCandidates;
    } catch {
      setCodexCliCandidates([]);
      return [];
    } finally {
      setIsLoadingCliCandidates(false);
    }
  };

  const loadStatus = async () => {
    if (!hasIpc) {
      setIsLoading(false);
      setError('AI settings are only available in the Electron app.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const nextStatus = await window.ipcRenderer.invoke('renderer:ai:status');
      setStatus(nextStatus);
      setProvider(nextStatus?.provider || DEFAULT_PROVIDER);
      setModel(nextStatus?.openai?.model || nextStatus?.model || DEFAULT_MODEL);
      setCodexCliPath(nextStatus?.codexCli?.configuredPath || '');
      setCodexModel(nextStatus?.codexCli?.model || '');
      await refreshCodexCliCandidates(nextStatus?.codexCli?.configuredPath || '');
    } catch (statusError) {
      setError(statusError?.message || 'Failed to load AI settings.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const selectProvider = (nextProvider) => {
    setProvider(nextProvider);
    setError('');
  };

  const openAiStatusText = useMemo(() => {
    if (isLoading) {
      return 'Loading AI settings...';
    }

    if (error) {
      return error;
    }

    const openai = status?.openai || status;

    if (openai?.keySource === 'stored') {
      return `Saved API key ${openai.keyPreview || ''} is active.`;
    }

    if (openai?.keySource === 'env') {
      return `Using OPENAI_API_KEY from environment ${openai.keyPreview || ''}.`;
    }

    return 'No API key configured.';
  }, [error, isLoading, status]);

  const codexCliStatusText = useMemo(() => {
    if (isLoading) {
      return 'Loading Codex CLI settings...';
    }

    const cli = status?.codexCli || {};

    if (cli.found && cli.loggedIn) {
      const source = cli.sourceLabel ? ` (${cli.sourceLabel})` : '';
      return `Codex CLI ready${cli.version ? `: ${cli.version}` : ''}${cli.path ? ` at ${cli.path}` : ''}${source}.`;
    }

    if (cli.found && !cli.loggedIn) {
      return 'Codex CLI found but not logged in. Run `codex login` in your terminal.';
    }

    return cli.error || 'Codex CLI not found. Install Codex or set a custom CLI path.';
  }, [isLoading, status]);

  const selectedCodexCliOption = useMemo(() => {
    const currentPath = codexCliPath.trim();

    if (!currentPath) {
      return AUTO_CLI_OPTION;
    }

    if (codexCliCandidates.some((candidate) => candidate.path === currentPath)) {
      return currentPath;
    }

    return CUSTOM_CLI_OPTION;
  }, [codexCliCandidates, codexCliPath]);

  const selectCodexCliOption = (event) => {
    const nextOption = event.target.value;
    setError('');

    if (nextOption === AUTO_CLI_OPTION) {
      setCodexCliPath('');
      return;
    }

    if (nextOption === CUSTOM_CLI_OPTION) {
      if (selectedCodexCliOption !== CUSTOM_CLI_OPTION) {
        setCodexCliPath('');
      }
      return;
    }

    setCodexCliPath(nextOption);
  };

  const saveSettings = async (event) => {
    event.preventDefault();

    if (!hasIpc) {
      setError('AI settings are only available in the Electron app.');
      return;
    }

    if (provider === 'openai' && !apiKey.trim() && !status?.openai?.enabled) {
      setError('OpenAI API Key is required.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const nextStatus = await window.ipcRenderer.invoke('renderer:ai:save-settings', {
        provider,
        apiKey: apiKey.trim(),
        model: model.trim() || DEFAULT_MODEL,
        codexCliPath: codexCliPath.trim(),
        codexModel: codexModel.trim()
      });

      setStatus(nextStatus);
      setProvider(nextStatus?.provider || DEFAULT_PROVIDER);
      setModel(nextStatus?.openai?.model || DEFAULT_MODEL);
      setCodexCliPath(nextStatus?.codexCli?.configuredPath || '');
      setCodexModel(nextStatus?.codexCli?.model || '');
      setApiKey('');
      await refreshCodexCliCandidates(nextStatus?.codexCli?.configuredPath || '');
      toast.success('AI settings saved');
    } catch (saveError) {
      setError(saveError?.message || 'Failed to save AI settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const clearApiKey = async () => {
    if (!hasIpc) {
      setError('AI settings are only available in the Electron app.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const nextStatus = await window.ipcRenderer.invoke('renderer:ai:clear-api-key');
      setStatus(nextStatus);
      setApiKey('');
      toast.success('Saved API key cleared');
    } catch (clearError) {
      setError(clearError?.message || 'Failed to clear API key.');
    } finally {
      setIsSaving(false);
    }
  };

  const checkCodexCli = async () => {
    if (!hasIpc) {
      setError('AI settings are only available in the Electron app.');
      return;
    }

    setIsCheckingCli(true);
    setError('');

    try {
      const cliStatus = await window.ipcRenderer.invoke('renderer:ai:check-codex-cli', codexCliPath.trim());
      setStatus((currentStatus) => ({
        ...currentStatus,
        codexCli: {
          ...(currentStatus?.codexCli || {}),
          ...cliStatus,
          configuredPath: codexCliPath.trim()
        }
      }));
      await refreshCodexCliCandidates(codexCliPath.trim());

      if (cliStatus.found && cliStatus.loggedIn) {
        toast.success('Codex CLI is ready');
        return;
      }

      toast.error(cliStatus.error || 'Codex CLI is not ready');
    } catch (checkError) {
      setError(checkError?.message || 'Failed to check Codex CLI.');
    } finally {
      setIsCheckingCli(false);
    }
  };

  return (
    <StyledWrapper className="w-full">
      <div className="section-header">AI Settings</div>
      <form className="bruno-form ai-settings-form" onSubmit={saveSettings}>
        <div className="ai-provider-group">
          <label className={`ai-provider-option ${provider === 'openai' ? 'active' : ''}`}>
            <input
              type="radio"
              name="aiProvider"
              value="openai"
              checked={provider === 'openai'}
              onChange={() => selectProvider('openai')}
              disabled={isLoading || isSaving || !hasIpc}
            />
            <span className="ai-provider-icon"><IconKey size={16} strokeWidth={2} /></span>
            OpenAI API
          </label>
          <label className={`ai-provider-option ${provider === 'codex-cli' ? 'active' : ''}`}>
            <input
              type="radio"
              name="aiProvider"
              value="codex-cli"
              checked={provider === 'codex-cli'}
              onChange={() => selectProvider('codex-cli')}
              disabled={isLoading || isSaving || !hasIpc}
            />
            <span className="ai-provider-icon"><IconTerminal2 size={16} strokeWidth={2} /></span>
            Codex CLI
          </label>
        </div>

        <section className={`ai-provider-section ${provider === 'openai' ? 'active' : ''}`}>
          <div className="ai-section-title">OpenAI API</div>
          <div className={`ai-status ${error && provider === 'openai' ? 'error' : ''}`}>{provider === 'openai' && error ? error : openAiStatusText}</div>

          <div className="ai-field">
            <div className="ai-label-row">
              <label className="block select-none" htmlFor="openaiApiKey">
                OpenAI API Key
              </label>
            </div>
            <input
              id="openaiApiKey"
              type="password"
              name="openaiApiKey"
              className="textbox w-full mousetrap"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              placeholder={status?.openai?.enabled ? 'Leave blank to keep current key' : 'sk-...'}
              value={apiKey}
              disabled={isLoading || isSaving || !hasIpc}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <div className="ai-help">
              The key is encrypted and stored by Electron. It is not saved in collection files.
            </div>
          </div>

          <div className="ai-field">
            <label className="block select-none" htmlFor="openaiModel">
              Model
            </label>
            <input
              id="openaiModel"
              type="text"
              name="openaiModel"
              className="textbox w-full mousetrap"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              value={model}
              disabled={isLoading || isSaving || !hasIpc}
              onChange={(event) => setModel(event.target.value)}
            />
          </div>
        </section>

        <section className={`ai-provider-section ${provider === 'codex-cli' ? 'active' : ''}`}>
          <div className="ai-section-title">Codex CLI</div>
          <div className={`ai-status ${error && provider === 'codex-cli' ? 'error' : ''}`}>
            {provider === 'codex-cli' && error ? error : codexCliStatusText}
          </div>

          <div className="ai-field">
            <label className="block select-none" htmlFor="codexCliVersion">
              CLI Version
            </label>
            <select
              id="codexCliVersion"
              name="codexCliVersion"
              className="textbox w-full mousetrap ai-select"
              value={selectedCodexCliOption}
              disabled={isLoading || isSaving || !hasIpc}
              onChange={selectCodexCliOption}
            >
              <option value={AUTO_CLI_OPTION}>Auto-detect Codex CLI</option>
              {isLoadingCliCandidates && (
                <option value="__loading__" disabled>
                  Loading detected versions...
                </option>
              )}
              {!isLoadingCliCandidates && codexCliCandidates.length === 0 && (
                <option value="__empty__" disabled>
                  No detected Codex CLI versions
                </option>
              )}
              {codexCliCandidates.map((candidate) => (
                <option key={candidate.path} value={candidate.path}>
                  {getCodexCliCandidateLabel(candidate)}
                </option>
              ))}
              <option value={CUSTOM_CLI_OPTION}>Custom path...</option>
            </select>
            <div className="ai-help">
              Auto-detect checks PATH and local Node installs before the VS Code extension.
            </div>
          </div>

          <div className="ai-field">
            <label className="block select-none" htmlFor="codexCliPath">
              CLI Path
            </label>
            <input
              id="codexCliPath"
              type="text"
              name="codexCliPath"
              className="textbox w-full mousetrap"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              placeholder="Auto-detect codex"
              value={codexCliPath}
              disabled={isLoading || isSaving || !hasIpc}
              onChange={(event) => setCodexCliPath(event.target.value)}
            />
            <div className="ai-help">
              Leave blank to auto-detect `codex`, choose a detected version above, or paste a full executable path.
            </div>
          </div>

          <div className="ai-field">
            <label className="block select-none" htmlFor="codexModel">
              CLI Model
            </label>
            <input
              id="codexModel"
              type="text"
              name="codexModel"
              className="textbox w-full mousetrap"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              placeholder="Leave blank to use Codex default"
              value={codexModel}
              disabled={isLoading || isSaving || !hasIpc}
              onChange={(event) => setCodexModel(event.target.value)}
            />
          </div>

          <div className="ai-actions secondary">
            <Button
              size="sm"
              color="secondary"
              variant="outline"
              icon={<IconRefresh size={16} strokeWidth={2} />}
              onClick={checkCodexCli}
              loading={isCheckingCli}
              disabled={isLoading || isSaving || isCheckingCli || !hasIpc}
            >
              Check CLI
            </Button>
          </div>
        </section>

        <div className="ai-actions">
          <Button
            size="sm"
            color="primary"
            icon={<IconDeviceFloppy size={16} strokeWidth={2} />}
            type="submit"
            loading={isSaving}
            disabled={isLoading || isSaving || !hasIpc}
          >
            Save
          </Button>
          <Button
            size="sm"
            color="danger"
            variant="outline"
            icon={<IconTrash size={16} strokeWidth={2} />}
            onClick={clearApiKey}
            disabled={isLoading || isSaving || !status?.openai?.hasStoredApiKey || !hasIpc}
          >
            Clear Saved Key
          </Button>
        </div>
      </form>
    </StyledWrapper>
  );
};

export default AI;

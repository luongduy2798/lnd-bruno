require('dotenv').config();

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { ipcMain } = require('electron');
const OpenAI = require('openai');
const { AiStore } = require('../store/ai');

const MAX_CONTEXT_CHARS = 20000;
const MAX_MESSAGE_CHARS = 8000;
const MAX_MESSAGES = 12;
const CODEX_TIMEOUT_MS = 120000;
const CODEX_MAX_BUFFER = 1024 * 1024 * 10;
const CODEX_STATUS_CACHE_TTL_MS = 60_000;
const CODEX_STATUS_ERROR_CACHE_TTL_MS = 5_000;
const AI_PROGRESS_CHANNEL = 'main:ai:generate-tests:progress';

const OpenAIClient = OpenAI.OpenAI || OpenAI.default || OpenAI;
const aiStore = new AiStore();
let codexCliStatusCache = {
  key: '',
  status: null,
  expiresAt: 0
};

const TEST_GENERATION_INSTRUCTIONS = [
  'You are an AI assistant integrated inside the Bruno API client.',
  'Generate Bruno request Tests JavaScript and a short analysis summary.',
  'Use Bruno-compatible syntax in the tests field: test("...", function () { ... });, expect(...), res, req, and bru.',
  'Prefer res.status and res.getBody() for response assertions.',
  'Analysis must be short, practical, and high-level. Do not reveal private reasoning or hidden chain-of-thought.',
  'Return valid JSON only with this shape: {"analysis":["short sentence","short sentence"],"tests":"full Bruno test script"}',
  'Do not include markdown fences, prose outside the JSON object, or imports.',
  'If the user asks for a follow-up change, return the complete updated test script in the tests field.'
].join('\n');

const truncate = (value, limit) => {
  const text = value === undefined || value === null ? '' : String(value);

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n...[truncated]`;
};

const stringifyContext = (context) => {
  try {
    return truncate(JSON.stringify(context || {}, null, 2), MAX_CONTEXT_CHARS);
  } catch (error) {
    return '{}';
  }
};

const normalizeMessages = (messages = []) => {
  return messages
    .filter((message) => message?.content)
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: truncate(message.content, MAX_MESSAGE_CHARS)
    }));
};

const extractOutputText = (response) => {
  if (response?.output_text) {
    return response.output_text;
  }

  return (response?.output || [])
    .flatMap((item) => item?.content || [])
    .map((content) => content?.text || '')
    .join('');
};

const buildInput = ({ context, messages }) => {
  const contextMessage = {
    role: 'user',
    content: `Current Bruno request context:\n${stringifyContext(context)}`
  };

  return [contextMessage, ...normalizeMessages(messages)];
};

const emitAiProgress = (mainWindow, requestId, message, state = 'running') => {
  if (!mainWindow?.webContents || !requestId) {
    return;
  }

  mainWindow.webContents.send(AI_PROGRESS_CHANNEL, {
    requestId,
    message,
    state,
    timestamp: Date.now()
  });
};

const stripCodeFences = (content = '') => {
  const text = String(content || '').trim();
  const fenceMatch
    = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i)
      || text.match(/```\s*([\s\S]*?)```/);
  return (fenceMatch ? fenceMatch[1] : text).trim();
};

const normalizeAnalysis = (analysis) => {
  if (Array.isArray(analysis)) {
    return analysis
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
  }

  if (typeof analysis === 'string') {
    return analysis
      .split('\n')
      .map((entry) => entry.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  }

  return [];
};

const extractJsonObject = (content = '') => {
  const stripped = stripCodeFences(content);

  if (!stripped) {
    return '';
  }

  if (stripped.startsWith('{') && stripped.endsWith('}')) {
    return stripped;
  }

  const startIndex = stripped.indexOf('{');
  const endIndex = stripped.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return stripped;
  }

  return stripped.slice(startIndex, endIndex + 1);
};

const parseAiGenerationResult = (content = '') => {
  const jsonCandidate = extractJsonObject(content);

  try {
    const parsed = JSON.parse(jsonCandidate);
    const tests = typeof parsed?.tests === 'string' ? parsed.tests.trim() : '';

    return {
      analysis: normalizeAnalysis(parsed?.analysis),
      tests: stripCodeFences(tests)
    };
  } catch (error) {
    return {
      analysis: [],
      tests: stripCodeFences(content)
    };
  }
};

const expandHomePath = (filePath = '') => {
  if (!filePath.startsWith('~')) {
    return filePath;
  }

  return path.join(os.homedir(), filePath.slice(1));
};

const isExecutableFile = (filePath) => {
  if (!filePath) {
    return false;
  }

  try {
    fs.accessSync(
      filePath,
      process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK
    );
    return fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
};

const getCodexBinaryNames = (binaryName = 'codex') =>
  process.platform === 'win32'
    ? [
        `${binaryName}.cmd`,
        `${binaryName}.exe`,
        `${binaryName}.bat`,
        binaryName
      ]
    : [binaryName];

const getPathCandidates = () => {
  const pathDirs = (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);
  const defaultDirs
    = process.platform === 'win32'
      ? []
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];

  return Array.from(new Set([...pathDirs, ...defaultDirs]));
};

const findExecutablesInPath = (binaryName) => {
  const binaryNames = getCodexBinaryNames(binaryName);
  const candidates = [];
  const seen = new Set();

  for (const dir of getPathCandidates()) {
    for (const name of binaryNames) {
      const candidate = path.join(dir, name);

      if (isExecutableFile(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        candidates.push(candidate);
      }
    }
  }

  return candidates;
};

const findExecutableInPath = (binaryName) =>
  findExecutablesInPath(binaryName)[0] || '';

const findCodexInNvmInstallations = () => {
  const versionsDir = path.join(os.homedir(), '.nvm', 'versions', 'node');

  if (!fs.existsSync(versionsDir)) {
    return [];
  }

  return fs
    .readdirSync(versionsDir)
    .filter((entry) =>
      isExecutableFile(path.join(versionsDir, entry, 'bin', 'codex'))
    )
    .sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
    )
    .map((entry) => path.join(versionsDir, entry, 'bin', 'codex'));
};

const findCodexInKnownLocations = () => [
  path.join(os.homedir(), '.volta', 'bin', 'codex'),
  path.join(os.homedir(), '.asdf', 'shims', 'codex'),
  path.join(os.homedir(), '.local', 'bin', 'codex'),
  path.join(os.homedir(), '.npm-global', 'bin', 'codex'),
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex'
].filter(isExecutableFile);

const findCodexInVscodeExtensions = () => {
  const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions');

  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensionDirs = fs
    .readdirSync(extensionsDir)
    .filter((entry) => entry.startsWith('openai.chatgpt-'))
    .sort()
    .reverse();
  const candidates = [];

  for (const extensionDir of extensionDirs) {
    const binDir = path.join(extensionsDir, extensionDir, 'bin');

    if (!fs.existsSync(binDir)) {
      continue;
    }

    const stack = [{ dir: binDir, depth: 0 }];

    while (stack.length) {
      const current = stack.pop();
      const entries = fs.readdirSync(current.dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(current.dir, entry.name);

        if (
          entry.isFile()
          && entry.name === 'codex'
          && isExecutableFile(entryPath)
        ) {
          candidates.push(entryPath);
        }

        if (entry.isDirectory() && current.depth < 3) {
          stack.push({ dir: entryPath, depth: current.depth + 1 });
        }
      }
    }
  }

  return candidates;
};

const getCodexSourceLabel = (source) => {
  switch (source) {
    case 'configured':
      return 'Configured path';
    case 'path':
      return 'PATH';
    case 'nvm':
      return 'NVM';
    case 'known-location':
      return 'Local install';
    case 'vscode-extension':
      return 'VS Code extension';
    default:
      return 'Detected';
  }
};

const addCodexCliCandidate = (candidates, seen, candidatePath, source) => {
  const normalizedPath = expandHomePath(String(candidatePath || '').trim());

  if (!isExecutableFile(normalizedPath)) {
    return;
  }

  let key = normalizedPath;

  try {
    key = fs.realpathSync(normalizedPath);
  } catch (error) {
    key = normalizedPath;
  }

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  candidates.push({
    path: normalizedPath,
    source,
    sourceLabel: getCodexSourceLabel(source)
  });
};

const collectCodexCliCandidates = (configuredPath = '') => {
  const candidates = [];
  const seen = new Set();
  const requestedPath = expandHomePath(String(configuredPath || '').trim());

  if (requestedPath) {
    if (!requestedPath.includes(path.sep)) {
      addCodexCliCandidate(
        candidates,
        seen,
        findExecutableInPath(requestedPath),
        'configured'
      );
    } else {
      addCodexCliCandidate(candidates, seen, requestedPath, 'configured');
    }
  }

  findExecutablesInPath('codex').forEach((candidate) =>
    addCodexCliCandidate(candidates, seen, candidate, 'path')
  );
  findCodexInNvmInstallations().forEach((candidate) =>
    addCodexCliCandidate(candidates, seen, candidate, 'nvm')
  );
  findCodexInKnownLocations().forEach((candidate) =>
    addCodexCliCandidate(candidates, seen, candidate, 'known-location')
  );
  findCodexInVscodeExtensions().forEach((candidate) =>
    addCodexCliCandidate(candidates, seen, candidate, 'vscode-extension')
  );

  return candidates;
};

const resolveCodexCliPath = (configuredPath = '') => {
  const requestedPath = expandHomePath(String(configuredPath || '').trim());

  if (requestedPath) {
    if (!requestedPath.includes(path.sep)) {
      const pathCandidate = findExecutableInPath(requestedPath);

      return {
        configuredPath,
        path: pathCandidate || requestedPath,
        found: Boolean(pathCandidate),
        source: 'configured'
      };
    }

    return {
      configuredPath,
      path: requestedPath,
      found: isExecutableFile(requestedPath),
      source: 'configured'
    };
  }

  const autoCandidate = collectCodexCliCandidates()[0];

  if (autoCandidate) {
    return {
      configuredPath: '',
      path: autoCandidate.path,
      found: true,
      source: autoCandidate.source
    };
  }

  return {
    configuredPath,
    path: '',
    found: false,
    source: null
  };
};

const normalizeCodexStatusCachePath = (filePath = '') => {
  const expandedPath = expandHomePath(String(filePath || '').trim());

  if (!expandedPath) {
    return '';
  }

  try {
    return fs.realpathSync(expandedPath);
  } catch (error) {
    return expandedPath;
  }
};

const getCodexStatusCacheKey = (configuredPath = '', resolvedPath = '') =>
  JSON.stringify([
    normalizeCodexStatusCachePath(configuredPath),
    normalizeCodexStatusCachePath(resolvedPath)
  ]);

const cloneCodexCliStatus = (status) =>
  status ? { ...status } : null;

const buildCodexEnv = (codexPath) => {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;

  if (codexPath) {
    env.PATH = [path.dirname(codexPath), env.PATH]
      .filter(Boolean)
      .join(path.delimiter);
  }

  return env;
};

const execFileWithInput = (file, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const { input, ...execOptions } = options;
    const child = execFile(
      file,
      args,
      {
        timeout: CODEX_TIMEOUT_MS,
        maxBuffer: CODEX_MAX_BUFFER,
        windowsHide: true,
        ...execOptions
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      }
    );

    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
};

const getCodexCliVersion = async (codexPath) => {
  try {
    const versionResult = await execFileWithInput(codexPath, ['--version'], {
      env: buildCodexEnv(codexPath),
      timeout: 5000,
      maxBuffer: 1024 * 256
    });

    return `${versionResult.stdout || versionResult.stderr}`.trim();
  } catch {
    return '';
  }
};

const getCodexCliCandidates = async (configuredPath = '') => {
  const candidates = collectCodexCliCandidates(configuredPath);

  return Promise.all(
    candidates.map(async (candidate) => ({
      ...candidate,
      version: await getCodexCliVersion(candidate.path)
    }))
  );
};

const getCodexCliStatus = async (configuredPath = '', options = {}) => {
  const resolved = resolveCodexCliPath(configuredPath);
  const cacheKey = getCodexStatusCacheKey(configuredPath, resolved.path);
  const now = Date.now();

  if (
    !options.forceRefresh
    && codexCliStatusCache.key === cacheKey
    && codexCliStatusCache.status
    && codexCliStatusCache.expiresAt > now
  ) {
    return cloneCodexCliStatus(codexCliStatusCache.status);
  }

  const status = {
    ...resolved,
    sourceLabel: getCodexSourceLabel(resolved.source),
    version: '',
    loggedIn: false,
    loginStatus: '',
    error: ''
  };

  if (!resolved.found) {
    status.error = configuredPath
      ? `Codex CLI not found at ${configuredPath}`
      : 'Codex CLI not found. Install Codex or set a custom CLI path.';
    codexCliStatusCache = {
      key: cacheKey,
      status: cloneCodexCliStatus(status),
      expiresAt: now + CODEX_STATUS_ERROR_CACHE_TTL_MS
    };
    return cloneCodexCliStatus(status);
  }

  try {
    const versionResult = await execFileWithInput(
      resolved.path,
      ['--version'],
      {
        env: buildCodexEnv(resolved.path)
      }
    );
    status.version = `${versionResult.stdout || versionResult.stderr}`.trim();
  } catch (error) {
    status.error = error?.message || 'Failed to run Codex CLI.';
    codexCliStatusCache = {
      key: cacheKey,
      status: cloneCodexCliStatus(status),
      expiresAt: Date.now() + CODEX_STATUS_ERROR_CACHE_TTL_MS
    };
    return cloneCodexCliStatus(status);
  }

  try {
    const loginResult = await execFileWithInput(
      resolved.path,
      ['login', 'status'],
      {
        env: buildCodexEnv(resolved.path)
      }
    );
    status.loginStatus = `${loginResult.stdout || loginResult.stderr}`.trim();
    status.loggedIn
      = /logged in/i.test(status.loginStatus)
        && !/not logged in|not signed in/i.test(status.loginStatus);
  } catch (error) {
    status.loginStatus = `${
      error?.stdout || error?.stderr || error?.message || ''
    }`.trim();
    status.error
      = 'Codex CLI is not logged in. Run `codex login` in your terminal.';
  }

  codexCliStatusCache = {
    key: cacheKey,
    status: cloneCodexCliStatus(status),
    expiresAt: Date.now() + (status.error ? CODEX_STATUS_ERROR_CACHE_TTL_MS : CODEX_STATUS_CACHE_TTL_MS)
  };

  return cloneCodexCliStatus(status);
};

const getAiStatus = async () => {
  const status = aiStore.getStatus();
  const codexCliStatus = await getCodexCliStatus(
    status.codexCli.configuredPath
  );
  const provider = status.provider;
  const providerEnabled
    = provider === 'openai'
      ? status.openai.enabled
      : codexCliStatus.found && codexCliStatus.loggedIn;

  return {
    ...status,
    enabled: providerEnabled,
    model: provider === 'openai' ? status.openai.model : status.codexCli.model,
    errorMessage:
      provider === 'openai'
        ? status.openai.enabled
          ? ''
          : 'Missing OpenAI API key. Add one in Preferences > AI.'
        : providerEnabled
          ? ''
          : codexCliStatus.error,
    codexCli: {
      ...status.codexCli,
      ...codexCliStatus
    }
  };
};

const buildCodexCliPrompt = ({ context, messages }) => {
  const conversation = normalizeMessages(messages)
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join('\n\n');

  return [
    TEST_GENERATION_INSTRUCTIONS,
    '',
    'Return the final answer as valid JSON only.',
    '',
    `Current Bruno request context:\n${stringifyContext(context)}`,
    conversation ? `Conversation:\n${conversation}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');
};

const runCodexCliGenerateTests = async (payload = {}, onProgress = () => {}) => {
  onProgress('Checking Codex CLI availability');
  const status = await getCodexCliStatus(aiStore.getCodexCliPath());

  if (!status.found) {
    throw new Error(status.error);
  }

  if (!status.loggedIn) {
    throw new Error(
      status.error
      || 'Codex CLI is not logged in. Run `codex login` in your terminal.'
    );
  }

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'bruno-ai-')
  );
  const outputFile = path.join(tempDir, 'last-message.txt');
  const args = [
    '--ask-for-approval',
    'never',
    'exec',
    '--sandbox',
    'read-only',
    '--ephemeral',
    '--skip-git-repo-check',
    '--color',
    'never',
    '--output-last-message',
    outputFile
  ];
  const codexModel = aiStore.getCodexModel();

  if (codexModel) {
    args.push('--model', codexModel);
  }

  args.push('-');

  try {
    onProgress('Starting local Codex CLI session');
    onProgress('Analyzing request, current tests, and latest response');
    const result = await execFileWithInput(status.path, args, {
      cwd: tempDir,
      env: buildCodexEnv(status.path),
      input: buildCodexCliPrompt(payload)
    });
    onProgress('Formatting final Bruno test script');
    const output = fs.existsSync(outputFile)
      ? await fs.promises.readFile(outputFile, 'utf8')
      : result.stdout;
    const parsed = parseAiGenerationResult(output);

    return {
      model: codexModel || status.version || 'codex-cli',
      analysis: parsed.analysis,
      tests: parsed.tests,
      message: output
    };
  } catch (error) {
    const detail = `${
      error?.stderr
      || error?.stdout
      || error?.message
      || 'Failed to run Codex CLI.'
    }`.trim();
    throw new Error(detail);
  } finally {
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const runOpenAiGenerateTests = async (payload = {}, onProgress = () => {}) => {
  onProgress('Checking OpenAI API settings');
  const apiKey = aiStore.getApiKey();

  if (!apiKey) {
    throw new Error(
      'Missing OpenAI API key. Add one in Preferences > AI or start Electron with OPENAI_API_KEY=...'
    );
  }

  const client = new OpenAIClient({ apiKey });
  const model = aiStore.getModel();

  try {
    onProgress(`Sending prompt to OpenAI API${model ? ` (${model})` : ''}`);
    onProgress('Analyzing request, current tests, and latest response');
    const response = await client.responses.create({
      model,
      instructions: TEST_GENERATION_INSTRUCTIONS,
      input: buildInput(payload),
      max_output_tokens: 2000,
      store: false
    });
    onProgress('Formatting final Bruno test script');
    const output = extractOutputText(response);
    const parsed = parseAiGenerationResult(output);

    return {
      model,
      analysis: parsed.analysis,
      tests: parsed.tests,
      message: output
    };
  } catch (error) {
    const detail = error?.message || 'Failed to generate Bruno tests.';
    throw new Error(detail);
  }
};

const registerAiIpc = (mainWindow) => {
  ipcMain.handle('renderer:ai:status', async () => getAiStatus());

  ipcMain.handle('renderer:ai:save-settings', async (_, settings = {}) => {
    aiStore.saveSettings(settings);
    return getAiStatus();
  });

  ipcMain.handle('renderer:ai:clear-api-key', async () => {
    aiStore.clearApiKey();
    return getAiStatus();
  });

  ipcMain.handle('renderer:ai:check-codex-cli', async (_, codexCliPath = '') =>
    getCodexCliStatus(codexCliPath, { forceRefresh: true })
  );

  ipcMain.handle(
    'renderer:ai:list-codex-cli-candidates',
    async (_, codexCliPath = aiStore.getCodexCliPath()) =>
      getCodexCliCandidates(codexCliPath)
  );

  ipcMain.handle('renderer:ai:generate-tests', async (_, payload = {}) => {
    const requestId = payload?.requestId || '';
    const onProgress = (message, state) =>
      emitAiProgress(mainWindow, requestId, message, state);

    onProgress('Preparing AI request');

    try {
      const result
        = aiStore.getProvider() === 'codex-cli'
          ? await runCodexCliGenerateTests(payload, onProgress)
          : await runOpenAiGenerateTests(payload, onProgress);

      onProgress('Tests are ready to review', 'success');
      return result;
    } catch (error) {
      onProgress(error?.message || 'Failed to generate tests.', 'error');
      throw error;
    }
  });
};

module.exports = registerAiIpc;

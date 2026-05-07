require("dotenv").config();

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { ipcMain } = require("electron");
const OpenAI = require("openai");
const { AiStore } = require("../store/ai");

const MAX_CONTEXT_CHARS = 20000;
const MAX_MESSAGE_CHARS = 8000;
const MAX_MESSAGES = 12;
const CODEX_TIMEOUT_MS = 120000;
const CODEX_MAX_BUFFER = 1024 * 1024 * 10;

const OpenAIClient = OpenAI.OpenAI || OpenAI.default || OpenAI;
const aiStore = new AiStore();

const TEST_GENERATION_INSTRUCTIONS = [
  "You are an AI assistant integrated inside the Bruno API client.",
  "Generate Bruno request Tests JavaScript only.",
  'Use Bruno-compatible syntax: test("...", function () { ... });, expect(...), res, req, and bru.',
  "Prefer res.status and res.getBody() for response assertions.",
  "Do not include markdown fences, explanations, imports, comments outside the test script, or surrounding text.",
  "If the user asks for a follow-up change, return the complete updated test script.",
].join("\n");

const truncate = (value, limit) => {
  const text = value === undefined || value === null ? "" : String(value);

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n...[truncated]`;
};

const stringifyContext = (context) => {
  try {
    return truncate(JSON.stringify(context || {}, null, 2), MAX_CONTEXT_CHARS);
  } catch (error) {
    return "{}";
  }
};

const normalizeMessages = (messages = []) => {
  return messages
    .filter((message) => message?.content)
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: truncate(message.content, MAX_MESSAGE_CHARS),
    }));
};

const extractOutputText = (response) => {
  if (response?.output_text) {
    return response.output_text;
  }

  return (response?.output || [])
    .flatMap((item) => item?.content || [])
    .map((content) => content?.text || "")
    .join("");
};

const buildInput = ({ context, messages }) => {
  const contextMessage = {
    role: "user",
    content: `Current Bruno request context:\n${stringifyContext(context)}`,
  };

  return [contextMessage, ...normalizeMessages(messages)];
};

const stripCodeFences = (content = "") => {
  const text = String(content || "").trim();
  const fenceMatch =
    text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i) ||
    text.match(/```\s*([\s\S]*?)```/);
  return (fenceMatch ? fenceMatch[1] : text).trim();
};

const expandHomePath = (filePath = "") => {
  if (!filePath.startsWith("~")) {
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
      process.platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK,
    );
    return fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
};

const getPathCandidates = () => {
  const pathDirs = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const defaultDirs =
    process.platform === "win32"
      ? []
      : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

  return Array.from(new Set([...pathDirs, ...defaultDirs]));
};

const findExecutableInPath = (binaryName) => {
  const binaryNames =
    process.platform === "win32"
      ? [
          `${binaryName}.cmd`,
          `${binaryName}.exe`,
          `${binaryName}.bat`,
          binaryName,
        ]
      : [binaryName];

  for (const dir of getPathCandidates()) {
    for (const name of binaryNames) {
      const candidate = path.join(dir, name);

      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return "";
};

const findCodexInVscodeExtensions = () => {
  const extensionsDir = path.join(os.homedir(), ".vscode", "extensions");

  if (!fs.existsSync(extensionsDir)) {
    return "";
  }

  const extensionDirs = fs
    .readdirSync(extensionsDir)
    .filter((entry) => entry.startsWith("openai.chatgpt-"))
    .sort()
    .reverse();

  for (const extensionDir of extensionDirs) {
    const binDir = path.join(extensionsDir, extensionDir, "bin");

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
          entry.isFile() &&
          entry.name === "codex" &&
          isExecutableFile(entryPath)
        ) {
          return entryPath;
        }

        if (entry.isDirectory() && current.depth < 3) {
          stack.push({ dir: entryPath, depth: current.depth + 1 });
        }
      }
    }
  }

  return "";
};

const resolveCodexCliPath = (configuredPath = "") => {
  const requestedPath = expandHomePath(String(configuredPath || "").trim());

  if (requestedPath) {
    if (!requestedPath.includes(path.sep)) {
      const pathCandidate = findExecutableInPath(requestedPath);

      return {
        configuredPath,
        path: pathCandidate || requestedPath,
        found: Boolean(pathCandidate),
        source: "configured",
      };
    }

    return {
      configuredPath,
      path: requestedPath,
      found: isExecutableFile(requestedPath),
      source: "configured",
    };
  }

  const pathCandidate = findExecutableInPath("codex");

  if (pathCandidate) {
    return {
      configuredPath: "",
      path: pathCandidate,
      found: true,
      source: "path",
    };
  }

  const vscodeCandidate = findCodexInVscodeExtensions();

  if (vscodeCandidate) {
    return {
      configuredPath: "",
      path: vscodeCandidate,
      found: true,
      source: "vscode-extension",
    };
  }

  return {
    configuredPath,
    path: "",
    found: false,
    source: null,
  };
};

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
        ...execOptions,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      },
    );

    if (input !== undefined) {
      child.stdin.end(input);
    }
  });
};

const getCodexCliStatus = async (configuredPath = "") => {
  const resolved = resolveCodexCliPath(configuredPath);
  const status = {
    ...resolved,
    version: "",
    loggedIn: false,
    loginStatus: "",
    error: "",
  };

  if (!resolved.found) {
    status.error = configuredPath
      ? `Codex CLI not found at ${configuredPath}`
      : "Codex CLI not found. Install Codex or set a custom CLI path.";
    return status;
  }

  try {
    const versionResult = await execFileWithInput(
      resolved.path,
      ["--version"],
      {
        env: buildCodexEnv(resolved.path),
      },
    );
    status.version = `${versionResult.stdout || versionResult.stderr}`.trim();
  } catch (error) {
    status.error = error?.message || "Failed to run Codex CLI.";
    return status;
  }

  try {
    const loginResult = await execFileWithInput(
      resolved.path,
      ["login", "status"],
      {
        env: buildCodexEnv(resolved.path),
      },
    );
    status.loginStatus = `${loginResult.stdout || loginResult.stderr}`.trim();
    status.loggedIn =
      /logged in/i.test(status.loginStatus) &&
      !/not logged in|not signed in/i.test(status.loginStatus);
  } catch (error) {
    status.loginStatus = `${
      error?.stdout || error?.stderr || error?.message || ""
    }`.trim();
    status.error =
      "Codex CLI is not logged in. Run `codex login` in your terminal.";
  }

  return status;
};

const getAiStatus = async () => {
  const status = aiStore.getStatus();
  const codexCliStatus = await getCodexCliStatus(
    status.codexCli.configuredPath,
  );
  const provider = status.provider;
  const providerEnabled =
    provider === "openai"
      ? status.openai.enabled
      : codexCliStatus.found && codexCliStatus.loggedIn;

  return {
    ...status,
    enabled: providerEnabled,
    model: provider === "openai" ? status.openai.model : status.codexCli.model,
    errorMessage:
      provider === "openai"
        ? status.openai.enabled
          ? ""
          : "Missing OpenAI API key. Add one in Preferences > AI."
        : providerEnabled
        ? ""
        : codexCliStatus.error,
    codexCli: {
      ...status.codexCli,
      ...codexCliStatus,
    },
  };
};

const buildCodexCliPrompt = ({ context, messages }) => {
  const conversation = normalizeMessages(messages)
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n");

  return [
    TEST_GENERATION_INSTRUCTIONS,
    "",
    "Return the final answer as Bruno Tests JavaScript only.",
    "",
    `Current Bruno request context:\n${stringifyContext(context)}`,
    conversation ? `Conversation:\n${conversation}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
};

const runCodexCliGenerateTests = async (payload = {}) => {
  const status = await getCodexCliStatus(aiStore.getCodexCliPath());

  if (!status.found) {
    throw new Error(status.error);
  }

  if (!status.loggedIn) {
    throw new Error(
      status.error ||
        "Codex CLI is not logged in. Run `codex login` in your terminal.",
    );
  }

  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "bruno-ai-"),
  );
  const outputFile = path.join(tempDir, "last-message.txt");
  const args = [
    "--ask-for-approval",
    "never",
    "exec",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color",
    "never",
    "--output-last-message",
    outputFile,
  ];
  const codexModel = aiStore.getCodexModel();

  if (codexModel) {
    args.push("--model", codexModel);
  }

  args.push("-");

  try {
    const result = await execFileWithInput(status.path, args, {
      cwd: tempDir,
      env: buildCodexEnv(status.path),
      input: buildCodexCliPrompt(payload),
    });
    const output = fs.existsSync(outputFile)
      ? await fs.promises.readFile(outputFile, "utf8")
      : result.stdout;

    return {
      model: codexModel || status.version || "codex-cli",
      message: stripCodeFences(output),
    };
  } catch (error) {
    const detail = `${
      error?.stderr ||
      error?.stdout ||
      error?.message ||
      "Failed to run Codex CLI."
    }`.trim();
    throw new Error(detail);
  } finally {
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
};

const runOpenAiGenerateTests = async (payload = {}) => {
  const apiKey = aiStore.getApiKey();

  if (!apiKey) {
    throw new Error(
      "Missing OpenAI API key. Add one in Preferences > AI or start Electron with OPENAI_API_KEY=...",
    );
  }

  const client = new OpenAIClient({ apiKey });
  const model = aiStore.getModel();

  try {
    const response = await client.responses.create({
      model,
      instructions: TEST_GENERATION_INSTRUCTIONS,
      input: buildInput(payload),
      max_output_tokens: 2000,
      store: false,
    });

    return {
      model,
      message: extractOutputText(response),
    };
  } catch (error) {
    const detail = error?.message || "Failed to generate Bruno tests.";
    throw new Error(detail);
  }
};

const registerAiIpc = () => {
  ipcMain.handle("renderer:ai:status", async () => getAiStatus());

  ipcMain.handle("renderer:ai:save-settings", async (_, settings = {}) => {
    aiStore.saveSettings(settings);
    return getAiStatus();
  });

  ipcMain.handle("renderer:ai:clear-api-key", async () => {
    aiStore.clearApiKey();
    return getAiStatus();
  });

  ipcMain.handle("renderer:ai:check-codex-cli", async (_, codexCliPath = "") =>
    getCodexCliStatus(codexCliPath),
  );

  ipcMain.handle("renderer:ai:generate-tests", async (_, payload = {}) => {
    if (aiStore.getProvider() === "codex-cli") {
      return runCodexCliGenerateTests(payload);
    }

    return runOpenAiGenerateTests(payload);
  });
};

module.exports = registerAiIpc;

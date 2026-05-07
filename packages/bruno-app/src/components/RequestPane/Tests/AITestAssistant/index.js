import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { IconCheck, IconCopy, IconPlus, IconReplace, IconRobot, IconSend } from '@tabler/icons';
import Modal from 'components/Modal';
import Portal from 'components/Portal';
import Button from 'ui/Button';
import StyledWrapper from './StyledWrapper';

const CodeMirror = require('codemirror');
require('codemirror/addon/runmode/runmode');
require('codemirror/mode/javascript/javascript');

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|token|password|secret|api[-_]?key|access[-_]?key|refresh[-_]?token|client[-_]?secret)/i;
const MAX_FIELD_CHARS = 8000;
const MAX_TEST_CHARS = 12000;

const truncate = (value, limit = MAX_FIELD_CHARS) => {
  const text = value === undefined || value === null ? '' : String(value);

  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n...[truncated]`;
};

const safeStringify = (value, limit = MAX_FIELD_CHARS) => {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'string') {
    return truncate(value, limit);
  }

  try {
    return truncate(JSON.stringify(value, null, 2), limit);
  } catch (error) {
    return truncate(String(value), limit);
  }
};

const parseJsonIfPossible = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
};

const isSensitiveKey = (key = '') => SENSITIVE_KEY_PATTERN.test(String(key));

const sanitizePayload = (value, key = '', seen = new WeakSet()) => {
  if (isSensitiveKey(key)) {
    return '[masked]';
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item, '', seen));
  }

  return Object.entries(value).reduce((acc, [entryKey, entryValue]) => {
    acc[entryKey] = sanitizePayload(entryValue, entryKey, seen);
    return acc;
  }, {});
};

const sanitizeUrl = (url = '') => {
  const rawUrl = String(url || '');

  if (rawUrl.includes('{{')) {
    return rawUrl.replace(/([?&][^=&]*(?:authorization|cookie|token|password|secret|api[-_]?key)[^=&]*=)[^&]*/gi, '$1[masked]');
  }

  try {
    const parsedUrl = new URL(rawUrl, 'http://bruno.local');

    parsedUrl.searchParams.forEach((value, key) => {
      if (isSensitiveKey(key)) {
        parsedUrl.searchParams.set(key, '[masked]');
      }
    });

    if (/^https?:\/\//i.test(rawUrl)) {
      return parsedUrl.toString();
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch (error) {
    return rawUrl.replace(/([?&][^=&]*(?:authorization|cookie|token|password|secret|api[-_]?key)[^=&]*=)[^&]*/gi, '$1[masked]');
  }
};

const maskValue = (key, value) => {
  if (isSensitiveKey(key)) {
    return '[masked]';
  }

  return safeStringify(sanitizePayload(value, key));
};

const normalizeKeyValueList = (items = []) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item?.enabled !== false)
    .map((item) => {
      const key = item.name || item.key || '';

      return {
        name: key,
        type: item.type,
        value: maskValue(key, item.value)
      };
    })
    .filter((item) => item.name);
};

const normalizeHeaders = (headers) => {
  if (Array.isArray(headers)) {
    return normalizeKeyValueList(headers);
  }

  if (!headers || typeof headers !== 'object') {
    return [];
  }

  return Object.entries(headers).map(([key, value]) => ({
    name: key,
    value: maskValue(key, value)
  }));
};

const getRequest = (item) => item?.draft?.request || item?.request || {};

const getRequestName = (item) => item?.draft?.name || item?.name || item?.filename || 'Untitled Request';

const normalizeBody = (body = {}) => {
  const mode = body.mode || 'none';

  if (mode === 'none') {
    return { mode };
  }

  const bodyValue = body[mode] ?? body.json ?? body.text ?? body.xml ?? body.graphql;
  return {
    mode,
    value: safeStringify(sanitizePayload(parseJsonIfPossible(bodyValue)))
  };
};

const buildAITestContext = ({ item, tests }) => {
  const request = getRequest(item);
  const response = item?.response || null;

  return {
    request: {
      name: getRequestName(item),
      method: (request.method || '').toUpperCase(),
      url: sanitizeUrl(request.url || ''),
      params: normalizeKeyValueList(request.params),
      headers: normalizeHeaders(request.headers),
      body: normalizeBody(request.body)
    },
    currentTests: truncate(tests || '', MAX_TEST_CHARS),
    latestResponse: response ? {
      status: response.status,
      statusText: response.statusText,
      duration: response.duration,
      size: response.size,
      headers: normalizeHeaders(response.headers),
      body: safeStringify(sanitizePayload(response.data), MAX_FIELD_CHARS)
    } : null
  };
};

const extractCode = (content = '') => {
  const text = String(content || '').trim();
  const fenceMatch = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  return (fenceMatch ? fenceMatch[1] : text).trim();
};

const CodePreview = ({ code }) => {
  const codeRef = useRef(null);

  useEffect(() => {
    if (!codeRef.current) {
      return;
    }

    codeRef.current.textContent = '';

    if (CodeMirror.runMode) {
      CodeMirror.runMode(code || '', 'javascript', codeRef.current);
      return;
    }

    codeRef.current.textContent = code || '';
  }, [code]);

  return (
    <pre className="ai-code-preview cm-s-default">
      <code ref={codeRef} />
    </pre>
  );
};

const AITestAssistant = ({ item, tests, onInsert, onReplace }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState({
    checking: false,
    enabled: false,
    model: '',
    provider: 'openai'
  });
  const messagesRef = useRef(null);
  const hasIpc = Boolean(window.ipcRenderer?.invoke);

  useEffect(() => {
    setMessages([]);
    setGeneratedCode('');
    setInput('');
    setError('');
  }, [item.uid]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    if (!hasIpc) {
      setAvailability({
        checking: false,
        enabled: false,
        model: '',
        provider: 'openai',
        error: 'AI Assistant requires the Electron app. It is not available in web-only mode.'
      });
      return;
    }

    let mounted = true;
    setAvailability({
      checking: true,
      enabled: false,
      model: '',
      provider: 'openai'
    });

    window.ipcRenderer
      .invoke('renderer:ai:status')
      .then((status) => {
        if (!mounted) {
          return;
        }

        const provider = status?.provider || 'openai';
        const isCodexCli = provider === 'codex-cli';
        const model = isCodexCli
          ? status?.codexCli?.model || status?.codexCli?.version || 'Codex CLI'
          : status?.openai?.model || status?.model || '';

        setAvailability({
          checking: false,
          enabled: Boolean(status?.enabled),
          model,
          provider,
          error: status?.enabled ? '' : status?.errorMessage || 'AI Assistant is not available.'
        });
      })
      .catch((statusError) => {
        if (!mounted) {
          return;
        }

        setAvailability({
          checking: false,
          enabled: false,
          model: '',
          provider: 'openai',
          error: statusError?.message || 'AI Assistant is not available.'
        });
      });

    return () => {
      mounted = false;
    };
  }, [hasIpc, modalOpen]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const statusMessage = useMemo(() => {
    if (availability.checking) {
      return 'Checking AI Assistant...';
    }

    if (availability.error) {
      return availability.error;
    }

    if (availability.provider === 'codex-cli') {
      return availability.model ? `Provider: Codex CLI (${availability.model})` : 'Provider: Codex CLI';
    }

    return availability.model ? `Provider: OpenAI API (${availability.model})` : 'Provider: OpenAI API';
  }, [availability]);

  const sendMessage = async (event) => {
    event?.preventDefault();

    const content = input.trim();

    if (!content || isSending) {
      return;
    }

    if (!availability.enabled) {
      setError(availability.error || 'AI Assistant is not available.');
      return;
    }

    const userMessage = { role: 'user', content };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setError('');
    setIsSending(true);

    try {
      const result = await window.ipcRenderer.invoke('renderer:ai:generate-tests', {
        context: buildAITestContext({ item, tests }),
        messages: nextMessages
      });
      const assistantContent = result?.message || '';
      const nextCode = extractCode(assistantContent);

      setGeneratedCode(nextCode);
      setMessages([...nextMessages, { role: 'assistant', content: assistantContent }]);
    } catch (sendError) {
      setError(sendError?.message || 'Failed to generate tests.');
    } finally {
      setIsSending(false);
    }
  };

  const copyGeneratedCode = async () => {
    if (!generatedCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      toast.success('Tests copied to clipboard');
    } catch (copyError) {
      toast.error('Failed to copy tests');
    }
  };

  const insertGeneratedCode = () => {
    if (!generatedCode) {
      return;
    }

    onInsert(generatedCode);
    toast.success('Tests inserted');
  };

  const replaceWithGeneratedCode = () => {
    if (!generatedCode) {
      return;
    }

    onReplace(generatedCode);
    toast.success('Tests replaced');
  };

  return (
    <>
      <Button
        size="sm"
        color="secondary"
        variant="ghost"
        icon={<IconRobot size={16} strokeWidth={2} />}
        onClick={() => setModalOpen(true)}
        data-testid="ai-test-assistant-open"
      >
        AI
      </Button>

      {modalOpen && (
        <Portal>
          <Modal
            size="lg"
            title="AI Assistant"
            handleCancel={() => setModalOpen(false)}
            hideFooter
            dataTestId="ai-test-assistant-modal"
          >
            <StyledWrapper>
              <div className={`ai-status ${availability.error || error ? 'error' : ''}`}>
                {error || statusMessage}
              </div>

              <div className="ai-layout">
                <section className="ai-chat">
                  <div className="ai-panel-header">Chat</div>
                  <div className="ai-messages" ref={messagesRef}>
                    {messages.length ? messages.map((message, index) => (
                      <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}>
                        {message.content}
                      </div>
                    )) : (
                      <div className="ai-empty">No messages yet</div>
                    )}
                  </div>

                  <form className="ai-form" onSubmit={sendMessage}>
                    <textarea
                      className="ai-input"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      placeholder="Message AI Assistant"
                      disabled={isSending || availability.checking}
                    />
                    <Button
                      size="sm"
                      color="primary"
                      icon={<IconSend size={16} strokeWidth={2} />}
                      type="submit"
                      loading={isSending}
                      disabled={!input.trim() || !availability.enabled || isSending || availability.checking}
                    >
                      Send
                    </Button>
                  </form>
                </section>

                <section className="ai-preview">
                  <div className="ai-panel-header">
                    <span>Preview</span>
                    <div className="ai-actions">
                      <Button
                        size="sm"
                        color="secondary"
                        variant="ghost"
                        icon={copied ? <IconCheck size={16} strokeWidth={2} /> : <IconCopy size={16} strokeWidth={2} />}
                        onClick={copyGeneratedCode}
                        disabled={!generatedCode}
                      >
                        Copy
                      </Button>
                      <Button
                        size="sm"
                        color="secondary"
                        variant="ghost"
                        icon={<IconPlus size={16} strokeWidth={2} />}
                        onClick={insertGeneratedCode}
                        disabled={!generatedCode}
                      >
                        Insert
                      </Button>
                      <Button
                        size="sm"
                        color="secondary"
                        variant="ghost"
                        icon={<IconReplace size={16} strokeWidth={2} />}
                        onClick={replaceWithGeneratedCode}
                        disabled={!generatedCode}
                      >
                        Replace
                      </Button>
                    </div>
                  </div>
                  <div className="ai-code-scroll">
                    <CodePreview code={generatedCode} />
                  </div>
                </section>
              </div>
            </StyledWrapper>
          </Modal>
        </Portal>
      )}
    </>
  );
};

export default AITestAssistant;

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import classnames from 'classnames';
import toast from 'react-hot-toast';
import { IconCheck, IconCode, IconCopy } from '@tabler/icons';
import Modal from 'components/Modal';
import Portal from 'components/Portal';
import ActionIcon from 'ui/ActionIcon/index';
import Button from 'ui/Button';
import TriggerWrapper from '../ResponseCopy/StyledWrapper';
import StyledWrapper from './StyledWrapper';
import { generateReactCodeFiles } from './generateReactCode';

const CodeMirror = require('codemirror');
require('codemirror/addon/runmode/runmode');
require('codemirror/mode/javascript/javascript');

const CodePreview = ({ code }) => {
  const codeRef = useRef(null);

  useEffect(() => {
    if (!codeRef.current) {
      return;
    }

    codeRef.current.textContent = '';

    if (CodeMirror.runMode) {
      CodeMirror.runMode(code || '', 'text/typescript', codeRef.current);
      return;
    }

    codeRef.current.textContent = code || '';
  }, [code]);

  return (
    <pre className="react-code-highlight cm-s-default">
      <code ref={codeRef} />
    </pre>
  );
};

const ResponseGenerateReactCode = forwardRef(({ data, item, children }, ref) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeFileId, setActiveFileId] = useState('types');
  const [copied, setCopied] = useState(false);
  const elementRef = useRef(null);
  const request = item?.draft?.request || item?.request || {};
  const isDisabled = item.type !== 'http-request' || !request.url || item.response?.stream?.running;

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  useImperativeHandle(ref, () => ({
    click: () => elementRef.current?.click(),
    isDisabled
  }), [isDisabled]);

  const files = useMemo(() => {
    if (!modalOpen) {
      return [];
    }

    return generateReactCodeFiles({ item, data });
  }, [data, item, modalOpen]);

  const activeFile = useMemo(() => {
    return files.find((file) => file.id === activeFileId) || files[0];
  }, [activeFileId, files]);

  const openModal = () => {
    if (!isDisabled) {
      setModalOpen(true);
    }
  };

  const copyActiveFile = async () => {
    if (!activeFile?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeFile.code);
      setCopied(true);
      toast.success(`${activeFile.fileName} copied to clipboard`);
    } catch (error) {
      toast.error('Failed to copy code');
    }
  };

  return (
    <>
      <div
        ref={elementRef}
        aria-disabled={isDisabled}
        onClick={openModal}
        title={!children ? 'Generate React code' : null}
        className={classnames({
          'opacity-50 cursor-not-allowed': isDisabled && !children
        })}
        data-testid="response-generate-react-code-btn"
      >
        {children ? children : (
          <TriggerWrapper className="flex items-center">
            <ActionIcon className="p-1" disabled={isDisabled}>
              <IconCode size={16} strokeWidth={2} />
            </ActionIcon>
          </TriggerWrapper>
        )}
      </div>

      {modalOpen && (
        <Portal>
          <Modal
            size="lg"
            title="React Code"
            handleCancel={() => setModalOpen(false)}
            hideFooter
            dataTestId="response-react-code-modal"
          >
            <StyledWrapper>
              <div className="react-code-toolbar">
                <div className="react-code-tabs">
                  {files.map((file) => (
                    <button
                      key={file.id}
                      type="button"
                      className={classnames('react-code-tab', { active: file.id === activeFile?.id })}
                      onClick={() => setActiveFileId(file.id)}
                    >
                      {file.fileName}
                    </button>
                  ))}
                </div>

                <Button
                  size="sm"
                  color="secondary"
                  variant="ghost"
                  icon={copied ? <IconCheck size={16} strokeWidth={2} /> : <IconCopy size={16} strokeWidth={2} />}
                  onClick={copyActiveFile}
                  disabled={!activeFile?.code}
                >
                  Copy
                </Button>
              </div>

              <div className="react-code-content">
                <CodePreview code={activeFile?.code || ''} />
              </div>
            </StyledWrapper>
          </Modal>
        </Portal>
      )}
    </>
  );
});

ResponseGenerateReactCode.displayName = 'ResponseGenerateReactCode';

export default ResponseGenerateReactCode;

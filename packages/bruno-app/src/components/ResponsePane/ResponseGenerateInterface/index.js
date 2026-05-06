import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import classnames from 'classnames';
import toast from 'react-hot-toast';
import { IconBraces, IconCheck, IconChevronDown, IconCopy } from '@tabler/icons';
import Modal from 'components/Modal';
import Portal from 'components/Portal';
import ActionIcon from 'ui/ActionIcon/index';
import Button from 'ui/Button';
import TriggerWrapper from '../ResponseCopy/StyledWrapper';
import StyledWrapper from './StyledWrapper';
import { generateResponseModel, RESPONSE_MODEL_LANGUAGES } from './generateInterface';

const ResponseGenerateInterface = forwardRef(({ data, item, children }, ref) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(RESPONSE_MODEL_LANGUAGES[0].id);
  const [copied, setCopied] = useState(false);
  const elementRef = useRef(null);
  const isDisabled = !data || item.response?.stream?.running;

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

  const selectedLanguageConfig = useMemo(() => {
    return RESPONSE_MODEL_LANGUAGES.find((language) => language.id === selectedLanguage) || RESPONSE_MODEL_LANGUAGES[0];
  }, [selectedLanguage]);

  const generatedModel = useMemo(() => {
    if (!modalOpen) {
      return { code: '', error: null };
    }

    try {
      return {
        code: generateResponseModel(data, selectedLanguage),
        error: null
      };
    } catch (error) {
      return {
        code: '',
        error: error.message || 'Failed to generate interface'
      };
    }
  }, [data, modalOpen, selectedLanguage]);

  const openModal = () => {
    if (!isDisabled) {
      setModalOpen(true);
    }
  };

  const copyGeneratedModel = async () => {
    if (!generatedModel.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedModel.code);
      setCopied(true);
      toast.success(`${selectedLanguageConfig.label} model copied to clipboard`);
    } catch (error) {
      toast.error('Failed to copy model');
    }
  };

  return (
    <>
      <div
        ref={elementRef}
        aria-disabled={isDisabled}
        onClick={openModal}
        title={!children ? 'Generate interface from response' : null}
        className={classnames({
          'opacity-50 cursor-not-allowed': isDisabled && !children
        })}
        data-testid="response-generate-interface-btn"
      >
        {children ? children : (
          <TriggerWrapper className="flex items-center">
            <ActionIcon className="p-1" disabled={isDisabled}>
              <IconBraces size={16} strokeWidth={2} />
            </ActionIcon>
          </TriggerWrapper>
        )}
      </div>

      {modalOpen && (
        <Portal>
          <Modal
            size="lg"
            title="Response Interface"
            handleCancel={() => setModalOpen(false)}
            hideFooter
            dataTestId="response-interface-modal"
          >
            <StyledWrapper>
              <div className="response-interface-toolbar">
                <div className="select-wrapper">
                  <select
                    className="native-select"
                    value={selectedLanguage}
                    onChange={(event) => setSelectedLanguage(event.target.value)}
                  >
                    {RESPONSE_MODEL_LANGUAGES.map((language) => (
                      <option key={language.id} value={language.id}>
                        {language.label}
                      </option>
                    ))}
                  </select>
                  <IconChevronDown size={16} className="select-arrow" />
                </div>

                <Button
                  size="sm"
                  color="secondary"
                  variant="ghost"
                  icon={copied ? <IconCheck size={16} strokeWidth={2} /> : <IconCopy size={16} strokeWidth={2} />}
                  onClick={copyGeneratedModel}
                  disabled={!generatedModel.code}
                >
                  Copy
                </Button>
              </div>

              <div className="response-interface-code">
                {generatedModel.error ? (
                  <div className="response-interface-error">{generatedModel.error}</div>
                ) : (
                  <pre>
                    <code className={`language-${selectedLanguageConfig.mode}`}>{generatedModel.code}</code>
                  </pre>
                )}
              </div>
            </StyledWrapper>
          </Modal>
        </Portal>
      )}
    </>
  );
});

ResponseGenerateInterface.displayName = 'ResponseGenerateInterface';

export default ResponseGenerateInterface;

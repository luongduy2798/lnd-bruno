import styled from 'styled-components';
import { rgba } from 'polished';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: min(76vh, 760px);
  min-height: 520px;
  gap: 12px;

  .ai-status {
    min-height: 18px;
    color: ${(props) => props.theme.colors.text.muted};
    font-size: ${(props) => props.theme.font.size.sm};
  }

  .ai-status.error {
    color: ${(props) => props.theme.colors.text.danger};
  }

  .ai-layout {
    display: grid;
    grid-template-columns: minmax(280px, 0.85fr) minmax(360px, 1.15fr);
    gap: 12px;
    flex: 1;
    min-height: 0;
  }

  .ai-chat,
  .ai-preview {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid ${(props) => props.theme.workspace.border};
    border-radius: 4px;
    background: ${(props) => props.theme.requestTabPanel.url.bg};
  }

  .ai-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 40px;
    padding: 8px 10px;
    border-bottom: 1px solid ${(props) => props.theme.workspace.border};
    color: ${(props) => props.theme.text};
    font-size: ${(props) => props.theme.font.size.sm};
    font-weight: 600;
  }

  .ai-activity {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid ${(props) => props.theme.workspace.border};
    background: ${(props) => rgba(props.theme.text, 0.02)};
  }

  .ai-activity-title {
    color: ${(props) => props.theme.text};
    font-size: ${(props) => props.theme.font.size.xs};
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .ai-activity-entry {
    position: relative;
    min-height: 18px;
    padding-left: 22px;
    color: ${(props) => props.theme.colors.text.muted};
    font-size: ${(props) => props.theme.font.size.xs};
    line-height: 1.45;
  }

  .ai-activity-entry::before {
    content: '';
    position: absolute;
    left: 0;
    top: 2px;
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: ${(props) => props.theme.button2.color.primary.bg};
  }

  .ai-activity-entry.running::before {
    background: transparent;
    border: 2px solid ${(props) => rgba(props.theme.button2.color.primary.bg, 0.22)};
    border-top-color: ${(props) => props.theme.button2.color.primary.bg};
    animation: ai-activity-spin 0.8s linear infinite;
  }

  .ai-activity-entry.success {
    color: ${(props) => props.theme.text};
  }

  .ai-activity-entry.success::before {
    top: 5px;
    width: 6px;
    height: 6px;
    background: ${(props) => props.theme.colors.success};
  }

  .ai-activity-entry.error {
    color: ${(props) => props.theme.colors.text.danger};
  }

  .ai-activity-entry.error::before {
    top: 5px;
    width: 6px;
    height: 6px;
    background: ${(props) => props.theme.colors.text.danger};
  }

  @keyframes ai-activity-spin {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }

  .ai-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ai-messages {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }

  .ai-empty {
    color: ${(props) => props.theme.colors.text.muted};
    font-size: ${(props) => props.theme.font.size.sm};
  }

  .ai-message {
    max-width: 92%;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: ${(props) => props.theme.font.size.sm};
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .ai-message.user {
    align-self: flex-end;
    color: ${(props) => props.theme.button2.color.primary.text};
    background: ${(props) => props.theme.button2.color.primary.bg};
  }

  .ai-message.assistant {
    align-self: flex-start;
    color: ${(props) => props.theme.text};
    background: ${(props) => rgba(props.theme.text, 0.06)};
  }

  .ai-form {
    display: flex;
    gap: 8px;
    padding: 10px;
    border-top: 1px solid ${(props) => props.theme.workspace.border};
  }

  .ai-input {
    flex: 1;
    min-height: 36px;
    max-height: 110px;
    resize: vertical;
    padding: 8px 10px;
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: 4px;
    outline: none;
    color: ${(props) => props.theme.text};
    background: ${(props) => props.theme.input.bg};
    font-size: ${(props) => props.theme.font.size.sm};

    &:focus {
      border-color: ${(props) => props.theme.input.focusBorder};
    }
  }

  .ai-code-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .ai-code-preview {
    margin: 0;
    min-height: 100%;
    padding: 12px 14px;
    color: ${(props) => props.theme.text};
    font-family: ${(props) => props.theme.font.mono};
    font-size: ${(props) => props.theme.font.size.sm};
    line-height: 1.55;
    white-space: pre;
  }

  .ai-code-preview code {
    font-family: ${(props) => props.theme.font.mono};
  }

  .ai-code-preview span.cm-def,
  .ai-code-preview span.cm-type {
    color: ${(props) => props.theme.codemirror.tokens.definition} !important;
  }

  .ai-code-preview span.cm-property {
    color: ${(props) => props.theme.codemirror.tokens.property} !important;
  }

  .ai-code-preview span.cm-string {
    color: ${(props) => props.theme.codemirror.tokens.string} !important;
  }

  .ai-code-preview span.cm-number {
    color: ${(props) => props.theme.codemirror.tokens.number} !important;
  }

  .ai-code-preview span.cm-atom {
    color: ${(props) => props.theme.codemirror.tokens.atom} !important;
  }

  .ai-code-preview span.cm-variable,
  .ai-code-preview span.cm-variable-2,
  .ai-code-preview span.cm-builtin {
    color: ${(props) => props.theme.codemirror.tokens.variable} !important;
  }

  .ai-code-preview span.cm-keyword {
    color: ${(props) => props.theme.codemirror.tokens.keyword} !important;
  }

  .ai-code-preview span.cm-comment {
    color: ${(props) => props.theme.codemirror.tokens.comment} !important;
  }

  .ai-code-preview span.cm-operator {
    color: ${(props) => props.theme.codemirror.tokens.operator} !important;
  }

  @media (max-width: 920px) {
    height: min(82vh, 820px);

    .ai-layout {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(220px, 0.8fr) minmax(260px, 1fr);
    }
  }
`;

export default StyledWrapper;

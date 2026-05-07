import styled from 'styled-components';

const StyledWrapper = styled.div`
  color: ${(props) => props.theme.text};

  .ai-settings-form {
    max-width: 680px;
  }

  .ai-provider-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 8px;
  }

  .ai-provider-option {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 12px;
    border: 1px solid ${(props) => props.theme.workspace.border};
    border-radius: 4px;
    color: ${(props) => props.theme.text};
    background: ${(props) => props.theme.requestTabPanel.url.bg};
    cursor: pointer;
  }

  .ai-provider-option.active {
    border-color: ${(props) => props.theme.button2.color.primary.bg};
  }

  .ai-provider-option input {
    margin: 0;
  }

  .ai-provider-icon {
    display: inline-flex;
    align-items: center;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .ai-provider-option.active .ai-provider-icon {
    color: ${(props) => props.theme.button2.color.primary.bg};
  }

  .ai-provider-section {
    display: none;
    margin-top: 18px;
  }

  .ai-provider-section.active {
    display: block;
  }

  .ai-section-title {
    color: ${(props) => props.theme.text};
    font-size: ${(props) => props.theme.font.size.sm};
    font-weight: 600;
  }

  .ai-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 18px;
  }

  .ai-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  label {
    font-size: 0.8125rem;
  }

  .ai-help,
  .ai-status {
    color: ${(props) => props.theme.colors.text.muted};
    font-size: ${(props) => props.theme.font.size.xs};
    line-height: 1.45;
  }

  .ai-status.error {
    color: ${(props) => props.theme.colors.text.danger};
  }

  .ai-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 18px;
  }

  .ai-actions.secondary {
    margin-top: 12px;
  }
`;

export default StyledWrapper;

import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: min(68vh, 680px);
  min-height: 420px;
  gap: 12px;

  .response-interface-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .select-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .select-arrow {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .native-select {
    background: ${(props) => props.theme.requestTabPanel.url.bg};
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: 3px;
    color: ${(props) => props.theme.text};
    font-size: ${(props) => props.theme.font.size.sm};
    padding: 6px 30px 6px 10px;
    min-width: 150px;
    height: 32px;
    cursor: pointer;
    appearance: none;
    outline: none;
    box-shadow: none;

    &:hover {
      border-color: ${(props) => props.theme.input.focusBorder};
    }

    &:focus {
      border-color: ${(props) => props.theme.input.focusBorder};
      box-shadow: 0 0 0 2px ${(props) => props.theme.input.focusBoxShadow};
    }

    option {
      background: ${(props) => props.theme.bg};
      color: ${(props) => props.theme.text};
    }
  }

  .response-interface-code {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid ${(props) => props.theme.workspace.border};
    border-radius: 4px;
    background: ${(props) => props.theme.requestTabPanel.url.bg};
  }

  pre {
    margin: 0;
    padding: 12px 14px;
    min-height: 100%;
    color: ${(props) => props.theme.text};
    font-size: ${(props) => props.theme.font.size.sm};
    line-height: 1.55;
    white-space: pre;
  }

  code {
    font-family: ${(props) => props.theme.font.mono};
  }

  .response-interface-error {
    padding: 14px;
    color: ${(props) => props.theme.colors.text.danger};
    font-size: ${(props) => props.theme.font.size.sm};
  }
`;

export default StyledWrapper;

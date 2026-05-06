import styled from 'styled-components';

const StyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: min(68vh, 680px);
  min-height: 420px;
  gap: 12px;

  .react-code-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .react-code-tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    border: 1px solid ${(props) => props.theme.input.border};
    border-radius: 4px;
    background: ${(props) => props.theme.requestTabPanel.url.bg};
  }

  .react-code-tab {
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: ${(props) => props.theme.colors.text.muted};
    font-size: ${(props) => props.theme.font.size.sm};
    line-height: 28px;
    cursor: pointer;

    &:hover {
      color: ${(props) => props.theme.text};
      background: ${(props) => props.theme.dropdown.hoverBg};
    }

    &.active {
      color: ${(props) => props.theme.button.secondary.color};
      background: ${(props) => props.theme.button.secondary.bg};
    }
  }

  .react-code-content {
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
`;

export default StyledWrapper;

import React, { useRef } from 'react';
import get from 'lodash/get';
import { useDispatch, useSelector } from 'react-redux';
import CodeEditor from 'components/CodeEditor';
import { updateRequestTests } from 'providers/ReduxStore/slices/collections';
import { sendRequest, saveRequest } from 'providers/ReduxStore/slices/collections/actions';
import { useTheme } from 'providers/Theme';
import { usePersistedState } from 'hooks/usePersistedState';
import AITestAssistant from './AITestAssistant';

const Tests = ({ item, collection }) => {
  const dispatch = useDispatch();
  const testsEditorRef = useRef(null);
  const tests = item.draft ? get(item, 'draft.request.tests') : get(item, 'request.tests');

  const { displayedTheme } = useTheme();
  const preferences = useSelector((state) => state.app.preferences);
  const [testsScroll, setTestsScroll] = usePersistedState({ key: `request-tests-scroll-${item.uid}`, default: 0 });

  const onEdit = (value) => {
    dispatch(
      updateRequestTests({
        tests: value,
        itemUid: item.uid,
        collectionUid: collection.uid
      })
    );
  };

  const onRun = () => dispatch(sendRequest(item, collection.uid));
  const onSave = () => dispatch(saveRequest(item.uid, collection.uid));
  const applyGeneratedTests = (value) => onEdit(value);
  const insertGeneratedTests = (value) => {
    const currentTests = tests || '';
    const nextTests = currentTests.trim()
      ? `${currentTests.trimEnd()}\n\n${value.trim()}\n`
      : `${value.trim()}\n`;

    applyGeneratedTests(nextTests);
  };

  return (
    <div data-testid="test-script-editor" className="h-full flex flex-col gap-2">
      <div className="flex justify-end">
        <AITestAssistant
          item={item}
          tests={tests || ''}
          onInsert={insertGeneratedTests}
          onReplace={applyGeneratedTests}
        />
      </div>
      <div className="flex-1 min-h-0">
        <CodeEditor
          ref={testsEditorRef}
          collection={collection}
          docKey="tests"
          value={tests || ''}
          theme={displayedTheme}
          font={get(preferences, 'font.codeFont', 'default')}
          fontSize={get(preferences, 'font.codeFontSize')}
          onEdit={onEdit}
          mode="javascript"
          onRun={onRun}
          onSave={onSave}
          showHintsFor={['req', 'res', 'bru']}
          initialScroll={testsScroll}
          onScroll={setTestsScroll}
        />
      </div>
    </div>
  );
};

export default Tests;

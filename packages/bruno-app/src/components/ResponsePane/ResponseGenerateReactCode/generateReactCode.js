import { format } from 'prettier/standalone';
import prettierPluginTypescript from 'prettier/parser-typescript';
import { generateResponseModel } from '../ResponseGenerateInterface/generateInterface';

const HTTP_METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

const parseJson = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return JSON.parse(trimmed);
  }

  return value;
};

const toWords = (value) => {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .match(/[A-Za-z0-9]+/g) || [];
};

const toPascalCase = (value, fallback = 'GeneratedRequest') => {
  const words = toWords(value);

  if (!words.length) {
    return fallback;
  }

  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
  return /^\d/.test(name) ? `${fallback}${name}` : name;
};

const toCamelCase = (value, fallback = 'generatedRequest') => {
  const pascal = toPascalCase(value, toPascalCase(fallback));
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

const isValidIdentifier = (value) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);

const formatPropertyName = (key) => {
  return isValidIdentifier(key) ? key : JSON.stringify(key);
};

const formatParamAccess = (key, optional = false) => {
  if (isValidIdentifier(key)) {
    return optional ? `params?.${key}` : `params.${key}`;
  }

  return optional ? `params?.[${JSON.stringify(key)}]` : `params[${JSON.stringify(key)}]`;
};

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const getRequest = (item) => item?.draft?.request || item?.request || {};

const getRequestName = (item) => {
  return item?.draft?.name || item?.name || item?.filename || 'Generated Request';
};

const normalizeUrl = (url = '') => {
  const withoutBaseVariable = url.replace(/^{{[^}]+}}/, '');

  try {
    const parsedUrl = new URL(withoutBaseVariable, 'http://bruno.local');
    return {
      path: decodeURIComponent(parsedUrl.pathname || '/'),
      queryKeys: Array.from(parsedUrl.searchParams.keys())
    };
  } catch (error) {
    const [path = '/', queryString = ''] = withoutBaseVariable.split('?');
    const queryKeys = queryString
      .split('&')
      .map((pair) => pair.split('=')[0])
      .filter(Boolean);

    return {
      path: path || '/',
      queryKeys
    };
  }
};

const getParamKeysFromRequest = (request, type) => {
  return (request.params || [])
    .filter((param) => param?.enabled !== false && param?.type === type && param?.name)
    .map((param) => param.name);
};

const getPathParamKeysFromUrl = (path) => {
  return unique((path.match(/{{[^}]+}}/g) || []).map((match) => match.replace(/[{}]/g, '')));
};

const getBodyData = (request) => {
  if (!HTTP_METHODS_WITH_BODY.has((request.method || '').toUpperCase())) {
    return { hasBody: false, bodyData: undefined, hasTypedBody: false };
  }

  const body = request.body || {};

  if (body.mode !== 'json') {
    return { hasBody: true, bodyData: undefined, hasTypedBody: false };
  }

  try {
    const parsedBody = parseJson(body.json);
    return {
      hasBody: true,
      bodyData: parsedBody,
      hasTypedBody: Boolean(parsedBody) && typeof parsedBody === 'object'
    };
  } catch (error) {
    return { hasBody: true, bodyData: undefined, hasTypedBody: false };
  }
};

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isListResponseData = (data) => {
  try {
    const parsedData = parseJson(data);
    return isObject(parsedData) && isObject(parsedData.data) && 'total' in parsedData.data && Array.isArray(parsedData.data.results);
  } catch (error) {
    return false;
  }
};

const buildResponseTypes = (data, responseTypeName) => {
  try {
    return generateResponseModel(data, 'typescript', responseTypeName);
  } catch (error) {
    return `export type ${responseTypeName} = unknown;`;
  }
};

const prefixNestedTypeNames = (code, rootTypeName) => {
  const declarationNames = Array.from(code.matchAll(/export\s+(?:interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g))
    .map((match) => match[1])
    .filter((name) => name !== rootTypeName && !name.startsWith(rootTypeName));

  return declarationNames.reduce((result, name) => {
    return result.replace(new RegExp(`\\b${name}\\b`, 'g'), `${rootTypeName}${name}`);
  }, code);
};

const buildBodyTypes = (bodyData, bodyTypeName) => {
  if (!bodyData || typeof bodyData !== 'object') {
    return '';
  }

  try {
    return prefixNestedTypeNames(generateResponseModel(bodyData, 'typescript', bodyTypeName), bodyTypeName);
  } catch (error) {
    return '';
  }
};

const formatGeneratedCode = (code) => {
  try {
    return format(code, {
      parser: 'typescript',
      plugins: [prettierPluginTypescript],
      printWidth: 100,
      tabWidth: 2,
      semi: true,
      trailingComma: 'all'
    }).trim();
  } catch (error) {
    return code;
  }
};

const buildParamsObjectType = ({ pathParamKeys, queryParamKeys }) => {
  if (!pathParamKeys.length && !queryParamKeys.length) {
    return '';
  }

  const pathFields = pathParamKeys.map((key) => `  ${formatPropertyName(key)}: string | number;`);
  const queryFields = queryParamKeys.map((key) => `  ${formatPropertyName(key)}?: string | number;`);

  return `{\n${[...pathFields, ...queryFields].join('\n')}\n}`;
};

const buildTypesFile = ({ data, bodyData, names, hasTypedBody }) => {
  const sections = [
    buildResponseTypes(data, names.responseTypeName),
    hasTypedBody ? buildBodyTypes(bodyData, names.bodyTypeName) : ''
  ].filter(Boolean);

  return sections.join('\n\n');
};

const buildApiFile = ({ names, path }) => {
  return `${formatPropertyName(names.functionName)}: ${JSON.stringify(path)};`;
};

const buildUrlPathExpression = (endpointExpression, pathParamKeys) => {
  if (!pathParamKeys.length) {
    return endpointExpression;
  }

  const replaceChain = pathParamKeys
    .map((key) => `.replace('{{${key}}}', String(${formatParamAccess(key)}))`)
    .join('');

  return `${endpointExpression}${replaceChain}`;
};

const buildQueryParamsBlock = (queryParamKeys) => {
  if (!queryParamKeys.length) {
    return null;
  }

  const fields = queryParamKeys.map((key) => `    ${formatPropertyName(key)}: ${formatParamAccess(key, true)}`);
  return `  const queryParams = {\n${fields.join(',\n')}\n  };`;
};

const buildFunctionParams = ({ hasParams, paramsRequired, paramsObjectType, hasBody, hasTypedBody, names }) => {
  const params = [];

  if (hasParams) {
    params.push(`params${paramsRequired ? '' : '?'}: ${paramsObjectType}`);
  }

  if (hasBody) {
    params.push(`data?: ${hasTypedBody ? names.bodyTypeName : 'any'}`);
  }

  return params.join(', ');
};

const buildServiceFile = ({ method, names, pathParamKeys, queryParamKeys, hasBody, hasTypedBody }) => {
  const hasParams = pathParamKeys.length > 0 || queryParamKeys.length > 0;
  const paramsRequired = pathParamKeys.length > 0;
  const paramsObjectType = buildParamsObjectType({
    pathParamKeys,
    queryParamKeys
  });
  const functionParams = buildFunctionParams({
    hasParams,
    paramsRequired,
    paramsObjectType,
    hasBody,
    hasTypedBody,
    names
  });
  const queryParamsBlock = buildQueryParamsBlock(queryParamKeys);
  const requestMethod = method.toLowerCase();
  const args = ['urlPath'];

  if (['get', 'delete'].includes(requestMethod)) {
    if (queryParamKeys.length) {
      args.push('queryParams');
    }
  } else if (HTTP_METHODS_WITH_BODY.has(method)) {
    args.push('data');
    if (queryParamKeys.length) {
      args.push('queryParams');
    }
  } else if (queryParamKeys.length) {
    args.push('queryParams');
  }

  return `export function ${names.functionName}(${functionParams}) {\n  const urlPath = ${buildUrlPathExpression(`API_ENDPOINTS.${names.functionName}`, pathParamKeys)};\n${queryParamsBlock ? `${queryParamsBlock}\n` : ''}  return apiRequest.${requestMethod}(${args.join(', ')}) as Promise<${names.responseTypeName}>;\n}`;
};

const buildQueryKeyMethodValue = ({ queryKeyName, pathParamKeys, queryParamKeys }) => {
  const paramKeys = [...pathParamKeys, ...queryParamKeys];

  if (!paramKeys.length) {
    return `[\n    ...${queryKeyName}.all\n  ]`;
  }

  return `[\n    ...${queryKeyName}.all,\n    ${paramKeys.map((key) => formatParamAccess(key, true)).join(',\n    ')}\n  ]`;
};

const buildQueryKeyObject = ({ names, pathParamKeys, queryParamKeys, paramsRequired, paramsObjectType, keyMethodName }) => {
  const hasParams = pathParamKeys.length > 0 || queryParamKeys.length > 0;
  const functionParams = hasParams ? `params${paramsRequired ? '' : '?'}: ${paramsObjectType}` : '';
  const queryKeyName = `${names.functionName}QueryKey`;
  const baseKey = `  all: ['${queryKeyName}'] as const`;

  if (!keyMethodName) {
    return `export const ${queryKeyName} = {\n${baseKey}\n};`;
  }

  return `export const ${queryKeyName} = {\n${baseKey},\n  ${keyMethodName}: (${functionParams}) => ${buildQueryKeyMethodValue({
    queryKeyName,
    pathParamKeys,
    queryParamKeys
  })} as const\n};`;
};

const getQueryDataName = (functionName) => {
  const withoutQueryPrefix = functionName.replace(/^(get|fetch|load|list|read)(?=[A-Z])/, '');
  const dataName = withoutQueryPrefix
    ? withoutQueryPrefix.charAt(0).toLowerCase() + withoutQueryPrefix.slice(1)
    : functionName;

  return isValidIdentifier(dataName) ? dataName : 'responseData';
};

const buildHookFile = ({ method, names, pathParamKeys, queryParamKeys, hasBody, hasTypedBody, isListResponse }) => {
  const isQuery = method === 'GET';
  const hasParams = pathParamKeys.length > 0 || queryParamKeys.length > 0;
  const paramsRequired = pathParamKeys.length > 0;

  const paramsObjectType = buildParamsObjectType({
    pathParamKeys,
    queryParamKeys
  });

  const hookParams = [];
  const serviceArgs = [];

  if (hasParams) {
    hookParams.push(`params${paramsRequired ? '' : '?'}: ${paramsObjectType}`);
    serviceArgs.push('params');
  }

  if (hasBody) {
    hookParams.push(`data?: ${hasTypedBody ? names.bodyTypeName : 'any'}`);
    serviceArgs.push('data');
  }

  if (isQuery) {
    hookParams.push(
      `options?: ${
        isListResponse ? 'any' : `Partial<UseQueryOptions<${names.responseTypeName}, unknown, ${names.responseTypeName}, any>>`
      }`
    );
    const keyMethodName = isListResponse ? 'list' : hasParams ? 'detail' : null;
    const queryKeyObject = buildQueryKeyObject({
      names,
      pathParamKeys,
      queryParamKeys,
      paramsRequired,
      paramsObjectType,
      keyMethodName
    });
    const queryKeyCall = keyMethodName ? `${names.functionName}QueryKey.${keyMethodName}(${hasParams ? 'params' : ''})` : `${names.functionName}QueryKey.all`;
    const dataName = getQueryDataName(names.functionName);
    const refetchName = `refetch${toPascalCase(dataName)}`;

    if (isListResponse) {
      const hasOffsetParam = queryParamKeys.includes('offset');
      const queryFn = hasOffsetParam
        ? `queryFn: ({ pageParam = params?.offset ?? 0 }: { pageParam?: string | number }) => ${names.functionName}({\n      ...params,\n      offset: pageParam,\n    }),`
        : `queryFn: () => ${names.functionName}(${serviceArgs.join(', ')}),`;
      const paginationOptions = hasOffsetParam
        ? `initialPageParam: params?.offset ?? 0,\n    getNextPageParam: (lastPage, allPages) => {\n      const limit = Number(params?.limit ?? 10);\n      const total = Number(lastPage?.data?.total ?? 0);\n      const nextOffset = allPages.length * limit;\n      return nextOffset < total ? nextOffset : undefined;\n    },`
        : `initialPageParam: undefined,\n    getNextPageParam: () => undefined,`;

      return `${queryKeyObject}\n\nexport function ${names.hookName}(${hookParams.join(', ')}) {\n  const {\n    data,\n    isLoading,\n    isFetching,\n    isError,\n    refetch,\n    fetchNextPage,\n    hasNextPage,\n    isFetchingNextPage,\n  } = useInfiniteQueryWithGlobalError<${names.responseTypeName}>({\n    queryKey: ${queryKeyCall},\n    ${queryFn}\n    ${paginationOptions}\n    ...options,\n  });\n\n  return useMemo(\n    () => ({\n      ${dataName}: data?.pages.flatMap((page) => page?.data?.results ?? []) ?? [],\n      total: data?.pages[0]?.data?.total ?? 0,\n      isLoading,\n      isFetching,\n      isError,\n      fetchNextPage,\n      hasNextPage,\n      isFetchingNextPage,\n      ${refetchName}: refetch,\n    }),\n    [data?.pages, isLoading, isFetching, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch],\n  );\n}`;
    }

    return `${queryKeyObject}\n\nexport function ${names.hookName}(${hookParams.join(', ')}) {\n  const {\n    data,\n    isLoading,\n    isFetching,\n    isError,\n    refetch,\n  } = useQueryWithGlobalError({\n    queryKey: ${queryKeyCall},\n    queryFn: () => ${names.functionName}(${serviceArgs.join(', ')}),\n    ...options,\n  });\n\n  return useMemo(\n    () => ({\n      ${dataName}: data?.data,\n      isLoading,\n      isFetching,\n      isError,\n      ${refetchName}: refetch,\n    }),\n    [data?.data, isLoading, isFetching, isError, refetch],\n  );\n}`;
  }

  hookParams.push(`options?: UseMutationOptions<${names.responseTypeName}, unknown, any, any>`);

  return `export function ${names.hookName}(${hookParams.join(', ')}) {\n  return useMutationWithGlobalError({\n    mutationFn: () => ${names.functionName}(${serviceArgs.join(', ')}),\n    ...options,\n  });\n}`;
};

export const generateReactCodeFiles = ({ item, data }) => {
  const request = getRequest(item);
  const requestName = getRequestName(item);
  const method = (request.method || 'GET').toUpperCase();
  const { path, queryKeys: queryKeysFromUrl } = normalizeUrl(request.url || '');
  const pathParamKeys = unique([...getPathParamKeysFromUrl(path), ...getParamKeysFromRequest(request, 'path')]);
  const queryParamKeys = unique([...queryKeysFromUrl, ...getParamKeysFromRequest(request, 'query')])
    .filter((key) => !pathParamKeys.includes(key));
  const baseName = toPascalCase(requestName);
  const names = {
    functionName: toCamelCase(requestName),
    hookName: `use${baseName}`,
    responseTypeName: `${baseName}Response`,
    bodyTypeName: `${baseName}Body`
  };
  const { hasBody, bodyData, hasTypedBody } = getBodyData(request);
  const isListResponse = isListResponseData(data);

  return [
    {
      id: 'types',
      fileName: 'types.ts',
      label: 'Types',
      code: formatGeneratedCode(buildTypesFile({
        data,
        bodyData,
        names,
        hasTypedBody
      }))
    },
    {
      id: 'api',
      fileName: 'api.ts',
      label: 'API',
      code: formatGeneratedCode(buildApiFile({
        names,
        path
      }))
    },
    {
      id: 'service',
      fileName: 'service.ts',
      label: 'Service',
      code: formatGeneratedCode(buildServiceFile({
        method,
        names,
        pathParamKeys,
        queryParamKeys,
        hasBody,
        hasTypedBody
      }))
    },
    {
      id: 'use-query',
      fileName: 'useQuery.ts',
      label: 'useQuery',
      code: formatGeneratedCode(buildHookFile({
        method,
        names,
        pathParamKeys,
        queryParamKeys,
        hasBody,
        hasTypedBody,
        isListResponse
      }))
    }
  ];
};

export const RESPONSE_MODEL_LANGUAGES = [
  { id: 'typescript', label: 'TypeScript', mode: 'javascript' },
  { id: 'java', label: 'Java', mode: 'text/x-java' },
  { id: 'dart', label: 'Dart', mode: 'javascript' }
];

const RESERVED_TYPESCRIPT_WORDS = new Set([
  'any',
  'as',
  'await',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'keyof',
  'let',
  'module',
  'namespace',
  'never',
  'new',
  'null',
  'number',
  'object',
  'package',
  'private',
  'protected',
  'public',
  'readonly',
  'require',
  'return',
  'set',
  'static',
  'string',
  'super',
  'switch',
  'symbol',
  'this',
  'throw',
  'true',
  'try',
  'type',
  'typeof',
  'undefined',
  'unknown',
  'var',
  'void',
  'while',
  'with',
  'yield'
]);

const RESERVED_JAVA_WORDS = new Set([
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'void',
  'volatile',
  'while'
]);

const RESERVED_DART_WORDS = new Set([
  'abstract',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'covariant',
  'default',
  'deferred',
  'do',
  'dynamic',
  'else',
  'enum',
  'export',
  'extends',
  'extension',
  'external',
  'factory',
  'false',
  'final',
  'finally',
  'for',
  'Function',
  'get',
  'hide',
  'if',
  'implements',
  'import',
  'in',
  'interface',
  'is',
  'late',
  'library',
  'mixin',
  'new',
  'null',
  'on',
  'operator',
  'part',
  'required',
  'rethrow',
  'return',
  'set',
  'show',
  'static',
  'super',
  'switch',
  'sync',
  'this',
  'throw',
  'true',
  'try',
  'typedef',
  'var',
  'void',
  'while',
  'with',
  'yield'
]);

const IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const CLASS_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseResponseData = (data) => {
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) {
      throw new Error('Response body is empty');
    }
    return JSON.parse(trimmed);
  }

  return data;
};

const toPascalCase = (value) => {
  const words = String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .match(/[A-Za-z0-9]+/g);

  if (!words?.length) {
    return 'Generated';
  }

  const name = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  return /^\d/.test(name) ? `Model${name}` : name;
};

const toCamelCase = (value, fallback = 'value') => {
  const pascal = toPascalCase(value);
  const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return /^\d/.test(camel) ? fallback : camel;
};

const singularize = (name) => {
  if (name.endsWith('ies') && name.length > 3) {
    return `${name.slice(0, -3)}y`;
  }

  if (name.endsWith('ses') && name.length > 3) {
    return name.slice(0, -2);
  }

  if (name.endsWith('s') && !name.endsWith('ss') && name.length > 1) {
    return name.slice(0, -1);
  }

  return name;
};

const createNameFactory = () => {
  const usedNames = new Map();

  return (nameHint) => {
    const baseName = toPascalCase(nameHint);
    const count = usedNames.get(baseName) || 0;
    usedNames.set(baseName, count + 1);
    return count === 0 ? baseName : `${baseName}${count + 1}`;
  };
};

const createFieldName = (key, reservedWords) => {
  const candidate = toCamelCase(key, 'field');
  const safeName = CLASS_IDENTIFIER_REGEX.test(candidate) ? candidate : 'field';
  return reservedWords.has(safeName) ? `${safeName}Value` : safeName;
};

const getPrimitiveKind = (value) => {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return typeof value;
  }

  return 'unknown';
};

const mergeSchemas = (schemas, nameHint) => {
  const nonUnknownSchemas = (schemas || []).filter((schema) => schema && schema.kind !== 'unknown');

  if (!nonUnknownSchemas.length) {
    return { kind: 'unknown' };
  }

  const objectSchemas = nonUnknownSchemas.filter((schema) => schema.kind === 'object');
  const arraySchemas = nonUnknownSchemas.filter((schema) => schema.kind === 'array');
  const primitiveKinds = nonUnknownSchemas
    .filter((schema) => schema.kind !== 'object' && schema.kind !== 'array')
    .map((schema) => schema.kind);

  const mergedKinds = [];

  if (objectSchemas.length) {
    const totalObjects = objectSchemas.length;
    const fieldsByKey = new Map();

    objectSchemas.forEach((schema) => {
      schema.fields.forEach((field) => {
        const existing = fieldsByKey.get(field.key) || {
          key: field.key,
          count: 0,
          schemas: []
        };
        existing.count += 1;
        existing.schemas.push(field.schema);
        fieldsByKey.set(field.key, existing);
      });
    });

    const fields = Array.from(fieldsByKey.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((field) => ({
        key: field.key,
        optional: field.count < totalObjects,
        schema: mergeSchemas(field.schemas, field.key)
      }));

    mergedKinds.push({ kind: 'object', nameHint, fields });
  }

  if (arraySchemas.length) {
    const itemSchemas = arraySchemas.flatMap((schema) => schema.item ? [schema.item] : []);
    mergedKinds.push({
      kind: 'array',
      nameHint,
      item: itemSchemas.length ? mergeSchemas(itemSchemas, singularize(nameHint)) : { kind: 'unknown' }
    });
  }

  Array.from(new Set(primitiveKinds)).sort().forEach((kind) => {
    mergedKinds.push({ kind });
  });

  if (mergedKinds.length === 1) {
    return mergedKinds[0];
  }

  return { kind: 'union', types: mergedKinds };
};

const inferSchema = (value, nameHint = 'Response') => {
  if (Array.isArray(value)) {
    return {
      kind: 'array',
      nameHint,
      item: value.length ? mergeSchemas(value.map((item) => inferSchema(item, singularize(nameHint))), singularize(nameHint)) : { kind: 'unknown' }
    };
  }

  if (isPlainObject(value)) {
    return {
      kind: 'object',
      nameHint,
      fields: Object.keys(value)
        .sort()
        .map((key) => ({
          key,
          optional: false,
          schema: inferSchema(value[key], key)
        }))
    };
  }

  return { kind: getPrimitiveKind(value) };
};

const normalizeRootSchema = (data, rootName = 'Response') => {
  const parsedData = parseResponseData(data);

  if (!isPlainObject(parsedData) && !Array.isArray(parsedData)) {
    throw new Error('Response must be a JSON object or array');
  }

  return inferSchema(parsedData, rootName);
};

const formatTypeScriptPropertyName = (key) => {
  if (IDENTIFIER_REGEX.test(key) && !RESERVED_TYPESCRIPT_WORDS.has(key)) {
    return key;
  }

  return JSON.stringify(key);
};

const buildTypeScript = (schema, rootName = 'Response') => {
  const declarations = [];
  const getInterfaceName = createNameFactory();
  const schemaToType = (currentSchema, nameHint) => {
    switch (currentSchema.kind) {
      case 'object': {
        const interfaceName = getInterfaceName(nameHint);
        const lines = currentSchema.fields.map((field) => {
          return `  ${formatTypeScriptPropertyName(field.key)}${field.optional ? '?' : ''}: ${schemaToType(field.schema, field.key)};`;
        });

        declarations.push(`export interface ${interfaceName} {\n${lines.length ? lines.join('\n') : '  [key: string]: unknown;'}\n}`);
        return interfaceName;
      }
      case 'array': {
        const itemType = schemaToType(currentSchema.item, singularize(nameHint));
        return itemType.includes(' | ') ? `Array<${itemType}>` : `${itemType}[]`;
      }
      case 'union':
        return Array.from(new Set(currentSchema.types.map((type) => schemaToType(type, nameHint)))).sort().join(' | ');
      case 'integer':
      case 'number':
        return 'number';
      case 'string':
      case 'boolean':
      case 'null':
        return currentSchema.kind;
      default:
        return 'unknown';
    }
  };

  if (schema.kind === 'array') {
    const rootTypeName = getInterfaceName(rootName);
    declarations.push(`export type ${rootTypeName} = ${schemaToType(schema, `${rootTypeName}Item`)};`);
  } else {
    schemaToType(schema, rootName);
  }

  return declarations.join('\n\n');
};

const buildJava = (schema, rootName = 'Response') => {
  const classes = [];
  const getClassName = createNameFactory();
  let usesList = false;
  let usesMap = false;

  const schemaToType = (currentSchema, nameHint) => {
    switch (currentSchema.kind) {
      case 'object':
        return buildClass(currentSchema, nameHint);
      case 'array':
        usesList = true;
        return `List<${schemaToType(currentSchema.item, singularize(nameHint))}>`;
      case 'union': {
        const nonNullTypes = currentSchema.types.filter((type) => type.kind !== 'null');
        const uniqueTypes = Array.from(new Set(nonNullTypes.map((type) => schemaToType(type, nameHint))));
        return uniqueTypes.length === 1 ? uniqueTypes[0] : 'Object';
      }
      case 'integer':
        return 'Long';
      case 'number':
        return 'Double';
      case 'string':
        return 'String';
      case 'boolean':
        return 'Boolean';
      default:
        return 'Object';
    }
  };

  const buildClass = (objectSchema, nameHint) => {
    const className = getClassName(nameHint);
    const fields = objectSchema.fields.map((field) => ({
      ...field,
      name: createFieldName(field.key, RESERVED_JAVA_WORDS),
      type: schemaToType(field.schema, field.key)
    }));

    if (!fields.length) {
      usesMap = true;
      classes.push(`public class ${className} {\n  private Map<String, Object> values;\n}`);
      return className;
    }

    const fieldLines = fields.map((field) => `  private ${field.type} ${field.name};`);
    const accessorLines = fields.flatMap((field) => {
      const methodName = toPascalCase(field.name);
      return [
        `  public ${field.type} get${methodName}() {`,
        `    return ${field.name};`,
        '  }',
        '',
        `  public void set${methodName}(${field.type} ${field.name}) {`,
        `    this.${field.name} = ${field.name};`,
        '  }'
      ];
    });

    classes.push(`public class ${className} {\n${fieldLines.join('\n')}\n\n${accessorLines.join('\n')}\n}`);
    return className;
  };

  if (schema.kind === 'array') {
    usesList = true;
    const itemType = schemaToType(schema.item, `${rootName}Item`);
    classes.push(`public class ${toPascalCase(rootName)} {\n  private List<${itemType}> items;\n\n  public List<${itemType}> getItems() {\n    return items;\n  }\n\n  public void setItems(List<${itemType}> items) {\n    this.items = items;\n  }\n}`);
  } else {
    schemaToType(schema, rootName);
  }

  const imports = [
    usesList ? 'import java.util.List;' : null,
    usesMap ? 'import java.util.Map;' : null
  ].filter(Boolean);

  return [imports.length ? `${imports.join('\n')}\n` : '', classes.join('\n\n')].join('');
};

const buildDart = (schema, rootName = 'Response') => {
  const classes = [];
  const getClassName = createNameFactory();

  const schemaToType = (currentSchema, nameHint) => {
    switch (currentSchema.kind) {
      case 'object':
        return buildClass(currentSchema, nameHint);
      case 'array':
        return `List<${schemaToType(currentSchema.item, singularize(nameHint))}>`;
      case 'union': {
        const nonNullTypes = currentSchema.types.filter((type) => type.kind !== 'null');
        const uniqueTypes = Array.from(new Set(nonNullTypes.map((type) => schemaToType(type, nameHint))));
        return uniqueTypes.length === 1 ? uniqueTypes[0] : 'dynamic';
      }
      case 'integer':
        return 'int';
      case 'number':
        return 'double';
      case 'string':
        return 'String';
      case 'boolean':
        return 'bool';
      default:
        return 'dynamic';
    }
  };

  const hasNull = (schema) => schema.kind === 'null' || schema.kind === 'union' && schema.types.some((type) => type.kind === 'null');
  const getSingleNonNullSchema = (schema) => {
    if (schema.kind !== 'union') {
      return schema;
    }

    const nonNullTypes = schema.types.filter((type) => type.kind !== 'null');
    return nonNullTypes.length === 1 ? nonNullTypes[0] : schema;
  };

  const fromJsonArrayItem = (itemSchema, itemType) => {
    switch (itemSchema.kind) {
      case 'object':
        return `${itemType}.fromJson(item as Map<String, dynamic>)`;
      case 'array':
        return `item as ${itemType}`;
      default:
        return `item as ${itemType}`;
    }
  };

  const toJsonArrayItem = (itemSchema) => {
    switch (itemSchema.kind) {
      case 'object':
        return 'item.toJson()';
      default:
        return 'item';
    }
  };

  const fromJsonValue = (field) => {
    const jsonAccess = `json[${JSON.stringify(field.key)}]`;
    const isNullable = field.optional || hasNull(field.schema);
    const schema = getSingleNonNullSchema(field.schema);
    const suffix = isNullable ? '?' : '';

    switch (schema.kind) {
      case 'object':
        return isNullable
          ? `${jsonAccess} == null ? null : ${field.type.replace(/\?$/, '')}.fromJson(${jsonAccess} as Map<String, dynamic>)`
          : `${field.type}.fromJson(${jsonAccess} as Map<String, dynamic>)`;
      case 'array':
        return `(${jsonAccess} as List<dynamic>${suffix})${suffix}.map((item) => ${fromJsonArrayItem(schema.item, field.type.replace(/\?$/, '').replace(/^List<|>$/g, ''))}).toList()`;
      default:
        return `${jsonAccess} as ${field.type}`;
    }
  };

  const toJsonValue = (field) => {
    const schema = getSingleNonNullSchema(field.schema);

    switch (schema.kind) {
      case 'object':
        return `${field.name}${field.type.endsWith('?') ? '?' : ''}.toJson()`;
      case 'array':
        return `${field.name}${field.type.endsWith('?') ? '?' : ''}.map((item) => ${toJsonArrayItem(schema.item)}).toList()`;
      default:
        return field.name;
    }
  };

  const buildClass = (objectSchema, nameHint) => {
    const className = getClassName(nameHint);
    const fields = objectSchema.fields.map((field) => {
      const baseType = schemaToType(field.schema, field.key);
      const nullable = field.optional || hasNull(field.schema);

      return {
        ...field,
        name: createFieldName(field.key, RESERVED_DART_WORDS),
        type: nullable && !baseType.endsWith('?') ? `${baseType}?` : baseType,
        required: !nullable
      };
    });

    if (!fields.length) {
      classes.push(`class ${className} {\n  const ${className}();\n\n  factory ${className}.fromJson(Map<String, dynamic> json) => const ${className}();\n\n  Map<String, dynamic> toJson() => <String, dynamic>{};\n}`);
      return className;
    }

    const fieldLines = fields.map((field) => `  final ${field.type} ${field.name};`);
    const constructorLines = fields.map((field) => `    ${field.required ? 'required ' : ''}this.${field.name},`);
    const fromJsonLines = fields.map((field) => `      ${field.name}: ${fromJsonValue(field)},`);
    const toJsonLines = fields.map((field) => `      ${JSON.stringify(field.key)}: ${toJsonValue(field)},`);

    classes.push(`class ${className} {\n${fieldLines.join('\n')}\n\n  const ${className}({\n${constructorLines.join('\n')}\n  });\n\n  factory ${className}.fromJson(Map<String, dynamic> json) {\n    return ${className}(\n${fromJsonLines.join('\n')}\n    );\n  }\n\n  Map<String, dynamic> toJson() {\n    return <String, dynamic>{\n${toJsonLines.join('\n')}\n    };\n  }\n}`);
    return className;
  };

  if (schema.kind === 'array') {
    const itemType = schemaToType(schema.item, `${rootName}Item`);
    const rootArrayItemFromJson = schema.item.kind === 'object'
      ? `${itemType}.fromJson(item as Map<String, dynamic>)`
      : `item as ${itemType}`;
    const rootArrayItemToJson = schema.item.kind === 'object' ? 'item.toJson()' : 'item';

    classes.push(`class ${toPascalCase(rootName)} {\n  final List<${itemType}> items;\n\n  const ${toPascalCase(rootName)}({\n    required this.items,\n  });\n\n  factory ${toPascalCase(rootName)}.fromJson(List<dynamic> json) {\n    return ${toPascalCase(rootName)}(\n      items: json.map((item) => ${rootArrayItemFromJson}).toList(),\n    );\n  }\n\n  List<dynamic> toJson() => items.map((item) => ${rootArrayItemToJson}).toList();\n}`);
  } else {
    schemaToType(schema, rootName);
  }

  return classes.join('\n\n');
};

export const generateResponseModel = (data, language, rootName = 'Response') => {
  const schema = normalizeRootSchema(data, rootName);

  switch (language) {
    case 'typescript':
      return buildTypeScript(schema, rootName);
    case 'java':
      return buildJava(schema, rootName);
    case 'dart':
      return buildDart(schema, rootName);
    default:
      throw new Error('Unsupported language');
  }
};

export const generateTypeScriptInterface = (data, rootName = 'Response') => {
  return generateResponseModel(data, 'typescript', rootName);
};

// ==============================================================================
// Kumaran Chits — Automated Dart API Model Generator
// Transforms docs/03-architecture/openapi-spec.json into strongly-typed Dart DTOs.
// Strict Null-Safety, Whole-Rupee int math, and fromJson / toJson serializers.
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';

const DART_RESERVED_WORDS = new Set([
  'assert', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
  'do', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'if',
  'in', 'is', 'new', 'null', 'rethrow', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'var', 'void', 'while', 'with', 'yield',
]);

interface SchemaProperty {
  type?: string;
  format?: string;
  $ref?: string;
  items?: SchemaProperty;
  nullable?: boolean;
  description?: string;
  example?: any;
  enum?: string[];
}

interface SchemaDefinition {
  type?: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  description?: string;
  enum?: string[];
}

const DECIMAL_RATE_FIELD_PATTERN = /(?:Rate|Percentage|Percent)$/i;

function resolveTypeName(prop: SchemaProperty, propName: string): { dartType: string; isComplex: boolean } {
  if (prop.$ref) {
    const refName = prop.$ref.split('/').pop() || 'dynamic';
    return { dartType: refName, isComplex: true };
  }

  if (prop.enum && prop.enum.length > 0) {
    return { dartType: 'String', isComplex: false };
  }

  if (prop.type === 'array') {
    if (prop.items) {
      if (prop.items.type === 'array' && !prop.items.items && !prop.items.$ref) {
        return { dartType: 'List<dynamic>', isComplex: false };
      }
      const inner = resolveTypeName(prop.items, propName);
      return { dartType: `List<${inner.dartType}>`, isComplex: inner.isComplex };
    }
    return { dartType: 'List<dynamic>', isComplex: false };
  }

  if (prop.type === 'integer') {
    // Pure Whole Rupee Math (Guardrail 2) -> 64-bit int
    return { dartType: 'int', isComplex: false };
  }

  if (prop.type === 'number') {
    // Guardrail 2: Only percentage/rate fields (e.g., foremanCommissionRate) use double;
    // all monetary values, ticket numbers, months, and counts MUST be 64-bit int.
    if (
      prop.format === 'float' ||
      prop.format === 'double' ||
      DECIMAL_RATE_FIELD_PATTERN.test(propName)
    ) {
      return { dartType: 'double', isComplex: false };
    }
    return { dartType: 'int', isComplex: false };
  }

  if (prop.type === 'boolean') {
    return { dartType: 'bool', isComplex: false };
  }

  if (prop.type === 'string') {
    return { dartType: 'String', isComplex: false };
  }

  return { dartType: 'dynamic', isComplex: false };
}

function sanitizeDartFieldName(name: string): { fieldName: string; jsonKey: string } {
  let field = name;
  if (field.startsWith('_')) {
    field = field.replace(/^_+/, '');
  }
  if (DART_RESERVED_WORDS.has(field) || field === '') {
    field = `${field || 'field'}_`;
  }
  // Convert kebab-case or snake_case if necessary, or preserve camelCase
  return { fieldName: field, jsonKey: name };
}

function generateDartClass(className: string, schema: SchemaDefinition): string {
  const properties = schema.properties || {};
  const requiredFields = new Set(schema.required || []);
  const lines: string[] = [];

  if (schema.description) {
    lines.push(`/// ${schema.description.replace(/\n/g, '\n/// ')}`);
  }
  lines.push(`class ${className} {`);

  const fields: Array<{
    jsonKey: string;
    fieldName: string;
    dartType: string;
    isNullable: boolean;
    isComplex: boolean;
    isList: boolean;
    innerType?: string;
    description?: string;
  }> = [];

  for (const [propName, prop] of Object.entries(properties)) {
    const { fieldName, jsonKey } = sanitizeDartFieldName(propName);
    const { dartType, isComplex } = resolveTypeName(prop, propName);
    const isRequired = requiredFields.has(propName);
    const isNullable = !isRequired || prop.nullable === true;
    const isList = dartType.startsWith('List<');
    const innerType = isList ? dartType.replace(/^List<|>$/g, '') : undefined;

    fields.push({
      jsonKey,
      fieldName,
      dartType,
      isNullable,
      isComplex,
      isList,
      innerType,
      description: prop.description,
    });

    if (prop.description) {
      lines.push(`  /// ${prop.description.replace(/\n/g, '\n  /// ')}`);
    }
    const nullableMarker = isNullable && dartType !== 'dynamic' ? '?' : '';
    lines.push(`  final ${dartType}${nullableMarker} ${fieldName};`);
  }

  lines.push('');

  // Constructor
  lines.push(`  const ${className}({`);
  for (const f of fields) {
    if (f.isNullable || f.dartType === 'dynamic') {
      lines.push(`    this.${f.fieldName},`);
    } else {
      lines.push(`    required this.${f.fieldName},`);
    }
  }
  lines.push('  });');
  lines.push('');

  // fromJson Factory
  lines.push(`  factory ${className}.fromJson(Map<String, dynamic> json) {`);
  lines.push(`    return ${className}(`);
  for (const f of fields) {
    const key = f.jsonKey;
    const isNullable = f.isNullable || f.dartType === 'dynamic';

    if (f.isList) {
      if (f.innerType && ['int', 'double', 'String', 'bool'].includes(f.innerType)) {
        if (f.innerType === 'int') {
          const mapper = `(json['${key}'] as List<dynamic>?)?.map((e) => _parseWholeRupeeInt(e)).toList()`;
          lines.push(`      ${f.fieldName}: ${isNullable ? mapper : `(${mapper}) ?? []`},`);
        } else if (f.innerType === 'double') {
          const mapper = `(json['${key}'] as List<dynamic>?)?.map((e) => _parseDecimalRate(e)).toList()`;
          lines.push(`      ${f.fieldName}: ${isNullable ? mapper : `(${mapper}) ?? []`},`);
        } else if (f.innerType === 'String') {
          const mapper = `(json['${key}'] as List<dynamic>?)?.map((e) => e.toString()).toList()`;
          lines.push(`      ${f.fieldName}: ${isNullable ? mapper : `(${mapper}) ?? []`},`);
        } else {
          const mapper = `(json['${key}'] as List<dynamic>?)?.map((e) => e as bool).toList()`;
          lines.push(`      ${f.fieldName}: ${isNullable ? mapper : `(${mapper}) ?? []`},`);
        }
      } else if (f.isComplex && f.innerType && f.innerType !== 'dynamic') {
        const mapper = `(json['${key}'] as List<dynamic>?)?.map((e) => ${f.innerType}.fromJson(e as Map<String, dynamic>)).toList()`;
        lines.push(`      ${f.fieldName}: ${isNullable ? mapper : `(${mapper}) ?? []`},`);
      } else {
        const mapper = `json['${key}'] as List<dynamic>?`;
        lines.push(`      ${f.fieldName}: ${isNullable ? mapper : `(${mapper}) ?? []`},`);
      }
    } else if (f.isComplex && f.dartType !== 'dynamic') {
      const mapper = `json['${key}'] != null ? ${f.dartType}.fromJson(json['${key}'] as Map<String, dynamic>) : null`;
      lines.push(
        `      ${f.fieldName}: ${isNullable ? mapper : `(${mapper}) ?? ${f.dartType}.fromJson(const {})`},`,
      );
    } else if (f.dartType === 'int') {
      lines.push(
        `      ${f.fieldName}: ${isNullable ? `_parseWholeRupeeIntOrNull(json['${key}'])` : `_parseWholeRupeeInt(json['${key}'])`},`,
      );
    } else if (f.dartType === 'double') {
      lines.push(
        `      ${f.fieldName}: ${isNullable ? `_parseDecimalRateOrNull(json['${key}'])` : `_parseDecimalRate(json['${key}'])`},`,
      );
    } else if (f.dartType === 'bool') {
      lines.push(`      ${f.fieldName}: ${isNullable ? `json['${key}'] as bool?` : `json['${key}'] as bool? ?? false`},`);
    } else if (f.dartType === 'String') {
      lines.push(`      ${f.fieldName}: ${isNullable ? `json['${key}']?.toString()` : `json['${key}']?.toString() ?? ''`},`);
    } else {
      lines.push(`      ${f.fieldName}: json['${key}'],`);
    }
  }
  lines.push('    );');
  lines.push('  }');
  lines.push('');

  // toJson
  lines.push('  Map<String, dynamic> toJson() {');
  lines.push('    final Map<String, dynamic> data = <String, dynamic>{};');
  for (const f of fields) {
    const key = f.jsonKey;
    if (f.isNullable) {
      if (f.isList && f.isComplex) {
        lines.push(
          `    if (${f.fieldName} != null) { data['${key}'] = ${f.fieldName}!.map((v) => v.toJson()).toList(); }`,
        );
      } else if (f.isComplex && f.dartType !== 'dynamic') {
        lines.push(
          `    if (${f.fieldName} != null) { data['${key}'] = ${f.fieldName}!.toJson(); }`,
        );
      } else {
        lines.push(`    data['${key}'] = ${f.fieldName};`);
      }
    } else {
      if (f.isList && f.isComplex) {
        lines.push(
          `    data['${key}'] = ${f.fieldName}.map((v) => v.toJson()).toList();`,
        );
      } else if (f.isComplex && f.dartType !== 'dynamic') {
        lines.push(
          `    data['${key}'] = ${f.fieldName}.toJson();`,
        );
      } else {
        lines.push(`    data['${key}'] = ${f.fieldName};`);
      }
    }
  }
  lines.push('    return data;');
  lines.push('  }');

  lines.push('}');
  return lines.join('\n');
}

export function runGenerator() {
  const rootDir = process.cwd();
  const specPath = path.resolve(rootDir, 'docs/03-architecture/openapi-spec.json');
  const targetDir = path.resolve(rootDir, 'apps/mobile/lib/core/api/models');
  const targetFile = path.resolve(targetDir, 'api_models.dart');

  console.log(`[Dart Generator] Reading OpenAPI specification from: ${specPath}`);
  if (!fs.existsSync(specPath)) {
    throw new Error(`OpenAPI spec not found at: ${specPath}`);
  }

  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const schemas: Record<string, SchemaDefinition> = spec.components?.schemas || {};
  const schemaNames = Object.keys(schemas);
  console.log(`[Dart Generator] Identified ${schemaNames.length} OpenAPI schemas to generate.`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const buffer: string[] = [
    '// ==============================================================================',
    '// Kumaran Chits — Autogenerated Dart API Models',
    '// Source: docs/03-architecture/openapi-spec.json',
    '// Compliance: Strict Null-Safety, Whole-Rupee integer math, Indian DPDP Act 2023',
    '// DO NOT EDIT MANUALLY. Generated by scripts/generate-dart-api.ts',
    '// ==============================================================================',
    '',
    '// ignore_for_file: unused_import, non_constant_identifier_names, unnecessary_null_comparison, unnecessary_non_null_assertion',
    '',
    '/// Guardrail 2: Parses whole-Rupee 64-bit integers safely from JSON int, num,',
    '/// or BigInt-serialized decimal string without IEEE-754 double precision loss.',
    'int? _parseWholeRupeeIntOrNull(dynamic value) {',
    '  if (value == null) return null;',
    '  if (value is int) return value;',
    '  if (value is num) return value.toInt();',
    '  if (value is String) {',
    '    final trimmed = value.trim();',
    '    if (trimmed.isEmpty) return null;',
    '    final direct = int.tryParse(trimmed);',
    '    if (direct != null) return direct;',
    '    final intPart = trimmed.split(\'.\').first.replaceAll(RegExp(r\'[^0-9-]\'), \'\');',
    '    return int.tryParse(intPart);',
    '  }',
    '  return null;',
    '}',
    '',
    'int _parseWholeRupeeInt(dynamic value, [int fallback = 0]) {',
    '  return _parseWholeRupeeIntOrNull(value) ?? fallback;',
    '}',
    '',
    '/// Parses decimal percentage rates (e.g. frozen foremanCommissionRate 4.00%) safely.',
    'double? _parseDecimalRateOrNull(dynamic value) {',
    '  if (value == null) return null;',
    '  if (value is num) return value.toDouble();',
    '  if (value is String) {',
    '    final cleaned = value.trim().replaceAll(\'%\', \'\');',
    '    return double.tryParse(cleaned);',
    '  }',
    '  return null;',
    '}',
    '',
    'double _parseDecimalRate(dynamic value, [double fallback = 0.0]) {',
    '  return _parseDecimalRateOrNull(value) ?? fallback;',
    '}',
    '',
  ];

  for (const name of schemaNames) {
    const schema = schemas[name];
    if (schema.type === 'object' || schema.properties) {
      buffer.push(generateDartClass(name, schema));
      buffer.push('');
    }
  }

  fs.writeFileSync(targetFile, buffer.join('\n'), 'utf8');
  console.log(`[Dart Generator] Successfully generated ${schemaNames.length} Dart classes at:`);
  console.log(`                 ${targetFile}`);
}

// Execute when invoked directly
runGenerator();

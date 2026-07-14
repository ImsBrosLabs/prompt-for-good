import { ApiProperty } from "@nestjs/swagger";

const runtimeConfigSources = ["database", "environment", "default"] as const;
const runtimeConfigValueTypes = [
  "boolean",
  "integer",
  "string",
  "json",
] as const;

const runtimeConfigValueSchema = [
  { type: "string" },
  { type: "number" },
  { type: "boolean" },
  { type: "object", additionalProperties: true },
  { type: "array", items: {} },
];

const nullableRuntimeConfigValueSchema = [
  ...runtimeConfigValueSchema,
  { type: "null" },
];

export class RuntimeConfigMetadataDto {
  @ApiProperty({ example: "LLM_MODEL", type: String })
  env!: string;

  @ApiProperty({ example: "Model name", type: String })
  label!: string;

  @ApiProperty({
    example: "Model name passed to the selected provider.",
    type: String,
  })
  description!: string;

  @ApiProperty({ example: "Model provider", type: String })
  category!: string;

  @ApiProperty({
    description: "Whether the effective value is hidden in admin responses",
    type: Boolean,
  })
  secret!: boolean;

  @ApiProperty({ enum: runtimeConfigValueTypes, type: String })
  valueType!: (typeof runtimeConfigValueTypes)[number];

  @ApiProperty({
    description: "Catalog fallback value, hidden as null when secret is true",
    oneOf: nullableRuntimeConfigValueSchema,
    type: Array,
  })
  defaultValue!: unknown;

  @ApiProperty({
    description: "Whether the key is needed for first-run setup completion",
    type: Boolean,
  })
  requiredForSetup!: boolean;
}

export class RuntimeConfigItemDto {
  @ApiProperty({ example: "LLM_MODEL", type: String })
  id!: string;

  @ApiProperty({ example: "LLM_MODEL", type: String })
  key!: string;

  @ApiProperty({
    description: "Effective value, hidden as null when secret is true",
    oneOf: nullableRuntimeConfigValueSchema,
    type: Array,
  })
  value!: unknown;

  @ApiProperty({
    description:
      "Raw environment variable value for this catalog entry, hidden as null when secret is true or unset",
    nullable: true,
    type: String,
  })
  environmentValue!: string | null;

  @ApiProperty({ enum: runtimeConfigSources, type: String })
  source!: (typeof runtimeConfigSources)[number];

  @ApiProperty({ type: Boolean })
  hasDatabaseOverride!: boolean;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  updatedAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  updatedBy!: string | null;

  @ApiProperty({ type: RuntimeConfigMetadataDto })
  metadata!: RuntimeConfigMetadataDto;
}

export class RuntimeConfigListResponseDto {
  @ApiProperty({ type: [RuntimeConfigItemDto] })
  data!: RuntimeConfigItemDto[];

  @ApiProperty({ example: 18, format: "int32", type: Number })
  total!: number;
}

export class RuntimeConfigUpdateRequestDto {
  @ApiProperty({
    description: "JSON value validated by the catalog schema for this key",
    oneOf: runtimeConfigValueSchema,
    type: Array,
  })
  value!: unknown;
}

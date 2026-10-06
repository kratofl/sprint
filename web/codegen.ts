import type { CodegenConfig } from '@graphql-codegen/cli'

// Generates TypeScript types from the Sprint GraphQL API schema. The schema is
// committed as schema.graphql (exported from api/Sprint.Api) so codegen runs
// offline in CI; refresh it with `make schema` / the schema exporter when the
// server contract changes.
//
// lib/gql/operations.ts holds one typed `<Name>Document` per operation under
// lib/gql/**/*.graphql, with its result and variables types. This is what
// lib/api/request.ts sends; views use the result types re-exported from
// lib/records.ts. typescript-operations v6 emits the input types and enums an
// operation needs itself, so no separate schema-types output is needed.
const scalars = { DateTime: 'string', Long: 'number' }

const config: CodegenConfig = {
  schema: process.env.GRAPHQL_SCHEMA ?? './schema.graphql',
  documents: ['lib/gql/**/*.graphql'],
  generates: {
    'lib/gql/operations.ts': {
      plugins: ['typescript-operations', './lib/gql/operations-plugin.ts'],
      config: { useTypeImports: true, skipTypename: true, scalars },
    },
  },
}

export default config

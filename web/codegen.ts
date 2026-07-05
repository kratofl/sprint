import type { CodegenConfig } from '@graphql-codegen/cli'

// Generates TypeScript types from the Sprint GraphQL API schema. The schema is
// committed as schema.graphql (exported from api/Sprint.Api) so codegen runs
// offline in CI; refresh it with `make schema` / the schema exporter when the
// server contract changes. Operations live under lib/gql/**/*.graphql.
const config: CodegenConfig = {
  schema: process.env.GRAPHQL_SCHEMA ?? './schema.graphql',
  documents: ['lib/gql/**/*.graphql'],
  generates: {
    'lib/gql/generated.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        useTypeImports: true,
        skipTypename: true,
        scalars: { DateTime: 'string', Long: 'number' },
      },
    },
  },
}

export default config

// Local graphql-codegen plugin (wired in codegen.ts). For every operation under
// lib/gql/**/*.graphql it emits a typed constant that carries the operation text
// plus its result and variables types, e.g. `MeDocument: Operation<MeQuery,
// MeQueryVariables>`. The result/variables types come from the
// `typescript-operations` plugin in the same file. This replaces
// @graphql-codegen/typed-document-node, whose string mode needs a second
// package and emits `any`. Fragments are not supported; keep operations
// self-contained.

// The slice of graphql-js's DocumentNode this plugin reads. graphql is not a
// direct dependency of the web app, so it is typed structurally here.
type Definition = {
  kind: string
  operation?: string
  name?: { value: string }
  loc?: { start: number; end: number; source: { body: string } }
}
type DocumentFile = { location?: string; document?: { definitions: readonly Definition[] } }

const header = `
// A GraphQL operation as sent to the API, typed with its result and variables.
export type Operation<TResult, TVariables> = {
  readonly query: string
  readonly __types?: { result: TResult; variables: TVariables }
}
`

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

// Emits one `<Name>Document` constant per named operation, in document order.
export function plugin(_schema: unknown, documents: readonly DocumentFile[]): string {
  const constants = documents.flatMap((file) =>
    (file.document?.definitions ?? []).map((definition) => {
      if (definition.kind === 'FragmentDefinition') {
        throw new Error(`${file.location}: fragments are not supported by operations-plugin.ts`)
      }
      const { name, operation, loc } = definition
      if (definition.kind !== 'OperationDefinition' || !name || !operation || !loc) {
        throw new Error(`${file.location}: every operation needs a name`)
      }
      const types = `${name.value}${capitalize(operation)}`
      const text = loc.source.body.slice(loc.start, loc.end)
      return `export const ${name.value}Document: Operation<${types}, ${types}Variables> = {\n  query: ${JSON.stringify(text)},\n}\n`
    }),
  )
  return [header, ...constants].join('\n')
}

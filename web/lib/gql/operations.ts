/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type AuthRequestInput = {
  email: string;
  password: string;
};

export type UpdateServerSettingsInput = {
  allowRegistration: boolean;
  instanceName: string;
};

export type LoginMutationVariables = Exact<{
  input: AuthRequestInput;
}>;


export type LoginMutation = { session: { token: string } };

export type RegisterMutationVariables = Exact<{
  input: AuthRequestInput;
}>;


export type RegisterMutation = { session: { token: string } };

export type ServerSettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type ServerSettingsQuery = { serverSettings: { instanceName: string, allowRegistration: boolean } };

export type SessionsQueryVariables = Exact<{ [key: string]: never; }>;


export type SessionsQuery = { sessions: Array<{ id: string, game: string, track: string, car: string, sessionType: string, startedAt: string | null, createdAt: string }> };

export type SettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type SettingsQuery = { me: { id: string, email: string, displayName: string, isAdmin: boolean } | null, serverSettings: { instanceName: string, allowRegistration: boolean } };

export type SetDisplayNameMutationVariables = Exact<{
  displayName: string;
}>;


export type SetDisplayNameMutation = { setDisplayName: { id: string, displayName: string } };

export type ChangePasswordMutationVariables = Exact<{
  currentPassword: string;
  newPassword: string;
}>;


export type ChangePasswordMutation = { changePassword: boolean };

export type UpdateServerSettingsMutationVariables = Exact<{
  input: UpdateServerSettingsInput;
}>;


export type UpdateServerSettingsMutation = { updateServerSettings: { instanceName: string, allowRegistration: boolean } };

export type SetupsQueryVariables = Exact<{ [key: string]: never; }>;


export type SetupsQuery = { setups: Array<{ id: string, name: string, game: string, car: string, track: string, updatedAt: string }> };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { me: { id: string, email: string, displayName: string, isAdmin: boolean, createdAt: string } | null };


// A GraphQL operation as sent to the API, typed with its result and variables.
export type Operation<TResult, TVariables> = {
  readonly query: string
  readonly __types?: { result: TResult; variables: TVariables }
}

export const LoginDocument: Operation<LoginMutation, LoginMutationVariables> = {
  query: "mutation Login($input: AuthRequestInput!) {\n  session: login(input: $input) {\n    token\n  }\n}",
}

export const RegisterDocument: Operation<RegisterMutation, RegisterMutationVariables> = {
  query: "mutation Register($input: AuthRequestInput!) {\n  session: register(input: $input) {\n    token\n  }\n}",
}

export const ServerSettingsDocument: Operation<ServerSettingsQuery, ServerSettingsQueryVariables> = {
  query: "query ServerSettings {\n  serverSettings {\n    instanceName\n    allowRegistration\n  }\n}",
}

export const SessionsDocument: Operation<SessionsQuery, SessionsQueryVariables> = {
  query: "query Sessions {\n  sessions {\n    id\n    game\n    track\n    car\n    sessionType\n    startedAt\n    createdAt\n  }\n}",
}

export const SettingsDocument: Operation<SettingsQuery, SettingsQueryVariables> = {
  query: "query Settings {\n  me {\n    id\n    email\n    displayName\n    isAdmin\n  }\n  serverSettings {\n    instanceName\n    allowRegistration\n  }\n}",
}

export const SetDisplayNameDocument: Operation<SetDisplayNameMutation, SetDisplayNameMutationVariables> = {
  query: "mutation SetDisplayName($displayName: String!) {\n  setDisplayName(displayName: $displayName) {\n    id\n    displayName\n  }\n}",
}

export const ChangePasswordDocument: Operation<ChangePasswordMutation, ChangePasswordMutationVariables> = {
  query: "mutation ChangePassword($currentPassword: String!, $newPassword: String!) {\n  changePassword(currentPassword: $currentPassword, newPassword: $newPassword)\n}",
}

export const UpdateServerSettingsDocument: Operation<UpdateServerSettingsMutation, UpdateServerSettingsMutationVariables> = {
  query: "mutation UpdateServerSettings($input: UpdateServerSettingsInput!) {\n  updateServerSettings(input: $input) {\n    instanceName\n    allowRegistration\n  }\n}",
}

export const SetupsDocument: Operation<SetupsQuery, SetupsQueryVariables> = {
  query: "query Setups {\n  setups {\n    id\n    name\n    game\n    car\n    track\n    updatedAt\n  }\n}",
}

export const MeDocument: Operation<MeQuery, MeQueryVariables> = {
  query: "query Me {\n  me {\n    id\n    email\n    displayName\n    isAdmin\n    createdAt\n  }\n}",
}

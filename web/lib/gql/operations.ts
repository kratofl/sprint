/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type AuthRequestInput = {
  email: string;
  password: string;
};

export type EngineerInviteStatus =
  | 'EXPIRED'
  | 'NOT_FOUND'
  | 'REVOKED'
  | 'USED'
  | 'VALID';

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

export type RedeemSignInTicketMutationVariables = Exact<{
  ticket: string;
}>;


export type RedeemSignInTicketMutation = { session: { token: string } };

export type EngineersQueryVariables = Exact<{ [key: string]: never; }>;


export type EngineersQuery = { me: { displayName: string } | null, myEngineers: Array<{ createdAt: string, engineer: { id: string, displayName: string, avatarUrl: string | null } }>, myDrivers: Array<{ createdAt: string, driver: { id: string, displayName: string, avatarUrl: string | null } }>, myEngineerInvites: Array<{ token: string, url: string, status: EngineerInviteStatus, createdAt: string, expiresAt: string }> };

export type EngineerInviteQueryVariables = Exact<{
  token: string;
}>;


export type EngineerInviteQuery = { engineerInvite: { status: EngineerInviteStatus, expiresAt: string | null, driver: { id: string, displayName: string, avatarUrl: string | null } | null } };

export type CreateEngineerInviteMutationVariables = Exact<{ [key: string]: never; }>;


export type CreateEngineerInviteMutation = { createEngineerInvite: { token: string, url: string } };

export type RevokeEngineerInviteMutationVariables = Exact<{
  token: string;
}>;


export type RevokeEngineerInviteMutation = { revokeEngineerInvite: boolean };

export type AcceptEngineerInviteMutationVariables = Exact<{
  token: string;
}>;


export type AcceptEngineerInviteMutation = { acceptEngineerInvite: { driver: { id: string, displayName: string } } };

export type RemoveEngineerMutationVariables = Exact<{
  engineerId: string;
}>;


export type RemoveEngineerMutation = { removeEngineer: boolean };

export type LeaveDriverMutationVariables = Exact<{
  driverId: string;
}>;


export type LeaveDriverMutation = { leaveDriver: boolean };

export type ServerSettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type ServerSettingsQuery = { serverSettings: { instanceName: string, allowRegistration: boolean, discordSignIn: boolean } };

export type SessionsQueryVariables = Exact<{ [key: string]: never; }>;


export type SessionsQuery = { visibleSessions: Array<{ id: string, sessionKey: string, isMine: boolean, isLive: boolean, game: string, track: string, car: string, sessionType: string, startedAt: string | null, createdAt: string, driver: { id: string, displayName: string, avatarUrl: string | null } }> };

export type LiveSessionsQueryVariables = Exact<{ [key: string]: never; }>;


export type LiveSessionsQuery = { liveSessions: Array<{ sessionId: string, sessionKey: string, game: string, track: string, car: string, sessionType: string, startedAt: string, connected: boolean, driver: { id: string, displayName: string, avatarUrl: string | null } }> };

export type SessionDetailQueryVariables = Exact<{
  id: string;
}>;


export type SessionDetailQuery = { visibleSession: { id: string, sessionKey: string, isMine: boolean, isLive: boolean, game: string, track: string, car: string, sessionType: string, startedAt: string | null, createdAt: string, data: string, driver: { id: string, displayName: string, avatarUrl: string | null }, engineerAccess: Array<{ hasAccess: boolean, engineer: { id: string, displayName: string, avatarUrl: string | null } }> } | null };

export type SessionTelemetryQueryVariables = Exact<{
  sessionId: string;
  maxPoints: number;
}>;


export type SessionTelemetryQuery = { sessionTelemetry: { sessionId: string, sessionKey: string, samples: Array<{ timestamp: number, lap: number, sector: number, currentLapTime: number, lastLapTime: number, bestLapTime: number, delta: number, lapValid: boolean, position: number, speedKph: number, rpm: number, maxRpm: number, gear: number, throttle: number, brake: number, steering: number, fuel: number, trackPosition: number, tyreTempFl: number, tyreTempFr: number, tyreTempRl: number, tyreTempRr: number, tyreWearFl: number, tyreWearFr: number, tyreWearRl: number, tyreWearRr: number }>, laps: Array<{ lap: number, lapTime: number, valid: boolean, completedAt: number }> } };

export type ExcludeEngineerFromSessionMutationVariables = Exact<{
  sessionId: string;
  engineerId: string;
}>;


export type ExcludeEngineerFromSessionMutation = { excludeEngineerFromSession: boolean };

export type IncludeEngineerInSessionMutationVariables = Exact<{
  sessionId: string;
  engineerId: string;
}>;


export type IncludeEngineerInSessionMutation = { includeEngineerInSession: boolean };

export type SettingsQueryVariables = Exact<{ [key: string]: never; }>;


export type SettingsQuery = { me: { id: string, email: string, displayName: string, isAdmin: boolean, hasPassword: boolean, discordLinked: boolean } | null, serverSettings: { instanceName: string, allowRegistration: boolean } };

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


export type MeQuery = { me: { id: string, email: string, displayName: string, avatarUrl: string | null, isAdmin: boolean, createdAt: string } | null };


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

export const RedeemSignInTicketDocument: Operation<RedeemSignInTicketMutation, RedeemSignInTicketMutationVariables> = {
  query: "mutation RedeemSignInTicket($ticket: String!) {\n  session: redeemSignInTicket(ticket: $ticket) {\n    token\n  }\n}",
}

export const EngineersDocument: Operation<EngineersQuery, EngineersQueryVariables> = {
  query: "query Engineers {\n  me {\n    displayName\n  }\n  myEngineers {\n    engineer {\n      id\n      displayName\n      avatarUrl\n    }\n    createdAt\n  }\n  myDrivers {\n    driver {\n      id\n      displayName\n      avatarUrl\n    }\n    createdAt\n  }\n  myEngineerInvites {\n    token\n    url\n    status\n    createdAt\n    expiresAt\n  }\n}",
}

export const EngineerInviteDocument: Operation<EngineerInviteQuery, EngineerInviteQueryVariables> = {
  query: "query EngineerInvite($token: String!) {\n  engineerInvite(token: $token) {\n    status\n    driver {\n      id\n      displayName\n      avatarUrl\n    }\n    expiresAt\n  }\n}",
}

export const CreateEngineerInviteDocument: Operation<CreateEngineerInviteMutation, CreateEngineerInviteMutationVariables> = {
  query: "mutation CreateEngineerInvite {\n  createEngineerInvite {\n    token\n    url\n  }\n}",
}

export const RevokeEngineerInviteDocument: Operation<RevokeEngineerInviteMutation, RevokeEngineerInviteMutationVariables> = {
  query: "mutation RevokeEngineerInvite($token: String!) {\n  revokeEngineerInvite(token: $token)\n}",
}

export const AcceptEngineerInviteDocument: Operation<AcceptEngineerInviteMutation, AcceptEngineerInviteMutationVariables> = {
  query: "mutation AcceptEngineerInvite($token: String!) {\n  acceptEngineerInvite(token: $token) {\n    driver {\n      id\n      displayName\n    }\n  }\n}",
}

export const RemoveEngineerDocument: Operation<RemoveEngineerMutation, RemoveEngineerMutationVariables> = {
  query: "mutation RemoveEngineer($engineerId: String!) {\n  removeEngineer(engineerId: $engineerId)\n}",
}

export const LeaveDriverDocument: Operation<LeaveDriverMutation, LeaveDriverMutationVariables> = {
  query: "mutation LeaveDriver($driverId: String!) {\n  leaveDriver(driverId: $driverId)\n}",
}

export const ServerSettingsDocument: Operation<ServerSettingsQuery, ServerSettingsQueryVariables> = {
  query: "query ServerSettings {\n  serverSettings {\n    instanceName\n    allowRegistration\n    discordSignIn\n  }\n}",
}

export const SessionsDocument: Operation<SessionsQuery, SessionsQueryVariables> = {
  query: "query Sessions {\n  visibleSessions {\n    id\n    sessionKey\n    driver {\n      id\n      displayName\n      avatarUrl\n    }\n    isMine\n    isLive\n    game\n    track\n    car\n    sessionType\n    startedAt\n    createdAt\n  }\n}",
}

export const LiveSessionsDocument: Operation<LiveSessionsQuery, LiveSessionsQueryVariables> = {
  query: "query LiveSessions {\n  liveSessions {\n    sessionId\n    sessionKey\n    driver {\n      id\n      displayName\n      avatarUrl\n    }\n    game\n    track\n    car\n    sessionType\n    startedAt\n    connected\n  }\n}",
}

export const SessionDetailDocument: Operation<SessionDetailQuery, SessionDetailQueryVariables> = {
  query: "query SessionDetail($id: String!) {\n  visibleSession(id: $id) {\n    id\n    sessionKey\n    driver {\n      id\n      displayName\n      avatarUrl\n    }\n    isMine\n    isLive\n    game\n    track\n    car\n    sessionType\n    startedAt\n    createdAt\n    data\n    engineerAccess {\n      engineer {\n        id\n        displayName\n        avatarUrl\n      }\n      hasAccess\n    }\n  }\n}",
}

export const SessionTelemetryDocument: Operation<SessionTelemetryQuery, SessionTelemetryQueryVariables> = {
  query: "query SessionTelemetry($sessionId: String!, $maxPoints: Int!) {\n  sessionTelemetry(sessionId: $sessionId, maxPoints: $maxPoints) {\n    sessionId\n    sessionKey\n    samples {\n      timestamp\n      lap\n      sector\n      currentLapTime\n      lastLapTime\n      bestLapTime\n      delta\n      lapValid\n      position\n      speedKph\n      rpm\n      maxRpm\n      gear\n      throttle\n      brake\n      steering\n      fuel\n      trackPosition\n      tyreTempFl\n      tyreTempFr\n      tyreTempRl\n      tyreTempRr\n      tyreWearFl\n      tyreWearFr\n      tyreWearRl\n      tyreWearRr\n    }\n    laps {\n      lap\n      lapTime\n      valid\n      completedAt\n    }\n  }\n}",
}

export const ExcludeEngineerFromSessionDocument: Operation<ExcludeEngineerFromSessionMutation, ExcludeEngineerFromSessionMutationVariables> = {
  query: "mutation ExcludeEngineerFromSession($sessionId: String!, $engineerId: String!) {\n  excludeEngineerFromSession(sessionId: $sessionId, engineerId: $engineerId)\n}",
}

export const IncludeEngineerInSessionDocument: Operation<IncludeEngineerInSessionMutation, IncludeEngineerInSessionMutationVariables> = {
  query: "mutation IncludeEngineerInSession($sessionId: String!, $engineerId: String!) {\n  includeEngineerInSession(sessionId: $sessionId, engineerId: $engineerId)\n}",
}

export const SettingsDocument: Operation<SettingsQuery, SettingsQueryVariables> = {
  query: "query Settings {\n  me {\n    id\n    email\n    displayName\n    isAdmin\n    hasPassword\n    discordLinked\n  }\n  serverSettings {\n    instanceName\n    allowRegistration\n  }\n}",
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
  query: "query Me {\n  me {\n    id\n    email\n    displayName\n    avatarUrl\n    isAdmin\n    createdAt\n  }\n}",
}

export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** The `DateTime` scalar type represents a date and time with time zone offset information. */
  DateTime: { input: string; output: string; }
  /** The `Long` scalar type represents a signed 64-bit integer. */
  Long: { input: number; output: number; }
};

/** Defines when a policy shall be executed. */
export enum ApplyPolicy {
  /** After the resolver was executed. */
  AfterResolver = 'AFTER_RESOLVER',
  /** Before the resolver was executed. */
  BeforeResolver = 'BEFORE_RESOLVER',
  /** The policy is applied in the validation step before the execution. */
  Validation = 'VALIDATION'
}

export type AuthRequestInput = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};

export type AuthResponse = {
  token: Scalars['String']['output'];
};

export type CreateSessionInput = {
  car: Scalars['String']['input'];
  game: Scalars['String']['input'];
  sessionType: Scalars['String']['input'];
  track: Scalars['String']['input'];
};

export type EngineerCommandMessage = {
  from: Scalars['String']['output'];
  id: Scalars['String']['output'];
  payload?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['Long']['output'];
  type: EngineerCommandType;
};

export type EngineerCommandMessageInput = {
  from: Scalars['String']['input'];
  id: Scalars['String']['input'];
  payload?: InputMaybe<Scalars['String']['input']>;
  timestamp: Scalars['Long']['input'];
  type: EngineerCommandType;
};

export enum EngineerCommandType {
  RequestSync = 'REQUEST_SYNC',
  SendNote = 'SEND_NOTE',
  SetTargetLap = 'SET_TARGET_LAP'
}

export type EngineerEventMessage = {
  payload?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['Long']['output'];
  type: EngineerEventType;
};

export type EngineerEventMessageInput = {
  payload?: InputMaybe<Scalars['String']['input']>;
  timestamp: Scalars['Long']['input'];
  type: EngineerEventType;
};

export enum EngineerEventType {
  LapCompleted = 'LAP_COMPLETED',
  SessionChanged = 'SESSION_CHANGED',
  TargetChanged = 'TARGET_CHANGED',
  TelemetryFrame = 'TELEMETRY_FRAME'
}

export type HealthStatus = {
  status: Scalars['String']['output'];
  version: Scalars['String']['output'];
};

export type InviteCodeDto = {
  createdAt: Scalars['DateTime']['output'];
  driverId: Scalars['String']['output'];
  driverJoined: Scalars['Boolean']['output'];
  expiresAt: Scalars['DateTime']['output'];
  sessionId?: Maybe<Scalars['String']['output']>;
  value: Scalars['String']['output'];
};

export type LayoutSummary = {
  createdAt: Scalars['DateTime']['output'];
  data: Scalars['String']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type Mutation = {
  createInviteCode: InviteCodeDto;
  createSession: SessionSummary;
  joinAsDriver: Scalars['Boolean']['output'];
  login: AuthResponse;
  publishEngineerEvent: Scalars['Boolean']['output'];
  register: AuthResponse;
  saveLayout: LayoutSummary;
  saveSetup: SetupSummary;
  sendEngineerCommand: Scalars['Boolean']['output'];
};


export type MutationCreateInviteCodeArgs = {
  sessionId?: InputMaybe<Scalars['String']['input']>;
};


export type MutationCreateSessionArgs = {
  input: CreateSessionInput;
};


export type MutationJoinAsDriverArgs = {
  code: Scalars['String']['input'];
};


export type MutationLoginArgs = {
  input: AuthRequestInput;
};


export type MutationPublishEngineerEventArgs = {
  code: Scalars['String']['input'];
  message: EngineerEventMessageInput;
};


export type MutationRegisterArgs = {
  input: AuthRequestInput;
};


export type MutationSaveLayoutArgs = {
  input: SaveLayoutInput;
};


export type MutationSaveSetupArgs = {
  input: SaveSetupInput;
};


export type MutationSendEngineerCommandArgs = {
  code: Scalars['String']['input'];
  message: EngineerCommandMessageInput;
};

export type Query = {
  health: HealthStatus;
  layout?: Maybe<LayoutSummary>;
  layouts: Array<LayoutSummary>;
  me?: Maybe<UserProfile>;
  recentTelemetry: Array<TelemetrySample>;
  session?: Maybe<SessionSummary>;
  sessions: Array<SessionSummary>;
  setup?: Maybe<SetupSummary>;
  setups: Array<SetupSummary>;
};


export type QueryLayoutArgs = {
  id: Scalars['String']['input'];
};


export type QueryRecentTelemetryArgs = {
  code: Scalars['String']['input'];
  limit: Scalars['Int']['input'];
};


export type QuerySessionArgs = {
  id: Scalars['String']['input'];
};


export type QuerySetupArgs = {
  id: Scalars['String']['input'];
};

export type SaveLayoutInput = {
  data: Scalars['String']['input'];
  id?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type SaveSetupInput = {
  car: Scalars['String']['input'];
  data: Scalars['String']['input'];
  game: Scalars['String']['input'];
  id?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  track: Scalars['String']['input'];
};

export type SessionSummary = {
  car: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  game: Scalars['String']['output'];
  id: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  sessionType: Scalars['String']['output'];
  track: Scalars['String']['output'];
};

export type SetupSummary = {
  car: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  data: Scalars['String']['output'];
  game: Scalars['String']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  ownerId: Scalars['String']['output'];
  track: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type Subscription = {
  engineerCommands: EngineerCommandMessage;
  engineerEvents: EngineerEventMessage;
};


export type SubscriptionEngineerCommandsArgs = {
  code: Scalars['String']['input'];
  token: Scalars['String']['input'];
};


export type SubscriptionEngineerEventsArgs = {
  code: Scalars['String']['input'];
  token: Scalars['String']['input'];
};

export type TelemetrySample = {
  brake: Scalars['Float']['output'];
  gear: Scalars['Int']['output'];
  lap: Scalars['Int']['output'];
  lapTime: Scalars['Float']['output'];
  rpm: Scalars['Float']['output'];
  speed: Scalars['Float']['output'];
  throttle: Scalars['Float']['output'];
  timestamp: Scalars['DateTime']['output'];
};

export type UserProfile = {
  createdAt: Scalars['DateTime']['output'];
  email: Scalars['String']['output'];
  id: Scalars['String']['output'];
};

export type HealthQueryVariables = Exact<{ [key: string]: never; }>;


export type HealthQuery = { health: { status: string, version: string } };

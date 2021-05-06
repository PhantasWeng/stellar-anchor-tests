import { Request, Response } from "node-fetch";

export type SEP = 1 | 6 | 10 | 12 | 24 | 31;
export type SepConfig = { [key in SEP]: object };

export interface Config {
  homeDomain: string;
  seps: SEP[];
  verbose?: boolean;
  currency?: string;
  searchStrings?: string[];
  sepConfig?: SepConfig;
  mainnetMasterAccountSecret?: string;
}

export interface NetworkCall {
  request: Request;
  response?: Response;
}

export interface Failure {
  name: string;
  text: (args?: object) => string;
  message?: string;
}

export interface Result {
  test: Test;
  networkCalls: NetworkCall[];
  suite?: Suite;
  expected?: string | number | object;
  actual?: string | number | object;
  failure?: Failure;
}

export interface Test {
  assertion: string;
  successMessage: string;
  failureModes: Record<string, Failure>;
  before?: (config: Config, suite?: Suite) => Promise<Result | void>;
  run(config: Config, suite?: Suite): Promise<Result>;
  after?: (config: Config, suite?: Suite) => Promise<Result | void>;
}

export interface Suite {
  name: string;
  tests: Test[];
  sep?: SEP;
}

export interface Stats {
  total: number;
  passed: number;
  failed: number;
  sep?: SEP;
  name?: string;
  suiteStats?: Stats[];
}

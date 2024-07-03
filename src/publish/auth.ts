import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import npa from 'npm-package-arg';

export interface AuthOptions {
  [key: string]: any;
  spec?: string;
  forceAuth?: any;
  registry?: string;
}

export class Auth {
  scopeAuthKey: string | null | boolean;
  regKey: string | boolean;
  authKey: string | null;
  token: string | null;
  auth: string | null;
  isBasicAuth: boolean;
  cert: string | null;
  key: string | null;

  constructor({
    token,
    auth,
    username,
    password,
    scopeAuthKey,
    certfile,
    keyfile,
    regKey,
    authKey,
  }: {
    token?: string;
    auth?: string;
    username?: string;
    password?: string;
    scopeAuthKey?: string | null | boolean;
    certfile?: string;
    keyfile?: string;
    regKey: string | boolean;
    authKey: string | null;
  }) {
    this.scopeAuthKey = typeof scopeAuthKey === 'string' ? scopeAuthKey : null;
    this.regKey = typeof regKey === 'string' ? regKey : false;
    this.authKey = authKey;
    this.token = token || null;
    this.auth = auth || null;
    this.isBasicAuth = false;
    this.cert = null;
    this.key = null;

    if (!this.token && !this.auth && username && password) {
      const decodedPassword = Buffer.from(password, 'base64').toString('utf8');
      this.auth = Buffer.from(
        `${username}:${decodedPassword}`,
        'utf8',
      ).toString('base64');
      this.isBasicAuth = true;
    }

    if (certfile && keyfile) {
      const cert = maybeReadFile(certfile);
      const key = maybeReadFile(keyfile);
      if (cert && key) {
        this.cert = cert;
        this.key = key;
      }
    }
  }
}

const regFromURI = (uri: string, opts: AuthOptions) => {
  const parsed = new URL(uri);
  let regKey = `//${parsed.host}${parsed.pathname}`;
  while (regKey.length > '//'.length) {
    const authKey = hasAuth(regKey, opts);
    if (authKey) {
      return { regKey, authKey };
    }
    regKey = regKey.replace(/([^/]+|\/)$/, '');
  }
  return { regKey: false, authKey: null };
};

const hasAuth = (regKey: string, opts: AuthOptions) => {
  if (opts[`${regKey}:_authToken`]) return '_authToken';
  if (opts[`${regKey}:_auth`]) return '_auth';
  if (opts[`${regKey}:username`] && opts[`${regKey}:_password`])
    return 'username';
  if (opts[`${regKey}:certfile`] && opts[`${regKey}:keyfile`])
    return 'certfile';
  return false;
};

const sameHost = (a: string, b: string) => {
  const parsedA = new URL(a);
  const parsedB = new URL(b);
  return parsedA.host === parsedB.host;
};

const getRegistry = (opts: AuthOptions) => {
  const { spec } = opts;
  // @ts-expect-error Error
  const { scope: specScope = {}, subSpec = {} } = spec ? npa(spec) : {};
  const subSpecScope = subSpec && subSpec.scope;
  const scope = subSpec ? subSpecScope : specScope;
  const scopeReg = scope && opts[`${scope}:registry`];
  return scopeReg || opts.registry;
};

const maybeReadFile = (file: string) => {
  try {
    return readFileSync(file, 'utf8');
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return null;
  }
};

export const getAuth = (uri: string, opts: AuthOptions = {}): Auth => {
  if (!uri) throw new Error('URI is required');

  const { forceAuth } = opts;
  const { regKey, authKey } = regFromURI(uri, forceAuth || opts);

  if (forceAuth && !regKey) {
    return new Auth({
      regKey: false,
      authKey: null,
      scopeAuthKey: null,
      token: forceAuth._authToken || forceAuth.token,
      username: forceAuth.username,
      password: forceAuth._password || forceAuth.password,
      auth: forceAuth._auth || forceAuth.auth,
      certfile: forceAuth.certfile,
      keyfile: forceAuth.keyfile,
    });
  }

  if (!regKey) {
    const registry = getRegistry(opts);
    if (registry && uri !== registry && sameHost(uri, registry)) {
      return getAuth(registry, opts);
    } else if (registry !== opts.registry) {
      const { regKey: scopeAuthKey, authKey: _authKey } = regFromURI(
        registry,
        opts,
      );
      return new Auth({
        scopeAuthKey,
        regKey: scopeAuthKey,
        authKey: _authKey,
      });
    }
  }

  const {
    [`${regKey}:_authToken`]: token,
    [`${regKey}:username`]: username,
    [`${regKey}:_password`]: password,
    [`${regKey}:_auth`]: auth,
    [`${regKey}:certfile`]: certfile,
    [`${regKey}:keyfile`]: keyfile,
  } = opts;

  return new Auth({
    scopeAuthKey: null,
    regKey,
    authKey,
    token,
    auth,
    username,
    password,
    certfile,
    keyfile,
  });
};

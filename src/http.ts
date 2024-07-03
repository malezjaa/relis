import npa from 'npm-package-arg';
import { $zap, HTTPMethod } from 'zap-fetch';
import { Project } from './project.ts';
import { Auth, getAuth } from './publish/auth.ts';

export const pickRegistry = (project: Project) => {
  const opts = project.config.npmConfig?.flat as Record<string, any>;
  const spec = npa(
    project.packageJson.name as string,
    project.packageJson.version,
  );

  let registry =
    spec.scope && opts[spec.scope.replace(/^@?/, '@') + ':registry'];

  if (!registry && opts.scope) {
    registry = opts[opts.scope.replace(/^@?/, '@') + ':registry'];
  }

  if (!registry) {
    registry = opts.registry || 'https://registry.npmjs.org/';
  }

  return registry;
};

export const getHeaders = (auth: Auth, opts: Record<string, any>) => {
  return {
    'user-agent': opts.userAgent,
    'npm-auth-type': opts.authType,
    'npm-scope': opts.scope,
    'npm-session': opts.npmSession,
    'npm-command': opts.npmCommand,
    'npm-otp': opts.otp,
    authorization: auth.token ? `Bearer ${auth.token}` : `Basic ${auth.auth}`,
    ...opts.headers,
  };
};

export const registryFetch = async (
  url: string,
  body: any,
  project: Project,
  registry: string,
  method: Lowercase<HTTPMethod>,
  _opts: Record<string, any> = {},
) => {
  const opts = project.config.npmConfig?.flat || {};
  const auth = getAuth(registry, opts);
  const headers = getHeaders(auth, opts);

  method = method.toLowerCase() as Lowercase<HTTPMethod>;
  return $zap[method](url, {
    headers,
    timeout: opts.timeout || 30 * 1000,
    retry: opts.retry ?? 0,
    integrity: opts.integrity,
    body,
    cache: opts.offline
      ? 'only-if-cached'
      : opts.preferOffline
        ? 'force-cache'
        : opts.preferOnline
          ? 'no-cache'
          : 'default',
    method: method,
    ..._opts,
  });
};

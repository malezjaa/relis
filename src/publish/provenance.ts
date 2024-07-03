import { readFile } from 'node:fs/promises';
import { env } from 'node:process';
import ciInfo from 'ci-info';
import * as ci from 'ci-info';
import { Result } from 'npm-package-arg';
import { attest, verify as verifySigstore } from 'sigstore';
import { $zap } from 'zap-fetch';

export const ensureProvenanceGeneration = async (
  registry: string,
  spec: Result,
  opts: Record<string, any>,
) => {
  const errorMessages = {
    GITHUB_ACTIONS:
      'Provenance generation in GitHub Actions requires "write" access to the "id-token" permission',
    GITLAB:
      'Provenance generation in GitLab CI requires "SIGSTORE_ID_TOKEN" with "sigstore" audience to be present in "id_tokens". For more info see:\nhttps://docs.gitlab.com/ee/ci/secrets/id_token_authentication.html',
    default:
      'Automatic provenance generation not supported for provider: ' +
      ciInfo.name,
  };

  const requiredEnvVars = {
    GITHUB_ACTIONS: 'ACTIONS_ID_TOKEN_REQUEST_URL',
    GITLAB: 'SIGSTORE_ID_TOKEN',
  };

  const ciProvider = ciInfo.GITHUB_ACTIONS
    ? 'GITHUB_ACTIONS'
    : ciInfo.GITLAB
      ? 'GITLAB'
      : 'default';

  // @ts-expect-error Error
  if (!process.env[requiredEnvVars[ciProvider]]) {
    throw Object.assign(new Error(errorMessages[ciProvider]), {
      code: 'EUSAGE',
    });
  }

  let visibility = { public: false };
  if (opts.access !== 'public') {
    try {
      const { body } = await $zap.get(
        `${registry}/-/package/${spec.escapedName}/visibility`,
        opts,
      );
      visibility = body;
    } catch (error: any) {
      if (error.code !== 'E404') {
        throw error;
      }
    }
  }

  if (
    !visibility.public &&
    opts.provenance === true &&
    opts.access !== 'public'
  ) {
    throw Object.assign(
      new Error(
        "Can't generate provenance for new or private package, you must set `access` to public.",
      ),
      { code: 'EUSAGE' },
    );
  }
};

const INTOTO_PAYLOAD_TYPE = 'application/vnd.in-toto+json';
const INTOTO_STATEMENT_V01_TYPE = 'https://in-toto.io/Statement/v0.1';
const INTOTO_STATEMENT_V1_TYPE = 'https://in-toto.io/Statement/v1';
const SLSA_PREDICATE_V02_TYPE = 'https://slsa.dev/provenance/v0.2';
const SLSA_PREDICATE_V1_TYPE = 'https://slsa.dev/provenance/v1';

const GITHUB_BUILDER_ID_PREFIX = 'https://github.com/actions/runner';
const GITHUB_BUILD_TYPE =
  'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1';

const GITLAB_BUILD_TYPE_PREFIX = 'https://github.com/npm/cli/gitlab';
const GITLAB_BUILD_TYPE_VERSION = 'v0alpha1';

interface Subject {
  name: string;
  digest: {
    sha512: string;
  };
}

const generateProvenance = async (subject: Subject[], opts: any) => {
  let payload: any;
  if (ci.GITHUB_ACTIONS) {
    const relativeRef = (env.GITHUB_WORKFLOW_REF || '').replace(
      `${env.GITHUB_REPOSITORY}/`,
      '',
    );
    const delimiterIndex = relativeRef.indexOf('@');
    const workflowPath = relativeRef.slice(0, delimiterIndex);
    const workflowRef = relativeRef.slice(delimiterIndex + 1);

    payload = {
      _type: INTOTO_STATEMENT_V1_TYPE,
      subject,
      predicateType: SLSA_PREDICATE_V1_TYPE,
      predicate: {
        buildDefinition: {
          buildType: GITHUB_BUILD_TYPE,
          externalParameters: {
            workflow: {
              ref: workflowRef,
              repository: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`,
              path: workflowPath,
            },
          },
          internalParameters: {
            github: {
              event_name: env.GITHUB_EVENT_NAME,
              repository_id: env.GITHUB_REPOSITORY_ID,
              repository_owner_id: env.GITHUB_REPOSITORY_OWNER_ID,
            },
          },
          resolvedDependencies: [
            {
              uri: `git+${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}@${env.GITHUB_REF}`,
              digest: {
                gitCommit: env.GITHUB_SHA,
              },
            },
          ],
        },
        runDetails: {
          builder: {
            id: `${GITHUB_BUILDER_ID_PREFIX}/${env.RUNNER_ENVIRONMENT}`,
          },
          metadata: {
            invocationId: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`,
          },
        },
      },
    };
  }
  if (ci.GITLAB) {
    payload = {
      _type: INTOTO_STATEMENT_V01_TYPE,
      subject,
      predicateType: SLSA_PREDICATE_V02_TYPE,
      predicate: {
        buildType: `${GITLAB_BUILD_TYPE_PREFIX}/${GITLAB_BUILD_TYPE_VERSION}`,
        builder: { id: `${env.CI_PROJECT_URL}/-/runners/${env.CI_RUNNER_ID}` },
        invocation: {
          configSource: {
            uri: `git+${env.CI_PROJECT_URL}`,
            digest: {
              sha1: env.CI_COMMIT_SHA,
            },
            entryPoint: env.CI_JOB_NAME,
          },
          parameters: env,
          environment: {
            name: env.CI_RUNNER_DESCRIPTION,
            architecture: env.CI_RUNNER_EXECUTABLE_ARCH,
            server: env.CI_SERVER_URL,
            project: env.CI_PROJECT_PATH,
            job: {
              id: env.CI_JOB_ID,
            },
            pipeline: {
              id: env.CI_PIPELINE_ID,
              ref: env.CI_CONFIG_PATH,
            },
          },
        },
        metadata: {
          buildInvocationId: `${env.CI_JOB_URL}`,
          completeness: {
            parameters: true,
            environment: true,
            materials: false,
          },
          reproducible: false,
        },
        materials: [
          {
            uri: `git+${env.CI_PROJECT_URL}`,
            digest: {
              sha1: env.CI_COMMIT_SHA,
            },
          },
        ],
      },
    };
  }
  return attest(
    Buffer.from(JSON.stringify(payload)),
    INTOTO_PAYLOAD_TYPE,
    opts,
  );
};

const verifyProvenance = async (subject: Subject, provenancePath: string) => {
  let provenanceBundle;
  try {
    provenanceBundle = JSON.parse(await readFile(provenancePath, 'utf8'));
  } catch (error) {
    const err = error as Error;
    err.message = `Invalid provenance provided: ${err.message}`;
    throw err;
  }

  const payload = extractProvenance(provenanceBundle);
  if (!payload.subject || payload.subject.length === 0) {
    throw new Error('No subject found in sigstore bundle payload');
  }
  if (payload.subject.length > 1) {
    throw new Error(
      'Found more than one subject in the sigstore bundle payload',
    );
  }

  const bundleSubject = payload.subject[0];
  if (subject.name !== bundleSubject.name) {
    throw new Error(
      `Provenance subject ${bundleSubject.name} does not match the package: ${subject.name}`,
    );
  }
  if (subject.digest.sha512 !== bundleSubject.digest.sha512) {
    throw new Error('Provenance subject digest does not match the package');
  }

  await verifySigstore(provenanceBundle);
  return provenanceBundle;
};

const extractProvenance = (bundle: any) => {
  if (!bundle?.dsseEnvelope?.payload) {
    throw new Error('No dsseEnvelope with payload found in sigstore bundle');
  }
  try {
    return JSON.parse(
      Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'),
    );
  } catch (error) {
    const err = error as Error;
    err.message = `Failed to parse payload from dsseEnvelope: ${err.message}`;
    throw err;
  }
};

export { generateProvenance, verifyProvenance };

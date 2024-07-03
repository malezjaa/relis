import Arborist from '@npmcli/arborist';
import ciInfo from 'ci-info';
import npa, { Result } from 'npm-package-arg';
import pacote from 'pacote';
import { PackageJson } from 'pkg-types';
import semver from 'semver';
import ssri from 'ssri';
import * as tar from 'tar';
import { UsageError } from '../errors.ts';
import { registryFetch } from '../http.ts';
import { Project } from '../project.ts';
import { runScript } from '../shell/scripts.ts';
import { reportTree } from '../tree.ts';
import {
  ensureProvenanceGeneration,
  generateProvenance,
  verifyProvenance,
} from './provenance.ts';

export const publish = async (
  project: Project,
  registry: string,
  spec: Result,
  access: 'public' | 'restricted',
) => {
  const opts = project.config.npmConfig?.flat;
  await runScript('prepack', project);

  const manifest = await pacote.manifest(spec.raw, opts);

  const tarball = await pacote.tarball(manifest._resolved, {
    ...opts,
    Arborist,
    integrity: manifest._integrity,
  });

  spec = npa.resolve(manifest.name, manifest.version);
  const publishOptions = {
    algorithms: ['sha512'],
    defaultTag: 'latest',
    ...opts,
    access,
    spec,
  };

  if (!spec.scope && publishOptions.access === 'restricted') {
    throw new UsageError(
      'You cannot publish a restricted package without a scope.',
    );
  }

  project.packageJson._nodeVersion = process.versions.node;

  const semverVersion = semver.clean(project.version as string);
  if (!semverVersion) {
    throw new UsageError(`Invalid version number: \`${project.version}\``);
  }

  const contents = await getContents(manifest, tarball);

  project.logger.info('Tarball contents:');
  reportTree(contents);

  console.log('');
  project.logger.info('Tarball details:');
  project.logger.info(`Name:        \`${contents.name}\``);
  project.logger.info(`Version:     \`${contents.version}\``);
  project.logger.info(`Shasum:      \`${contents.shasum}\``);
  project.logger.info(`Total files: \`${contents.files.length}\``);
  project.logger.info(
    `Integrity:  \` ${contents.integrity.toString().slice(0, 20)}[...]${contents.integrity.toString().slice(80)}\``,
  );

  const { metadata, transparencyLogUrl } = await getMetadata(
    manifest,
    tarball,
    project,
    contents._integrity,
    registry,
    spec,
    publishOptions,
  );

  try {
    await registryFetch(
      `${registry}/${spec.escapedName}`,
      metadata,
      project,
      registry,
      'put',
      publishOptions,
    );
  } catch (error: any) {
    const cause = error?.body.error;
    throw new UsageError(cause ?? `Failed to publish: \`${spec.raw}\``);
  }
};

const TLOG_BASE_URL = 'https://search.sigstore.dev/';

export const getMetadata = async (
  manifest: PackageJson,
  tarballData: Buffer,
  project: Project,
  integrity: Record<string, any>,
  registry: string,
  spec: Result,
  publishOptions: Record<string, any>,
) => {
  const opts = publishOptions || {};
  const { access, defaultTag, provenance, provenanceFile } = opts;
  const root: Record<string, any> = {
    _id: manifest.name,
    name: manifest.name,
    description: manifest.description,
    'dist-tags': {},
    versions: {},
    access,
  };

  root.versions[manifest.version as any] = manifest;
  const tag = manifest.tag || defaultTag;
  root['dist-tags'][tag] = manifest.version;

  const tarballName = `${manifest.name}-${manifest.version}.tgz`;
  const provenanceBundleName = `${manifest.name}-${manifest.version}.sigstore`;
  const tarballURI = `${manifest.name}/-/${tarballName}`;

  manifest._id = `${manifest.name}@${manifest.version}`;
  manifest.dist = { ...manifest.dist };
  manifest.dist.integrity = integrity.sha512[0].toString();
  manifest.dist.shasum = integrity.sha1[0].hexDigest();

  manifest.dist.tarball = new URL(tarballURI, registry).href.replace(
    /^https:\/\//,
    'http://',
  );

  root._attachments = {};
  root._attachments[tarballName] = {
    content_type: 'application/octet-stream',
    data: tarballData.toString('base64'),
    length: tarballData.length,
  };

  let transparencyLogUrl;
  if (provenance === true || provenanceFile) {
    let provenanceBundle;
    const subject = {
      // @ts-expect-error Error
      name: npa.toPurl(spec) as string,
      digest: { sha512: integrity.sha512[0].hexDigest() },
    };

    if (provenance === true) {
      await ensureProvenanceGeneration(registry, spec, opts);
      provenanceBundle = await generateProvenance([subject], opts);

      project.logger.info(
        `Signed provenance statement with source and build information from ${ciInfo.name}`,
      );

      const tlogEntry = provenanceBundle?.verificationMaterial?.tlogEntries[0];
      if (tlogEntry) {
        transparencyLogUrl = `${TLOG_BASE_URL}?logIndex=${tlogEntry.logIndex}`;
        project.logger.info(
          `Provenance statement published to transparency log: ${transparencyLogUrl}`,
        );
      }
    } else {
      provenanceBundle = await verifyProvenance(subject, provenanceFile);
    }

    const serializedBundle = JSON.stringify(provenanceBundle);
    root._attachments[provenanceBundleName] = {
      content_type: provenanceBundle.mediaType,
      data: serializedBundle,
      length: serializedBundle.length,
    };
  }

  return {
    metadata: root,
    transparencyLogUrl,
  };
};

export const getContents = async (manifest: PackageJson, tarball: Buffer) => {
  const files: any[] = [];
  const bundled = new Set();
  let totalEntries = 0;
  let totalEntrySize = 0;

  tar
    .t({
      onentry(entry) {
        totalEntries++;
        totalEntrySize += entry.size;
        const p = entry.path;
        if (
          p.startsWith('package/node_modules/') &&
          p !== 'package/node_modules/'
        ) {
          const name = p.split('/')[2];
          bundled.add(name);
        }

        files.push({
          path: entry.path.replace(/^package\//, ''),
          size: entry.size,
          mode: entry.mode,
        });
      },
    })
    .end(tarball);

  const integrity = ssri.fromData(tarball, { algorithms: ['sha1', 'sha512'] });
  // @ts-expect-error Error
  const shasum = integrity.sha1[0].hexDigest();

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    id: manifest._id || `${manifest.name}@${manifest.version}`,
    name: manifest.name,
    version: manifest.version,
    size: tarball.length,
    unpackedSize: totalEntrySize,
    shasum,
    integrity: ssri.parse(integrity.sha512[0]),
    filename: `${manifest.name?.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`,
    files,
    entryCount: totalEntries,
    bundled: [...bundled],
    _integrity: integrity,
  };
};

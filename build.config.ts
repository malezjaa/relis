import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
  entries: [
    {
      input: 'src/cli.ts',
      format: 'esm',
    },
  ],
  externals: ['sigstore'],
  failOnWarn: false,
});

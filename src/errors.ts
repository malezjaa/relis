export class MissingWorkspaceError extends Error {
  constructor() {
    super(
      'No package.json found in the current directory or any of its parents.',
    );

    this.name = 'MissingWorkspaceError';
  }
}

export class UsageError extends Error {
  constructor(message: string) {
    super();
    this.stack = undefined;
    this.name = 'UsageError';
    this.message = message;
  }
}

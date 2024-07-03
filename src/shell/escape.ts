export const cmdEscape = (input: string, doubleEscape: boolean): string => {
  if (input.length === 0) {
    return '""';
  }

  let result: string;
  if (/[\t\n\v "]/.test(input)) {
    result = '"';
    for (let i = 0; i <= input.length; ++i) {
      let slashCount = 0;
      while (input[i] === '\\') {
        ++i;
        ++slashCount;
      }

      if (i === input.length) {
        result += '\\'.repeat(slashCount * 2);
        break;
      }

      if (input[i] === '"') {
        result += '\\'.repeat(slashCount * 2 + 1);
        result += input[i];
      } else {
        result += '\\'.repeat(slashCount);
        result += input[i];
      }
    }
    result += '"';
  } else {
    result = input;
  }

  result = result.replaceAll(/[ !"%&()<>^|]/g, '^$&');
  if (doubleEscape) {
    result = result.replaceAll(/[ !"%&()<>^|]/g, '^$&');
  }

  return result;
};

export const shEscape = (input: string): string => {
  if (input.length === 0) {
    return "''";
  }

  if (!/[\t\n\r "#$&'()*;<>?\\`|~]/.test(input)) {
    return input;
  }

  return `'${input.replaceAll("'", String.raw`'\''`)}'`
    .replace(/^(?:'')+(?!$)/, '')
    .replaceAll(String.raw`\'''`, String.raw`\'`);
};

const func = (a: number, b: number) => {
  return a + b;
};

const hello1 = (name: string) => {
  return `Hello ${name}, ${func(1, 2)}`;
};

export { hello1, func };

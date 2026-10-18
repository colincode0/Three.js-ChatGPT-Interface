// Development logging helper - no-op in production builds
const isDev = process.env.NODE_ENV === "development";

export const devLog = (...args: unknown[]) => {
  if (isDev) console.log(...args);
};

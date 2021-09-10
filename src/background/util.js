function getLastError() {
  if (typeof chrome !== 'undefined' && chrome.extension) {
    return chrome.extension.lastError;
  } else {
    return undefined;
  }
}

/**
 * @template T
 * @typedef {(result: T) => void} Callback
 */

/**
 * Converts an async Chrome API which accepts a callback into a Promise-returning
 * version.
 *
 * @example
 *   const apiFn = promisify(chrome.someModule.aFunction);
 *   apiFn(arg1, arg2)
 *     .then(result => { ... })
 *     .catch(err => { ... })
 *
 * @template {any[]} Args
 * @template Result
 * @param {(...args: [...Args, Callback<Result>]) => void} fn -
 *   Chrome API function that takes a result callback as the last argument.
 *   When the callback is invoked, `chrome.extension.lastError` is used to
 *   check if the call succeeded and resolve or reject the promise.
 * @return {(...args: Args) => Promise<Result>}
 */
export function promisify(fn) {
  /** @param {Args} args */
  return (...args) => {
    return new Promise((resolve, reject) => {
      fn(...args, (/** @type {Result} */ result) => {
        const lastError = getLastError();
        if (lastError) {
          reject(lastError);
        } else {
          resolve(result);
        }
      });
    });
  };
}

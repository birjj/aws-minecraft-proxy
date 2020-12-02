/** Promise that rejects (or resolves, if resolve=true) with the given data after the given time */
export const timeoutPromise = (time, data = undefined, resolve = false) => {
    return new Promise((res, rej) => {
        setTimeout(() => {
            if (resolve) {
                return res(data);
            }
            rej(data);
        }, time);
    });
};

"use strict";
/* Did anyone ask for a homebrew Mediawiki API implementation? No? Well you're
 * getting one anyway. */

class MediawikiError extends Error {
    constructor(code, info) {
        super(`${code}: ${info}`);
        this.name = "MediawikiError";
        this.code = code;
        this.info = info;
    }
}

class API {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }

    async get(options) {
        options = {
            ...options,
            format: "json",
            formatversion: 2,
            origin: "*",
        };
        for (let key in options) {
            if (Array.isArray(options[key])) {
                options[key] = "\x1F" + options[key].join("\x1F");
            } else if (options[key] === undefined) {
                delete options[key];
            }
        }

        let search = new URLSearchParams(options);
        let resp = await fetch(`${this.endpoint}?${search.toString()}`);
        let data = await resp.json();
        if (data.error) {
            throw new MediawikiError(data.error.code, data.error.info);
        }

        return data;
    }
}

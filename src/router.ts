import {useSyncExternalStore} from "react";
import type {Address, Hex} from "viem";

export type Route =
    | {name: "feed"; query: string}
    | {name: "passport"; address: Address}
    | {name: "decision"; uid: Hex}
    | {name: "verify"; uid: Hex}
    | {name: "write"}
    | {name: "notFound"; raw: string};

const UID_PATTERN = /^0x[0-9a-f]{64}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

export function parseRoute(hash: string): Route {
    if (hash === "" || hash === "#" || hash === "#/") return {name: "feed", query: ""};
    const feed = /^#\/feed(?:\?(.*))?$/.exec(hash);
    if (feed) return {name: "feed", query: feed[1] ?? ""};

    const passport = /^#\/(?:p|passport)\/(.+)$/.exec(hash);
    if (passport && ADDRESS_PATTERN.test(passport[1])) {
        return {name: "passport", address: passport[1].toLowerCase() as Address};
    }

    const decision = /^#\/d\/(.+)$/.exec(hash);
    if (decision && UID_PATTERN.test(decision[1])) {
        return {name: "decision", uid: decision[1].toLowerCase() as Hex};
    }

    const verify = /^#\/verify\/(.+)$/.exec(hash);
    if (verify && UID_PATTERN.test(verify[1])) {
        return {name: "verify", uid: verify[1].toLowerCase() as Hex};
    }

    if (hash === "#/write") return {name: "write"};

    return {name: "notFound", raw: hash};
}

export function routeToHash(route: Route): string {
    switch (route.name) {
        case "feed": return `#/feed${route.query ? `?${route.query}` : ""}`;
        case "passport": return `#/p/${route.address.toLowerCase()}`;
        case "decision": return `#/d/${route.uid.toLowerCase()}`;
        case "verify": return `#/verify/${route.uid.toLowerCase()}`;
        case "write": return "#/write";
        case "notFound": return route.raw;
    }
}

function subscribe(onStoreChange: () => void): () => void {
    window.addEventListener("hashchange", onStoreChange);
    return () => window.removeEventListener("hashchange", onStoreChange);
}

function currentHash(): string {
    return window.location.hash;
}

export function useRoute(): Route {
    const hash = useSyncExternalStore(subscribe, currentHash, () => "#/feed");
    return parseRoute(hash);
}
